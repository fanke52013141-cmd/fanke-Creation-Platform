/**
 * 允许 import 项目根目录的 node-defs.json（单一事实来源，位于 src 之外）。
 */
declare module '*.json' {
  const value: unknown;
  export default value;
}
