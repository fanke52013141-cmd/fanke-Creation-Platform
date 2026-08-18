/**
 * 审查节点审批面板（MVP-P4）：通过 / 驳回 + 备注。
 * 决策写入 node.data.reviewDecision，runtime 优先读取。
 * 驳回时提示用户修改上游节点（onRejectNodeId），然后重新执行。
 */
import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import type { Node } from '@xyflow/react';

import { useCanvasStore } from '../store';
import { getNodeDef } from '../data/nodeDefs';
import type { CanvasNodeData } from '../types';

interface ReviewDecision {
  approved: boolean;
  reason?: string;
}

export default function ReviewPanel({ node }: { node: Node<CanvasNodeData> }) {
  const def = getNodeDef(node.data.nodeTypeId);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const existingDecision = (node.data as Record<string, unknown>).reviewDecision as ReviewDecision | undefined;
  const [approved, setApproved] = useState<boolean | null>(existingDecision?.approved ?? null);
  const [reason, setReason] = useState(existingDecision?.reason ?? '');

  const onApprove = () => {
    setApproved(true);
    updateNodeData(node.id, 'reviewDecision', { approved: true, reason: '' });
  };

  const onReject = () => {
    setApproved(false);
    updateNodeData(node.id, 'reviewDecision', { approved: false, reason });
  };

  const onReset = () => {
    setApproved(null);
    setReason('');
    updateNodeData(node.id, 'reviewDecision', null);
  };

  const rejectNodeId = def?.onRejectNodeId;
  const rejectNodeDef = rejectNodeId ? getNodeDef(rejectNodeId) : undefined;

  return (
    <aside className="review-panel">
      <div className="review-panel__header">
        <div className="review-panel__title">✅ 审查</div>
        <div className="review-panel__sub">{def?.name ?? '审查节点'}</div>
      </div>

      <div className="review-panel__body">
        {approved === null ? (
          <div className="review-panel__status pending">⏳ 待审批</div>
        ) : approved ? (
          <div className="review-panel__status approved">✅ 已通过</div>
        ) : (
          <div className="review-panel__status rejected">❌ 已驳回</div>
        )}

        {rejectNodeDef && (
          <div className="review-panel__info">
            驳回回退到：<strong>{rejectNodeDef.name}</strong>
          </div>
        )}

        <div className="review-panel__actions">
          <button
            className="btn btn--approve"
            onClick={onApprove}
            disabled={approved === true}
          >
            <CheckCircle size={15} /> 通过
          </button>
          <button
            className="btn btn--reject"
            onClick={onReject}
            disabled={approved === false}
          >
            <XCircle size={15} /> 驳回
          </button>
        </div>

        <label className="review-panel__reason">
          <span>驳回原因（可选）</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="驳回时填写原因，说明需要修改什么"
          />
        </label>

        {approved !== null && (
          <button className="btn" onClick={onReset}>
            重置审批
          </button>
        )}
      </div>
    </aside>
  );
}