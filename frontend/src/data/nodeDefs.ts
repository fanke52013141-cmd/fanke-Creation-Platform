/**
 * 节点定义注册表：从 manifests/ 目录加载所有节点定义。
 * 单一事实来源：manifests/*.json（前后端共享）。
 * 加新节点 = 在 manifests/ 加 JSON + 在后端注册 builder，前端零改动。
 */
import type { NodeManifest } from '../types';

// vite 配置将 manifests/ 目录映射为 @manifests 别名，批量导入所有 JSON
const manifestModules = import.meta.glob('/manifests/*.json', { eager: true });

/** { manifestId: NodeManifest } */
export const MANIFEST_MAP: Record<string, NodeManifest> = {};

for (const [, mod] of Object.entries(manifestModules)) {
  const m = (mod as { default: NodeManifest }).default;
  MANIFEST_MAP[m.id] = m;
}

export const ALL_MANIFESTS: NodeManifest[] = Object.values(MANIFEST_MAP).sort((a, b) => {
  const order = ['chat', 'process', 'generator', 'data', 'code', 'group', 'loop', 'branch', 'output', 'preview'];
  return order.indexOf(a.id) - order.indexOf(b.id);
});

export const getManifest = (id: string): NodeManifest | undefined => MANIFEST_MAP[id];

// 兼容旧版 store.ts 的引用（保持 NODE_DEF_MAP/getNodeDef 名字）
/** @deprecated 使用 getManifest */
export const NODE_DEF_MAP = MANIFEST_MAP;
/** @deprecated 使用 getManifest */
export const getNodeDef = getManifest as (id: string) => any;

// ============ V12 启动断言 ============

/**
 * 检查所有模板/预设引用的 manifestId 是否都在注册表中。
 * 在应用启动时调用，不通过则拒绝加载。
 */
export function checkV12(templateReferences: string[]): string[] {
  const missing = templateReferences.filter((tid) => !(tid in MANIFEST_MAP));
  if (missing.length > 0) {
    console.error(`[V12] 模板引用了不存在的 manifestId: ${missing.join(', ')}`);
  }
  return missing;
}