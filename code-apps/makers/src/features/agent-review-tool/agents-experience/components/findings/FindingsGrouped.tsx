import { useMemo, useState, type ReactElement } from 'react';
import {
  Badge,
  Link,
  Text,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  BotRegular,
  BoxRegular,
  DocumentTextRegular,
  GlobeRegular,
  OpenRegular,
  RocketRegular,
  SparkleRegular,
  TimelineRegular,
  WrenchRegular,
} from '@fluentui/react-icons';
import { SkillGlyph } from '../common';
import { ModelProviderIcon } from '../ModelProviderIcon';
import { modelProvider, type ModelProvider } from '../../services/modelDisplay';
import { severityLabel } from '../severity';
import { resolveFindingRowFocus } from './findingsGroupedModel';
import { FindingActionGuidance } from './FindingActionGuidance';
import type {
  FindingGroupView,
  FindingRowView,
  FindingView,
  FindingsGroupedView,
  Severity,
} from '../viewTypes';

const SEV_DOT: Record<Severity, string> = {
  error: tokens.colorPaletteRedBackground3,
  warning: tokens.colorPaletteMarigoldBackground3,
  info: tokens.colorNeutralForeground3,
};

/** Fluent glyph per known rule family; unknown families fall back to a document. */
function familyIcon(family: string): ReactElement {
  const f = family.toLowerCase();
  if (f.includes('skill')) return <SkillGlyph size={16} />;
  if (f.includes('instruction')) return <DocumentTextRegular />;
  if (f.includes('tool')) return <WrenchRegular />;
  if (f.includes('model')) return <BoxRegular />;
  if (f.includes('knowledge')) return <GlobeRegular />;
  if (f.includes('lifecycle')) return <TimelineRegular />;
  if (f.includes('connected') || f.includes('agent')) return <BotRegular />;
  if (f.includes('eval')) return <RocketRegular />;
  return <DocumentTextRegular />;
}

/** Foundation-model vendor for a Model-family finding title, else null. */
function findingProvider(family: string, title: string): ModelProvider {
  return family.toLowerCase().includes('model') ? modelProvider(title) : null;
}

const useStyles = makeStyles({
  wrap: { display: 'flex', flexDirection: 'column', ...shorthands.gap(tokens.spacingVerticalS) },
  split: {
    display: 'grid',
    gridTemplateColumns: 'minmax(17rem, 18rem) minmax(0, 1fr)',
    ...shorthands.gap(tokens.spacingHorizontalL),
    alignItems: 'start',
    '@media (max-width: 48rem)': {
      gridTemplateColumns: '1fr',
    },
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    ...shorthands.gap(tokens.spacingVerticalM),
  },
  listCaption: { color: tokens.colorNeutralForeground3, ...shorthands.padding(0, tokens.spacingHorizontalXXS) },
  group: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
    boxShadow: tokens.shadow2,
  },
  groupHead: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    width: '100%',
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  groupIcon: {
    display: 'flex',
    fontSize: '16px',
    color: tokens.colorNeutralForeground3,
    flex: '0 0 auto',
    minWidth: '16px',
  },
  groupName: {
    color: tokens.colorNeutralForeground2,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
    flex: '1 1 0',
    minWidth: 0,
  },
  groupCount: {
    color: tokens.colorNeutralForeground3,
    flex: '0 0 auto',
    minWidth: 0,
    whiteSpace: 'nowrap',
  },
  row: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.borderStyle('none'),
    backgroundColor: 'transparent',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    textAlign: 'start',
    cursor: 'pointer',
    width: '100%',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':last-child': { borderBottomStyle: 'none' },
  },
  rowSelected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Selected },
  },
  dot: { width: '10px', height: '10px', ...shorthands.borderRadius('999px'), flexShrink: 0 },
  rowMain: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, ...shorthands.gap('2px') },
  rowTitleLine: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    ...shorthands.gap(tokens.spacingHorizontalXS),
  },
  rowTitle: {
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    lineHeight: tokens.lineHeightBase300,
  },

  detail: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalM),
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: '420px',
    minWidth: 0,
  },
  eyebrow: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
  },
  detailHead: { display: 'flex', alignItems: 'center', ...shorthands.gap(tokens.spacingHorizontalS), flexWrap: 'wrap' },
  detailTitle: { fontWeight: tokens.fontWeightSemibold },
  field: { display: 'flex', flexDirection: 'column', ...shorthands.gap('2px') },
  fieldLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: 'uppercase',
    letterSpacing: '.03em',
  },
  fieldValue: { color: tokens.colorNeutralForeground1, maxWidth: '68ch' },
  fixValue: { color: tokens.colorNeutralForeground2, maxWidth: '68ch' },
  fact: {
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke3),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    fontSize: tokens.fontSizeBase200,
    fontFamily: tokens.fontFamilyMonospace,
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    margin: 0,
    lineHeight: 1.5,
  },
  fixStepList: { paddingInlineStart: '18px', margin: 0, display: 'flex', flexDirection: 'column', ...shorthands.gap('3px') },
  fixStepItem: { fontSize: tokens.fontSizeBase200, lineHeight: 1.5, color: tokens.colorNeutralForeground1 },
  refList: { display: 'flex', flexDirection: 'column', ...shorthands.gap(tokens.spacingVerticalS) },
  refCard: {
    display: 'flex',
    ...shorthands.gap(tokens.spacingHorizontalS),
    alignItems: 'flex-start',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    backgroundColor: tokens.colorNeutralBackground2,
  },
  refIcon: {
    width: '26px',
    height: '26px',
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  refTitle: { fontWeight: tokens.fontWeightSemibold, display: 'block', fontSize: tokens.fontSizeBase300 },
  refUrl: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, wordBreak: 'break-all' },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    ...shorthands.gap(tokens.spacingVerticalS, tokens.spacingHorizontalL),
    ...shorthands.padding(tokens.spacingVerticalS, 0, 0, 0),
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  metaKey: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, display: 'block' },
  metaValue: { fontSize: tokens.fontSizeBase200 },
  emptyDetail: { color: tokens.colorNeutralForeground3, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 },
});

