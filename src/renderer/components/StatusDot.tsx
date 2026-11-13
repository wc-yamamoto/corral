import type { AgentStatus } from "../../shared/model";
import { STATUS_LABEL } from "../labels";

export function StatusDot({ status }: { status?: AgentStatus }) {
  if (!status) return <span className="dot dot-none" />;
  return <span className={`dot dot-${status}`} title={STATUS_LABEL[status]} />;
}
