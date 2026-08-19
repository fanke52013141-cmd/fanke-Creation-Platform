/**
 * 顶部工具栏：执行全部 / 执行选中 / 保存加载 / 清空。
 * 支持框选执行：选中部分节点后点"执行选中"只运行子图。
 */
import { useCallback } from 'react';
import { Download, Loader2, Play, Save, Trash2, Upload, PlaySquare } from 'lucide-react';
import { executeGraph } from '../api';
import { useCanvasStore } from '../store';
import type { NodeInstance, ControlLink } from '../types';

const STORAGE_KEY = 'wf-canvas-project';

export default function Toolbar() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);
  const loadProject = useCanvasStore((s) => s.loadProject);
  const isExecuting = useCanvasStore((s) => s.isExecuting);
  const setIsExecuting = useCanvasStore((s) => s.setIsExecuting);
  const setExecResults = useCanvasStore((s) => s.setExecResults);
  const setExecError = useCanvasStore((s) => s.setExecError);
  const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
  const getSelectedGraph = useCanvasStore((s) => s.getSelectedGraph);

  const buildGraph = useCallback((nodeIds: string[]) => {
    const nodeSet = new Set(nodeIds);
    const filteredNodes = nodes.filter((n) => nodeSet.has(n.id));
    const filteredEdges = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
    return {
      schemaVersion: '2.1' as const,
      nodes: filteredNodes.map((n) => ({
        id: n.id,
        manifestId: n.data.nodeTypeId,
        name: n.data.nodeTypeId,
        position: { x: n.position.x, y: n.position.y },
        inputs: {},
        config: (n.data as Record<string, unknown>).config ?? {},
        state: undefined,
      }) as NodeInstance),
      links: [] as ControlLink[],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  }, [nodes, edges]);

  const handleRunAll = useCallback(async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setExecError(null);
    try {
      const graph = buildGraph(nodes.map((n) => n.id));
      const res = await executeGraph(graph);
      setExecResults(res.results as Record<string, unknown>);
    } catch (e) {
      setExecError(e instanceof Error ? e.message : String(e));
      setExecResults(null);
    } finally {
      setIsExecuting(false);
    }
  }, [isExecuting, nodes, buildGraph, setIsExecuting, setExecError, setExecResults]);

  const handleRunSelected = useCallback(async () => {
    if (isExecuting || selectedNodeIds.length === 0) return;
    setIsExecuting(true);
    setExecError(null);
    try {
      const graph = buildGraph(selectedNodeIds);
      const res = await executeGraph(graph);
      // 把结果回写到节点 data 中，让 NodeRenderer 显示
      const results = res.results as Record<string, unknown>;
      if (results) {
        const store = useCanvasStore.getState();
        for (const [nodeId, output] of Object.entries(results)) {
          const node = store.nodes.find((n) => n.id === nodeId);
          if (node) {
            const outData = output as Record<string, unknown>;
            const status = outData?.status as string || 'done';
            store.updateNodeData(nodeId, '_status', status);
            store.updateNodeData(nodeId, '_outputs', outData?.outputs || {});
          }
        }
      }
      setExecResults(results);
    } catch (e) {
      setExecError(e instanceof Error ? e.message : String(e));
      setExecResults(null);
    } finally {
      setIsExecuting(false);
    }
  }, [isExecuting, selectedNodeIds, buildGraph, setIsExecuting, setExecError, setExecResults]);

  const handleSave = useCallback(() => {
    const project = { nodes, edges, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `无限画布-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  const handleLoad = useCallback(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { setExecError('localStorage 中没有保存的项目'); return; }
    try {
      const project = JSON.parse(raw);
      if (project.nodes && project.edges) loadProject(project.nodes, project.edges);
    } catch { setExecError('项目加载失败：数据损坏'); }
  }, [loadProject, setExecError]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const project = JSON.parse(reader.result as string);
          if (project.nodes && project.edges) loadProject(project.nodes, project.edges);
          else setExecError('文件格式不正确');
        } catch { setExecError('文件解析失败'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [loadProject, setExecError]);

  return (
    <header className="toolbar">
      <div className="toolbar__brand">🎬 无限画布</div>
      <div className="toolbar__actions">
        <button className="btn btn--primary" onClick={handleRunAll} disabled={isExecuting}>
          {isExecuting ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
          {isExecuting ? '执行中…' : '执行全部'}
        </button>
        <button
          className="btn"
          onClick={handleRunSelected}
          disabled={isExecuting || selectedNodeIds.length === 0}
          title="框选节点后执行选中部分"
        >
          {isExecuting ? <Loader2 size={14} className="spin" /> : <PlaySquare size={14} />}
          {`执行选中${selectedNodeIds.length > 0 ? ` (${selectedNodeIds.length})` : ''}`}
        </button>
        <span className="toolbar__sep" />
        <button className="btn" onClick={handleSave} title="保存到本地（.json 文件下载 + localStorage）">
          <Save size={14} /> 保存
        </button>
        <button className="btn" onClick={handleLoad} title="从 localStorage 加载">
          <Download size={14} /> 加载
        </button>
        <button className="btn" onClick={handleImport} title="从 .json 文件导入">
          <Upload size={14} /> 导入
        </button>
        <span className="toolbar__sep" />
        <button className="btn btn--danger" onClick={clearCanvas}>
          <Trash2 size={14} /> 清空
        </button>
      </div>
    </header>
  );
}