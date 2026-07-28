import React from 'react';
import { tokens } from '@fluentui/react-components';

// FkHint — small footer note explaining the 🔗 lookup-field convention.
// Auto-shows when at least one EDITABLE 🔗 field is present in `fields`.
// On edit forms where FKs are read-only, the hint is suppressed (nothing to
// type). `systemName` parameterises the "Salesforce records" / "ServiceNow
// records" wording so the component is LOB-agnostic.
//
// Reference convention (per fk-alert-pattern-playbook §7a):
//   - FK input labels suffix: `(type full name) 🔗`
//   - Footer below the form's action buttons explains the behaviour
//   - Blue text via colorPaletteBlueForeground2 — matches the persistent
//     'info' toast that surfaces on miss
export function FkHint({
  fields,
  systemName,
}: {
  fields: { label: string; readonly?: boolean }[];
  systemName: string;
}) {
  if (!fields.some(f => f.label.includes('🔗') && !f.readonly)) return null;
  return (
    <div
      style={{
        marginTop: '12px',
        paddingTop: '8px',
        fontSize: '11px',
        color: tokens.colorPaletteBlueForeground2,
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        lineHeight: 1.4,
      }}
    >
      🔗 Lookup fields link to other {systemName} records. Type the full name —
      we look up on save and show suggestions if no exact match.
    </div>
  );
}
