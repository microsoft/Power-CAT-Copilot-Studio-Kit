import { Badge } from '@fluentui/react-components';
import type { AgentStatus } from '../contracts/types';

export function InventoryStatusBadge({ status }: { status: AgentStatus }) {
  const color = status === 'Available'
    ? 'success'
    : status === 'Blocked'
      ? 'danger'
      : status === 'Draft'
        ? 'warning'
        : 'informative';
  return <Badge appearance="tint" color={color} shape="rounded">{status}</Badge>;
}
