import React from 'react';
import type { RequestStatus, StatusDisplayKey } from '../../models/status';
import { getStatusDisplayLabel } from '../../models/status';
import { DisplayBadge } from './DisplayBadge';

// ─────────────────────────────────────────────────────────────────────────────
// Connector request status badge. Delegates rendering to the shared DisplayBadge
// so the connector and credit slices share one pill palette (no duplicated CSS).
// ─────────────────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: RequestStatus;
}

function StatusBadgeInner({ status }: StatusBadgeProps) {
  const displayLabel = getStatusDisplayLabel(status);
  return <DisplayBadge displayKey={displayLabel as StatusDisplayKey} label={displayLabel} />;
}

export const StatusBadge = React.memo(StatusBadgeInner);

export default StatusBadge;