type Styles = ReturnType<typeof useStyles>;

function formatSeverityCounts(counts: FindingGroupView['counts']): string {
  return (['error', 'warning', 'info'] as const)
    .filter((severity) => counts[severity] > 0)
    .map((severity) => {
      const count = counts[severity];
      const unit = severity === 'info' || count === 1 ? severity : `${severity}s`;
      return `${count} ${unit}`;
    })
    .join(' · ');
}

function FindingRow({
  styles,
  row,
  selected,
  onSelect,
}: {
  styles: Styles;
  row: FindingRowView;
  selected: boolean;
  onSelect: () => void;
}) {
  const { finding } = row;
  const provider = findingProvider(finding.family, finding.title);
  return (
    <div
      role="button"
      aria-pressed={selected}
      tabIndex={0}
      className={mergeClasses(styles.row, selected && styles.rowSelected)}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className={styles.dot} style={{ backgroundColor: SEV_DOT[finding.sev] }} aria-hidden="true" />
      <span className={styles.rowMain}>
        <span className={styles.rowTitleLine}>
          {provider && <ModelProviderIcon provider={provider} size={12} />}
          {finding.provenance === 'ai-generated' && (
            <span
              role="img"
              aria-label="AI-generated finding"
            >
              <SparkleRegular
                aria-hidden="true"
                fontSize={14}
                color={tokens.colorBrandForeground1}
              />
            </span>
          )}
          <span className={styles.rowTitle}>{finding.title}</span>
        </span>
      </span>
    </div>
  );
}

