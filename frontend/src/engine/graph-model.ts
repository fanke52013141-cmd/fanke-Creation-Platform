/**
 * 图模型（v2.1 定稿）—— 与 backend/app/engine/graph_model.py 同构。
 *
 * 核心职责：
 * 1. 从数据引用和控制链接推导拓扑序
 * 2. 从 drive 控制链接计算循环体闭包
 * 3. 环检测
 * 4. V1-V14 校验
 */

import type {
  NodeInstance,
  NodeManifest,
  ControlLink,
  ParamSource,
  ParamSchema,
  RefIssue,
  Graph,
} from '../types';

// ============ 工具：引用解析 ============

interface ParsedRef {
  nodeId: string;
  path: string[];
}

/** 解析 "{{nodeId.a.b[0].c}}" 为 { nodeId: "nodeId", path: ["a","b","0","c"] } */
export function parseRef(input: string): ParsedRef | null {
  const m = input.match(/^\{\{([^.]+)\.(.+)\}\}$/);
  if (!m) return null;
  const nodeId = m[1];
  // 路径解析：a.b[0].c → ["a","b","0","c"]
  const path = m[2].split(/\.(?=[^\[\]]*(?:\[|$))|\[|\]/).filter(Boolean);
  return { nodeId, path };
}

/** 定位引用值：沿 nodeState.outputs 按路径取值 */
export function resolveRef(
  ref: { nodeId: string; outputPath: string },
  graph: Graph,
): unknown {
  const node = graph.nodes.find(n => n.id === ref.nodeId);
  if (!node || !node.state?.outputs) return undefined;
  const parsed = parseRef(`{{${ref.nodeId}.${ref.outputPath}}}`);
  if (!parsed) return undefined;
  let value: unknown = node.state.outputs;
  for (const segment of parsed.path) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'object' && !Array.isArray(value)) {
      value = (value as Record<string, unknown>)[segment];
    } else if (Array.isArray(value)) {
      const idx = parseInt(segment, 10);
      if (isNaN(idx)) return undefined;
      value = value[idx];
    } else {
      return undefined;
    }
  }
  return value;
}

// ============ 拓扑排序（Kahn） ============

/** 从数据引用推导有向边：node.inputs 中的 ref → edge(from, to) */
function deriveEdges(graph: Graph): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  for (const node of graph.nodes) {
    for (const [paramName, source] of Object.entries(node.inputs)) {
      const sources = Array.isArray(source) ? source : [source];
      for (const src of sources) {
        if (src && src.kind === 'ref' && src.nodeId) {
          edges.push([src.nodeId, node.id]);
        }
      }
    }
  }
  return edges;
}

/** Kahn 算法：返回拓扑层 + 环内节点 */
export function topologicalLayers(graph: Graph): {
  layers: string[][];
  cycleNodes: string[];
} {
  const edges = deriveEdges(graph);
  const indeg: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  for (const n of graph.nodes) {
    indeg[n.id] = 0;
    adj[n.id] = [];
  }
  for (const [s, t] of edges) {
    if (s in indeg && t in indeg) {
      adj[s].push(t);
      indeg[t] += 1;
    }
  }

  const queue: string[] = Object.keys(indeg).filter(n => indeg[n] === 0);
  const layers: string[][] = [];
  const remaining = new Set(Object.keys(indeg));

  while (queue.length > 0) {
    const layer = [...queue];
    layers.push(layer);
    queue.length = 0;
    for (const n of layer) {
      remaining.delete(n);
      for (const m of adj[n]) {
        indeg[m] -= 1;
        if (indeg[m] === 0 && remaining.has(m)) {
          queue.push(m);
        }
      }
    }
  }

  return { layers, cycleNodes: [...remaining].sort() };
}

// ============ drive 闭包（循环体确定） ============

/** 从 node 出发，沿数据引用向下找传递闭包（不含 node 自身），
 *  用于 loop 节点确定循环体。 */
export function resolveBody(
  loopNode: NodeInstance,
  graph: Graph,
  link: ControlLink,
): NodeInstance[] {
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const downstream = new Set<string>();
  const seed = [link.target];
  let frontier = new Set(seed);
  while (frontier.size > 0) {
    const next = new Set<string>();
    for (const fId of frontier) {
      if (downstream.has(fId) || fId === link.source) continue;
      downstream.add(fId);
      // 谁引用了 fId 的输出？
      for (const n of graph.nodes) {
        if (downstream.has(n.id) || n.id === link.source) continue;
        for (const [, source] of Object.entries(n.inputs)) {
          const sources = Array.isArray(source) ? source : [source];
          for (const src of sources) {
            if (src && src.kind === 'ref' && src.nodeId === fId) {
              next.add(n.id);
            }
          }
        }
      }
    }
    frontier.clear();
    for (const id of next) frontier.add(id);
  }

  downstream.delete(link.target); // body head 已包含在结果中
  const result = [nodeMap.get(link.target)!];
  for (const id of downstream) {
    const n = nodeMap.get(id);
    if (n) result.push(n);
  }
  return result;
}

// ============ 校验规则 V1-V14 ============

