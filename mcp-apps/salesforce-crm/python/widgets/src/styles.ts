import type * as React from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';

// ── Styles ─────────────────────────────────────────────────────────────────
export const useStyles = makeStyles({
  shell:      { margin: '0 auto', padding: '16px', fontFamily: tokens.fontFamilyBase, fontSize: '13px', color: tokens.colorNeutralForeground1, background: tokens.colorNeutralBackground1, minHeight: '100vh', boxSizing: 'border-box' as const },
  card:       { borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.04)', overflowX: 'auto' as const, border: `1px solid ${tokens.colorNeutralStroke2}` },
  headerBar:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  formPanel:  { padding: '16px', borderLeft: `4px solid ${tokens.colorBrandBackground}` },
  formTitle:  { fontSize: '15px', fontWeight: 700 as any, marginBottom: '12px', color: tokens.colorNeutralForeground1 },
  formGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px 16px', marginBottom: '16px' },
  formActions:{ display: 'flex', gap: '12px', justifyContent: 'flex-end' },
  amount:     { fontWeight: 600 as any, fontVariantNumeric: 'tabular-nums', color: tokens.colorNeutralForeground1 },
  empty:      { padding: '20px', textAlign: 'center' as const, fontSize: '13px', color: tokens.colorNeutralForeground2 },
  mcpFooter:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', fontSize: '12px', color: tokens.colorNeutralForeground3 },
  childTable: { padding: '0 24px 12px', background: 'transparent' },
  kpiGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px', padding: '16px' },
  kpiCard:    { borderRadius: '6px', padding: '16px', textAlign: 'center' as const, border: `1px solid ${tokens.colorNeutralStroke2}` },
});

export const H_CELL: React.CSSProperties = { fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 12px', whiteSpace: 'nowrap', color: tokens.colorNeutralForeground3 };
export const D_CELL: React.CSSProperties = { padding: '8px 12px', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', verticalAlign: 'middle', color: tokens.colorNeutralForeground1 };
