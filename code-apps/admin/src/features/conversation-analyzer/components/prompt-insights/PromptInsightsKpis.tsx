/** KPI strip for the Prompt insights tab (PI-3). */

import { makeStyles, tokens } from '@fluentui/react-components';
import { KpiStrip, type KpiStripTile } from '../shared/KpiStrip';
import { usePromptsKpis, type PromptsKpis } from '../../hooks/usePromptsKpis';
import { ShareRing, Sparkline } from './KpiVisuals';
import { formatRelativeTime } from './promptInsightsUtils';

const useStyles = makeStyles({
  deltaUp: { color: tokens.colorPaletteGreenForeground1, fontWeight: tokens.fontWeightSemibold },
  deltaDown: { color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  deltaFlat: { color: tokens.colorNeutralForeground3 },
  mostUsed: {
    display: 'inline-block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    verticalAlign: 'bottom',
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
  },
});

function useTiles(kpis: PromptsKpis | undefined): KpiStripTile[] {
  const styles = useStyles();
  const k = kpis;
  const delta = k?.deltaPct;
  const deltaNode = delta == null ? undefined : (
    <span className={delta > 0 ? styles.deltaUp : delta < 0 ? styles.deltaDown : styles.deltaFlat}>
      {delta > 0 ? '↑' : delta < 0 ? '↓' : ''} {Math.abs(delta)}%
    </span>
  );

  return [
    {
      id: 'total-runs',
      label: 'Total runs',
      value: (k?.totalRuns ?? 0).toLocaleString(),
      valueSuffix: deltaNode,
      visual: k ? <Sparkline values={k.dailyRuns} /> : undefined,
      description: delta == null ? `Last ${k?.periodDays ?? 0} days` : 'vs. previous period',
    },
    {
      id: 'prompts-in-use',
      label: 'Prompts in use',
      value: (k?.promptsInUse ?? 0).toLocaleString(),
      valueSuffix: `of ${(k?.totalPrompts ?? 0).toLocaleString()}`,
      description: k && k.totalPrompts > k.promptsInUse
        ? `${(k.totalPrompts - k.promptsInUse).toLocaleString()} never run in this period`
        : 'All prompts ran in this period',
    },
    {
      id: 'most-used',
      label: 'Most used',
      value: k?.mostUsed ? <span className={styles.mostUsed} title={k.mostUsed.name}>{k.mostUsed.name}</span> : '—',
      visual: k?.mostUsed ? <ShareRing pct={k.mostUsed.sharePct} /> : undefined,
      description: k?.mostUsed
        ? `${k.mostUsed.sharePct}% of runs · ${k.mostUsed.runs.toLocaleString()} ${k.mostUsed.runs === 1 ? 'run' : 'runs'}`
        : 'No runs in this period',
    },
    {
      id: 'avg-runs',
      label: 'Avg runs per prompt',
      value: (k?.avgRunsPerPrompt ?? 0).toLocaleString(),
      valueSuffix: 'per prompt in use',
      description: k?.latestRun ? `Last run ${formatRelativeTime(k.latestRun.on)} · ${k.latestRun.name}` : 'No runs yet',
    },
  ];
}

export function PromptInsightsKpis() {
  const { data, isLoading } = usePromptsKpis();
  const tiles = useTiles(data);
  return <KpiStrip tiles={tiles} isLoading={isLoading} ariaLabel="Prompt insights key metrics" />;
}
