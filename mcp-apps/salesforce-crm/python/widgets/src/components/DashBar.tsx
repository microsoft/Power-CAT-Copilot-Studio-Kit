import React from 'react';
import { slds } from '../theme';

// ── DashBar (horizontal bar for analytics) ────────────────────────────────
export function DashBar({ label, value, max, color, theme }: { label: string; value: number; max: number; color: string; theme: 'light' | 'dark' }) {
  const t = slds(theme);
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: t.textWeak, marginBottom: '3px' }}>
        <span id={`dashbar-label-${label.replace(/\s+/g, '-').toLowerCase()}`}>{label}</span><span style={{ fontWeight: 600, color: t.text }}>{value.toLocaleString()}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label}: ${value.toLocaleString()} of ${max.toLocaleString()}`}
        style={{ height: '12px', background: t.border, borderRadius: '6px', overflow: 'hidden' }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '6px', transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

