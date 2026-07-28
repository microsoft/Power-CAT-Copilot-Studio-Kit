import React from 'react';
import { tokens } from '@fluentui/react-components';
import { ShoppingBagRegular } from '@fluentui/react-icons';
import { NowFooter } from '../components/NowFooter';
import { ViewHeader } from '../components/ViewHeader';
import { useStyles } from '../styles';
import { now } from '../theme';
import type { CatalogItem } from '../types';

// ── Catalog View ────────────────────────────────────────────────────────────
export function CatalogView({ items, theme, cacheInfo }: { items: CatalogItem[]; theme: 'light' | 'dark'; cacheInfo?: { hit: boolean; cached_at: string } | null }) {
  const styles = useStyles();
  const t = now(theme);

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}`, background: t.surface }}>
      <ViewHeader icon={<ShoppingBagRegular style={{ fontSize: '18px' }} />} title="Service Catalog" count={items.length}
        brand={tokens.colorPalettePinkForeground2}
        cacheInfo={cacheInfo} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', padding: '12px' }}>
        {items.length === 0 && (
          <div className={styles.empty} style={{ gridColumn: '1 / -1', color: t.textWeak }}>
            No catalog items found.
          </div>
        )}
        {items.map(item => (
          <div key={item.sys_id} style={{
            border: `1px solid ${t.border}`, borderRadius: '6px', padding: '12px',
            background: t.surface, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: t.text, marginBottom: '4px' }}>{item.name}</div>
            <div style={{ fontSize: '11px', color: t.textWeak, marginBottom: '6px', lineHeight: 1.4 }}>{item.short_description || '—'}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: t.textWeak }}>{item.category || '—'}</span>
              <span style={{
                fontSize: '12px', fontWeight: 600,
                color: item.price ? '#2E844A' : t.textWeak,
              }}>{item.price || 'Free'}</span>
            </div>
            {(item as any).delivery_time && (
              <div style={{ fontSize: '10px', color: t.textWeak, marginTop: '4px', fontStyle: 'italic' }}>
                {(item as any).delivery_time}
              </div>
            )}
          </div>
        ))}
      </div>

      <NowFooter theme={theme} />
    </div>
  );
}
