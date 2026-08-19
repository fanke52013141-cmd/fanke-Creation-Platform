/**
 * 控制链接边渲染器（虚线，drive/rerun 链接）。
 * 与数据引用边（实线）视觉区分。
 */
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

export default function ControlLinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const linkKind = (data as { kind?: string })?.kind || 'drive';
  const label = linkKind === 'drive' ? '驱动' : '回流';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className="control-link-edge"
        style={{
          strokeDasharray: '6 3',
          strokeWidth: 2,
          stroke: linkKind === 'drive' ? '#4c5cff' : '#e67e22',
        }}
      />
      <div
        style={{
          position: 'absolute',
          fontSize: 9,
          color: linkKind === 'drive' ? '#4c5cff' : '#e67e22',
          background: '#fff',
          padding: '0 4px',
          border: `1px solid ${linkKind === 'drive' ? '#4c5cff' : '#e67e22'}`,
          borderRadius: 4,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      >
        {label}
      </div>
    </>
  );
}