function FamilyGroupCard({
  styles,
  group,
  selectedKey,
  onSelect,
}: {
  styles: Styles;
  group: FindingGroupView;
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const provider: ModelProvider = group.family.toLowerCase().includes('model')
    ? (group.rows.map((r) => modelProvider(r.finding.title)).find(Boolean) ?? null)
    : null;
  return (
    <div className={styles.group} role="group" aria-label={group.family}>
      <div className={styles.groupHead}>
        {provider ? (
          <span className={styles.groupIcon}><ModelProviderIcon provider={provider} size={16} /></span>
        ) : (
          <span className={styles.groupIcon} aria-hidden="true">{familyIcon(group.family)}</span>
        )}
        <span className={styles.groupName}>{group.family}</span>
        <Text className={styles.groupCount} size={200}>
          {formatSeverityCounts(group.counts)}
        </Text>
      </div>
      {group.rows.map((row) => (
        <FindingRow
          key={row.key}
          styles={styles}
          row={row}
          selected={row.key === selectedKey}
          onSelect={() => onSelect(row.key)}
        />
      ))}
    </div>
  );
}

function FindingDetail({ styles, finding }: { styles: Styles; finding: FindingView }) {
  const provider = findingProvider(finding.family, finding.title);

  const references = finding.references.length
    ? finding.references
    : [{ id: finding.id, title: finding.refTitle, url: `https://${finding.refUrl}`, source: finding.source }];

  return (
    <div className={styles.detail}>
      <Text className={styles.eyebrow}>{finding.family} · {severityLabel(finding.sev)}</Text>
      <div className={styles.detailHead}>
        {provider && <ModelProviderIcon provider={provider} size={18} />}
        <Text className={styles.detailTitle} size={400}>{finding.title}</Text>
        {finding.dispositionLabel && (
          <Badge
            appearance="tint"
            color={finding.safetyDisposition === 'advisory' ? 'warning' : 'danger'}
            size="small"
          >
            {finding.dispositionLabel}
          </Badge>
        )}
      </div>

      {finding.displayFact && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Finding context (AI)</span>
          <Text className={styles.fieldValue}>{finding.displayFact}</Text>
        </div>
      )}
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Parsed fact</span>
        <pre className={styles.fact}>{finding.fact}</pre>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Impact</span>
        <Text className={styles.fieldValue}>{finding.why}</Text>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Recommendation</span>
        <Text className={styles.fixValue}>{finding.fix}</Text>
      </div>
      <FindingActionGuidance finding={finding} impact={finding.why} />
      {finding.fixSteps.length > 0 && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>How to fix</span>
          <ol className={styles.fixStepList}>
            {finding.fixSteps.map((step) => (
              <li key={step.order} className={styles.fixStepItem}>{step.action}</li>
            ))}
          </ol>
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.fieldLabel}>
          {references.length > 1 ? 'Official references' : 'Official reference'}
        </span>
        <div className={styles.refList}>
          {references.map((ref) => (
            <div key={ref.id} className={styles.refCard}>
              <span className={styles.refIcon} aria-hidden="true"><OpenRegular /></span>
              <span>
                <Text className={styles.refTitle}>{ref.title}</Text>
                <Link href={ref.url} target="_blank" rel="noreferrer">
                  <span className={styles.refUrl}>{ref.url.replace(/^https?:\/\//, '')}</span>
                </Link>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.metaGrid}>
        <div>
          <Text className={styles.metaKey}>Detection</Text>
          <Text className={styles.metaValue}>{finding.how}</Text>
        </div>
        <div>
          <Text className={styles.metaKey}>Reference source</Text>
          <Text className={styles.metaValue}>{finding.source}</Text>
        </div>
      </div>
    </div>
  );
}

export interface FindingsGroupedProps {
  grouped: FindingsGroupedView;
  /** Stable row locator or rule id to preselect during a cross-tab jump. */
  focusFindingId?: string | null;
}

/**
 * Grouped-by-family review findings with an in-pane detail pane. The left rail
 * lists findings inside bordered family cards; selecting one shows its full
 * evidence inline (fact, why, recommendation, fix steps, references, meta).
 */
export function FindingsGrouped({ grouped, focusFindingId }: FindingsGroupedProps) {
  const styles = useStyles();
  const rows = useMemo(() => grouped.groups.flatMap((g) => g.rows), [grouped]);

  const [selectedKey, setSelectedKey] = useState<string>(
    () => resolveFindingRowFocus(rows, focusFindingId) ?? rows[0]?.key ?? '',
  );

  // Honour a cross-tab jump to a specific finding id. Adjusting state during
  // render (rather than in an effect) is the React-recommended pattern for
  // reacting to a changed prop and avoids a cascading re-render.
  const [prevFocus, setPrevFocus] = useState(focusFindingId);
  if (focusFindingId !== prevFocus) {
    setPrevFocus(focusFindingId);
    const key = resolveFindingRowFocus(rows, focusFindingId);
    if (key) setSelectedKey(key);
  }

  // Derive the active finding, falling back to the first row when the current
  // selection is no longer present (e.g. after a severity filter change).
  const selectedRow = rows.find((r) => r.key === selectedKey) ?? rows[0];
  const selected = selectedRow?.finding;

  return (
    <div className={styles.wrap}>
      <Text className={styles.listCaption} size={200} block>
        {grouped.groups.length} families · worst first
      </Text>
      <div className={styles.split}>
        <div className={styles.list} role="list" aria-label="Findings by family">
          {grouped.groups.map((g) => (
            <FamilyGroupCard
              key={g.family}
              styles={styles}
              group={g}
              selectedKey={selectedRow?.key ?? ''}
              onSelect={setSelectedKey}
            />
          ))}
        </div>

        {selected ? (
          <FindingDetail key={selectedRow?.key} styles={styles} finding={selected} />
        ) : (
          <div className={styles.detail}>
            <div className={styles.emptyDetail}>
              <Text>No findings match this filter.</Text>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
