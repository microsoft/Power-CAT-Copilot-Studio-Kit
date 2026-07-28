import React from 'react';
import { getStatusKey, STATUS_STYLES } from '../constants';

// ── StatusPill ─────────────────────────────────────────────────────────────
export function StatusPill({ status, theme: _theme }: { status: string; theme: 'light' | 'dark' }) {
  const key = getStatusKey(status);
  const s = STATUS_STYLES[key] || STATUS_STYLES.open;
  return (
    <span role="status" aria-label={`Status: ${status || 'Unknown'}`} style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, background: s.background, color: s.color, border: `1px solid ${s.border}` }}>
      {status || '—'}
    </span>
  );
}

