// ── Skeleton Loading Shimmer ────────────────────────────────────────────────
export function SkeletonTable() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading data" style={{ padding: '16px' }}>
      <div style={{ textAlign: 'center', padding: '8px 0 16px', fontSize: '13px', color: '#636363' }}>
        Loading data…
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div className="skel" style={{ width: '220px', height: '24px' }} />
        <div className="skel" style={{ width: '80px', height: '24px' }} />
      </div>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <div className="skel" style={{ width: `${80 + (i * 10)}px` }} />
          <div className="skel" style={{ width: `${160 - (i * 8)}px` }} />
          <div className="skel" style={{ width: `${70 + (i * 5)}px` }} />
          <div className="skel" style={{ width: `${100 + (i * 12)}px` }} />
          <div className="skel" style={{ width: `${90 - (i * 6)}px` }} />
        </div>
      ))}
    </div>
  );
}
