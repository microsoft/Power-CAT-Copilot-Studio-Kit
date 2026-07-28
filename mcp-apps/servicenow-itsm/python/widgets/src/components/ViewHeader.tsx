import React from 'react';
import { Badge, Button, tokens } from '@fluentui/react-components';
import { AddRegular, ArrowSyncRegular } from '@fluentui/react-icons';
import { ExpandButton } from '@gtc/mcp-shared';
import { timeAgo } from '../theme';

// ── Shared ViewHeader (Fluent 2 — neutral bg, brand icon, cache pill + refresh) ──
export function ViewHeader({ icon, title, count, brand, onNew, newLabel, cacheInfo, onRefresh, refreshing }: {
  icon: React.ReactNode;
  title: string;
  count: number;
  brand: string;
  onNew?: () => void;
  newLabel?: string;
  cacheInfo?: { hit: boolean; cached_at: string } | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: `color-mix(in srgb, ${brand} 10%, ${tokens.colorNeutralBackground1})`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '18px', color: brand }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: tokens.colorNeutralForeground1 }}>{title}</h2>
        <Badge appearance="tint" color="informative" size="small">
          {count} record{count !== 1 ? 's' : ''}
        </Badge>
        {cacheInfo && (
          <span style={{ fontSize: '12px', color: tokens.colorNeutralForeground3, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {cacheInfo.hit ? `cached ${timeAgo(cacheInfo.cached_at)}` : `live ${timeAgo(cacheInfo.cached_at)}`}
            {onRefresh && (
              <Button appearance="subtle" size="small" icon={<ArrowSyncRegular />} onClick={onRefresh} disabled={refreshing} title="Force refresh from ServiceNow" aria-label="Refresh data" />
            )}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {onNew && (
          <Button appearance="primary" size="small" icon={<AddRegular />} onClick={onNew}>
            {newLabel || 'New'}
          </Button>
        )}
        <ExpandButton />
      </div>
    </div>
  );
}
