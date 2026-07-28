import React from 'react';
import { Badge, Text, tokens } from '@fluentui/react-components';
import { DataBarVerticalRegular } from '@fluentui/react-icons';
import { ExpandButton } from '@gtc/mcp-shared';
import { fmt$ } from '../constants';
import { DashBar } from '../components/DashBar';
import { SldsFooter } from '../components/SldsFooter';
import { useStyles } from '../styles';
import { slds } from '../theme';
import type { SalesDashboardData } from '../types';

// ── SalesDashboardView ─────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
export function SalesDashboardView({ data, theme }: { data: SalesDashboardData; theme: 'light' | 'dark' }) {
  const styles = useStyles();
  const t = slds(theme);
  const maxAmt = Math.max(...(data.pipeline_by_stage || []).map((s: any) => s.amount || 0), 1);

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <DataBarVerticalRegular style={{ fontSize: '20px', color: t.brand }} />
          <div style={{ fontSize: '14px', fontWeight: 700, color: tokens.colorNeutralForeground1 }}>
            <Text as="h2" size={400} weight="bold" style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit' }}>Sales Dashboard</Text>
          </div>
          <Badge appearance="tint" color="informative" size="small">
            {(data.top_accounts || []).length} records
          </Badge>
        </div>
        <ExpandButton />
      </div>

      <div style={{ padding: '24px' }}>
        {/* KPI Cards */}
        <div role="region" aria-label="Key metrics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Closed Won', value: fmt$(data.closed_won_this_month), color: tokens.colorPaletteGreenForeground1 },
            { label: 'Closed Lost', value: fmt$(data.closed_lost_this_month), color: tokens.colorPaletteRedForeground1 },
            { label: 'Pipeline Stages', value: String(data.pipeline_by_stage?.length || 0), color: tokens.colorBrandForeground1 },
          ].map(k => (
            <div key={k.label} role="group" aria-label={`${k.label}: ${k.value}`} style={{ borderRadius: '8px', padding: '16px', background: tokens.colorNeutralBackground1, textAlign: 'center', border: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', marginBottom: '6px' }}>{k.label}</Text>
              <Text size={500} weight="bold" style={{ color: k.color }}>{k.value}</Text>
            </div>
          ))}
        </div>

        {/* Pipeline by Stage + Top Accounts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div role="region" aria-label="Pipeline by stage breakdown">
            <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '12px' }}>
              Pipeline by Stage (Amount)
            </Text>
            {(data.pipeline_by_stage || []).map((s: any) => (
              <DashBar key={s.stage} label={s.stage} value={s.amount || 0} max={maxAmt} color={tokens.colorBrandBackground} theme={theme} />
            ))}
          </div>
          <div role="region" aria-label="Top accounts by revenue">
            <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '12px' }}>
              Top Accounts
            </Text>
            {(data.top_accounts || []).map((a: any, i: number) => (
              <div key={a.id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${t.border}`, fontSize: '13px' }}>
                <Text size={300} style={{ color: tokens.colorNeutralForeground1 }}>{a.name}</Text>
                <Text size={300} weight="semibold" style={{ color: tokens.colorBrandForeground1 }}>{fmt$(a.amount)}</Text>
              </div>
            ))}
          </div>
        </div>
      </div>
      <SldsFooter theme={theme} />
    </div>
  );
}