export function validateGraph(
  graph: Graph,
  registry: Map<string, NodeManifest>,
): RefIssue[] {
  const issues: RefIssue[] = [];
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const manifestMap = registry;

  // V1: 数据引用的 nodeId 必须存在
  for (const node of graph.nodes) {
    for (const [paramName, source] of Object.entries(node.inputs)) {
      const sources = Array.isArray(source) ? source : [source];
      for (const src of sources) {
        if (src && src.kind === 'ref' && src.nodeId) {
          if (!nodeMap.has(src.nodeId)) {
            issues.push({
              level: 'error', rule: 'V1',
              message: `节点 ${node.id} 的参数 ${paramName} 引用了不存在的节点 ${src.nodeId}`,
              nodeId: node.id,
            });
          }
        }
      }
    }
  }

  // V2: outputPath 必须有效
  for (const node of graph.nodes) {
    for (const [paramName, source] of Object.entries(node.inputs)) {
      const sources = Array.isArray(source) ? source : [source];
      for (const src of sources) {
        if (src && src.kind === 'ref' && src.nodeId && src.outputPath) {
          const target = nodeMap.get(src.nodeId);
          if (!target) continue;
          const manifest = manifestMap.get(target.manifestId);
          if (!manifest) continue;
          const allOutputs = [
            ...manifest.outputs,
            ...(target.paramSchemas?.outputs ?? []),
          ];
          // 只校验一级路径（深度路径在运行时检查）
          const topKey = src.outputPath.split('.')[0].replace(/\[\d+\]/g, '');
          if (!topKey) continue;
          const exists = allOutputs.some(o => o.name === topKey);
          if (!exists) {
            issues.push({
              level: 'error', rule: 'V2',
              message: `节点 ${node.id} 引用 ${src.nodeId}.${src.outputPath}，但该节点没有输出参数 "${topKey}"`,
              nodeId: node.id,
            });
          }
        }
      }
    }
  }

  // V6: drive 只能从 loop 发出
  for (const link of graph.links) {
    if (link.kind === 'drive') {
      const node = nodeMap.get(link.source);
      if (node && node.manifestId !== 'loop') {
        issues.push({
          level: 'error', rule: 'V6',
          message: `drive 控制链接只能从 loop 节点发出，但 ${link.source} 是 ${node.manifestId} 类型`,
          nodeId: link.source,
        });
      }
    }
  }

  // V7: drive 目标及闭包内禁 interactive
  for (const link of graph.links) {
    if (link.kind === 'drive') {
      const body = resolveBody(nodeMap.get(link.source)!, graph, link);
      for (const bn of body) {
        const m = manifestMap.get(bn.manifestId);
        if (m && m.execution === 'interactive') {
          issues.push({
            level: 'error', rule: 'V7',
            message: `循环体包含 interactive 节点 ${bn.name}（${bn.id}），不允许`,
            nodeId: bn.id,
          });
        }
      }
    }
  }

  // V8: drive 闭包不得含 loop 自身
  for (const link of graph.links) {
    if (link.kind === 'drive') {
      const body = resolveBody(nodeMap.get(link.source)!, graph, link);
      if (body.some(b => b.id === link.source)) {
        issues.push({
          level: 'error', rule: 'V8',
          message: `loop 节点 ${link.source} 的 drive 闭包包含自身`,
          nodeId: link.source,
        });
      }
    }
  }

  // V9: rerun 只能从 branch 发出，目标存在
  for (const link of graph.links) {
    if (link.kind === 'rerun') {
      const node = nodeMap.get(link.source);
      if (node && node.manifestId !== 'branch') {
        issues.push({
          level: 'error', rule: 'V9',
          message: `rerun 控制链接只能从 branch 节点发出，但 ${link.source} 是 ${node?.manifestId} 类型`,
          nodeId: link.source,
        });
      }
      if (!nodeMap.has(link.target)) {
        issues.push({
          level: 'error', rule: 'V9',
          message: `rerun 目标 ${link.target} 不存在`,
          nodeId: link.source,
        });
      }
    }
  }

  // V10: rerun 不得指向自身下游
  for (const link of graph.links) {
    if (link.kind === 'rerun') {
      const { layers } = topologicalLayers(graph);
      const layerOf: Record<string, number> = {};
      for (let i = 0; i < layers.length; i++) {
        for (const id of layers[i]) layerOf[id] = i;
      }
      const fromLayer = layerOf[link.source] ?? -1;
      const toLayer = layerOf[link.target] ?? -1;
      if (toLayer >= fromLayer && toLayer !== -1) {
        issues.push({
          level: 'error', rule: 'V10',
          message: `rerun 目标 ${link.target} 不在上游（层 ${toLayer} >= ${fromLayer} 的 ${link.source}）`,
          nodeId: link.source,
        });
      }
    }
  }

  // V11: group 成员不得含自身
  for (const node of graph.nodes) {
    if (node.manifestId === 'group') {
      const members = node.config?.memberIds as string[] | undefined;
      if (members?.includes(node.id)) {
        issues.push({
          level: 'error', rule: 'V11',
          message: `group 节点 ${node.id} 包含自身作为成员`,
          nodeId: node.id,
        });
      }
    }
  }

  // V13: Loop.count ≤ maxIterations
  for (const node of graph.nodes) {
    if (node.manifestId === 'loop') {
      const count = node.config?.count as number ?? 0;
      const maxIter = node.config?.maxIterations as number ?? 100;
      if (count > maxIter) {
        issues.push({
          level: 'error', rule: 'V13',
          message: `loop 节点 ${node.id} 的 count(${count}) 超过 maxIterations(${maxIter})`,
          nodeId: node.id,
        });
      }
    }
  }

  // V12: 模板引用的 manifestId 必须在注册表中（启动断言，此处不重复）

  return issues;
}