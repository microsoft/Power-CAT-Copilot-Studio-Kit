import React from 'react';
import type { CreditRequestLabel } from '../../../models/status';
import { CREDIT_LABEL_TO_COLOR_KEY } from '../../../models/status';
import { DisplayBadge } from '../../../shared/components/DisplayBadge';

// ─────────────────────────────────────────────────────────────────────────────
// Copilot Credits label badge. Renders the maker-facing outcome/allocation label
// using the shared pill palette (via CREDIT_LABEL_TO_COLOR_KEY). No amounts.
// ─────────────────────────────────────────────────────────────────────────────

interface CreditStatusBadgeProps {
  label: CreditRequestLabel;
}

function CreditStatusBadgeInner({ label }: CreditStatusBadgeProps) {
  return <DisplayBadge displayKey={CREDIT_LABEL_TO_COLOR_KEY[label]} label={label} />;
}

export const CreditStatusBadge = React.memo(CreditStatusBadgeInner);

export default CreditStatusBadge;
