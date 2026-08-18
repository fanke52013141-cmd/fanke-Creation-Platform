/**
 * 顶部工具栏：自动连线 / 执行画布 / 保存加载 / 模板 / 清空。
 */
import { useCallback, useState } from 'react';
import { Download, LayoutTemplate, Loader2, Play, Save, Trash2, Upload, Wand2 } from 'lucide-react';
import { executeGraph, fetchTemplates, type TemplateDef } from '../api';
import { useCanvasStore } from '../store';

const STORAGE_KEY = 'wf-canvas-project';

export default function Toolbar() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const autoConnect = useCanvasStore((s) => s.autoConnect);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);
  const loadProject = useCanvasStore((s) => s.loadProject);
  const toGraphPayload = useCanvasStore((s) => s.toGraphPayload);
  const isExecuting = useCanvasStore((s) => s.isExecuting);
  const setIsExecuting = useCanvasStore((s) => s.setIsExecuting);
  const setExecResults = useCanvasStore((s) => s.setExecResults);
  const setExecError = useCanvasStore((s) => s.setExecError);
  const [templates, setTemplates] = useState<TemplateDef[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  const handleRun = useCallback(async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setExecError(null);
    try {
      const payload = toGraphPayload();
      const res = await executeGraph(payload);
      setExecResults(res.results);
    } catch (e) {
      setExecError(e instanceof Error ? e.message : String(e));
      setExecResults(null);
    } finally {
      setIsExecuting(false);
    }
  }, [isExecuting, setIsExecuting, setExecError, toGraphPayload, setExecResults]);

  const handleSave = useCallback(() => {
    const project = { nodes, edges, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    // 同时下载为 .json 文件
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
    if (!raw) {
      setExecError('localStorage 中没有保存的项目');
      return;
    }
    try {
      const project = JSON.parse(raw);
      if (project.nodes && project.edges) {
        loadProject(project.nodes, project.edges);
      }
    } catch {
      setExecError('项目加载失败：数据损坏');
    }
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
          if (project.nodes && project.edges) {
            loadProject(project.nodes, project.edges);
          } else {
            setExecError('文件格式不正确');
          }
        } catch {
          setExecError('文件解析失败');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [loadProject, setExecError]);

  const handleTemplates = useCallback(async () => {
    if (templates.length > 0) {
      setShowTemplates(!showTemplates);
      return;
    }
    try {
      const res = await fetchTemplates();
      setTemplates(res.templates);
      setShowTemplates(true);
    } catch (e) {
      setExecError(e instanceof Error ? e.message : String(e));
    }
  }, [templates, setExecError, showTemplates]);

  const loadTemplate = useCallback(
    (tpl: TemplateDef) => {
      const rNodes = tpl.nodes.map((n) => ({
        ...n,
        type: 'generic',
        data: { ...n.data, nodeTypeId: n.nodeTypeId },
      }));
      const rEdges = tpl.edges.map((e, i) => ({
        id: `e-tpl-${i}`,
        source: e.source,
        sourceHandle: `out-${e.sourcePort}`,
        target: e.target,
        targetHandle: `in-${e.targetPort}`,
      }));
      loadProject(rNodes as any, rEdges as any);
      setShowTemplates(false);
    },
    [loadProject],
  );

  return (
    <header className="toolbar">
      <div className="toolbar__brand">🎬 无限画布</div>
      <div className="toolbar__actions">
        <button className="btn" onClick={autoConnect} title="按类型匹配自动连线（可再手动调整）">
          <Wand2 size={14} /> 自动连线
        </button>
        <button className="btn btn--primary" onClick={handleRun} disabled={isExecuting}>
          {isExecuting ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
          {isExecuting ? '执行中…' : '执行画布'}
        </button>
        <span className="toolbar__sep" />
        <button className="btn" onClick={handleTemplates} title="从模板开始">
          <LayoutTemplate size={14} /> 模板
        </button>
        {showTemplates && (
          <div className="toolbar__tpl-dropdown">
            {templates.length === 0 && <div className="toolbar__tpl-item">无可用模板</div>}
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                className="toolbar__tpl-item"
                onClick={() => loadTemplate(tpl)}
              >
                <strong>{tpl.name}</strong>
                <br />
                <small>{tpl.description}</small>
              </button>
            ))}
          </div>
        )}
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