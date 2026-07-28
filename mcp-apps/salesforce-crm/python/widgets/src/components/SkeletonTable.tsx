import React from 'react';
import { tokens } from '@fluentui/react-components';

// ── SkeletonTable ──────────────────────────────────────────────────────────
export function SkeletonTable() {
  return (
    <div style={{ padding: '16px' }} role="status" aria-live="polite" aria-label="Loading data">
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}.skel{height:14px;border-radius:4px;background:linear-gradient(90deg,#e8e8e8 25%,#f5f5f5 50%,#e8e8e8 75%);background-size:200% 100%;animation:shimmer 1.5s infinite}[data-theme="dark"] .skel{background:linear-gradient(90deg,#333 25%,#444 50%,#333 75%);background-size:200% 100%}`}</style>
      <div style={{ textAlign: 'center', padding: '8px 0 16px', fontSize: '13px', color: tokens.colorNeutralForeground3 }}>
        Loading data…
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }} aria-hidden="true">
        <div className="skel" style={{ width: '200px', height: '24px' }} />
        <div className="skel" style={{ width: '80px', height: '24px' }} />
      </div>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px' }} aria-hidden="true">
          <div className="skel" style={{ width: '120px' }} />
          <div className="skel" style={{ width: '150px' }} />
          <div className="skel" style={{ width: '100px' }} />
          <div className="skel" style={{ width: '90px' }} />
        </div>
      ))}
    </div>
  );
}
