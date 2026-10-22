import { useMemo, useState, type ReactElement } from 'react';
import {
  Badge,
  CounterBadge,
  Text,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowSwapRegular,
  BoxRegular,
  CheckmarkCircleRegular,
  ChevronRightRegular,
  DocumentTextRegular,
  OrganizationRegular,
  RocketRegular,
  ShieldCheckmarkRegular,
  ShieldErrorRegular,
  SparkleRegular,
  WarningShieldRegular,
} from '@fluentui/react-icons';
import { SkillGlyph } from '../common.js';
import { evaluationStateLabel, scoreBand, skillScorePercent } from '../skillHelpers.js';
import type {
  DimensionGroupView,
  OrchestrationPatternView,
  SkillPatternView,
  SkillRubricDimension,
  SkillsGroupedView as SkillsGroupedViewModel,
  Severity,
} from '../viewTypes.js';
import { PairView, SkillDrillView } from './SkillDrill.js';

const SEV_DOT: Record<Severity, string> = {
  error: tokens.colorPaletteRedBackground3,
  warning: tokens.colorPaletteMarigoldBackground3,
  info: tokens.colorNeutralForeground3,
};

const DIM_ICON: Record<SkillRubricDimension, ReactElement> = {
  quality: <DocumentTextRegular />,
  integrity: <BoxRegular />,
  safety: <ShieldCheckmarkRegular />,
  readiness: <RocketRegular />,
};

const useStyles = makeStyles({
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
  groupName: {
    color: tokens.colorNeutralForeground2,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
    flex: '1 1 0',
    minWidth: 0,
  },
  groupRight: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalXS),
    flex: '0 0 auto',
    minWidth: 0,
    whiteSpace: 'nowrap',
  },
  groupScoreBadge: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  groupIcon: {
    display: 'flex',
    fontSize: '16px',
    color: tokens.colorNeutralForeground3,
    flex: '0 0 auto',
    minWidth: '16px',
  },
  clearRow: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  clearIcon: { fontSize: '18px', color: tokens.colorPaletteGreenForeground1, flexShrink: 0 },
  clearWarnIcon: { fontSize: '18px', color: tokens.colorPaletteMarigoldForeground1, flexShrink: 0 },
  orchGroup: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.border('1px', 'solid', tokens.colorBrandStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
    boxShadow: tokens.shadow2,
  },
  orchHead: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    width: '100%',
    backgroundColor: tokens.colorBrandBackground2,
    borderBottom: `1px solid ${tokens.colorBrandStroke2}`,
  },
  orchName: {
    color: tokens.colorBrandForeground2,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
    flex: '1 1 0',
    minWidth: 0,
  },
  orchCaption: {
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalM, 0, tokens.spacingHorizontalM),
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  groupCount: {
    display: 'flex',
    flex: '0 0 auto',
    minWidth: 0,
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
  rowTop: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    ...shorthands.gap(tokens.spacingHorizontalXS),
  },
  rowTitle: { fontWeight: tokens.fontWeightSemibold, ...shorthands.overflow('hidden'), textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowRight: { display: 'flex', alignItems: 'center', ...shorthands.gap(tokens.spacingHorizontalXS), flexShrink: 0 },

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
  fieldValue: { color: tokens.colorNeutralForeground1 },
  fixValue: { color: tokens.colorNeutralForeground2 },
  affectedHead: { display: 'flex', alignItems: 'center', ...shorthands.gap(tokens.spacingHorizontalXS) },
  chipRow: { display: 'flex', flexWrap: 'wrap', ...shorthands.gap(tokens.spacingHorizontalXS) },
  skillList: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    overflow: 'hidden',
  },
  skillRow: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.borderStyle('none'),
    backgroundColor: 'transparent',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    width: '100%',
    textAlign: 'start',
    ':last-child': { borderBottomStyle: 'none' },
  },
  skillRowClickable: { cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  skillIdentity: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 },
  skillNameRow: { display: 'flex', alignItems: 'center', ...shorthands.gap(tokens.spacingHorizontalXS) },
  skillName: { fontWeight: tokens.fontWeightSemibold },
  skillEvidence: { color: tokens.colorNeutralForeground3, fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  skillRight: { display: 'flex', alignItems: 'center', ...shorthands.gap(tokens.spacingHorizontalS), flexShrink: 0 },
  score: { fontWeight: tokens.fontWeightBold, fontVariantNumeric: 'tabular-nums' },
  overlapList: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    overflow: 'hidden',
  },
  overlapRow: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    backgroundColor: 'transparent',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'start',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':last-child': { borderBottomStyle: 'none' },
  },
  overlapPairText: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalXS),
    // Names must not shrink into each other; the evidence column absorbs the
    // remaining width instead. Without this the two skill names wrapped onto
    // separate lines and the evidence text rendered on top of them.
    flexShrink: 0,
    maxWidth: '55%',
  },
  overlapPairName: { fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  overlapEvidence: {
    color: tokens.colorNeutralForeground3,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  emptyDetail: { color: tokens.colorNeutralForeground3, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 },
});

type Styles = ReturnType<typeof useStyles>;

function AiGeneratedMarker({ size = 14 }: { size?: number }) {
  return (
    <span role="img" aria-label="AI-generated finding">
      <SparkleRegular
        aria-hidden="true"
        fontSize={size}
        color={tokens.colorBrandForeground1}
      />
    </span>
  );
}

function SevMini({ sev, count }: { sev: Severity; count: number }) {
  if (!count) return null;
  const color = sev === 'error' ? 'danger' : sev === 'warning' ? 'important' : 'informative';
  return <CounterBadge count={count} color={color} size="small" appearance="filled" />;
}

function PatternRow({
  styles,
  title,
  sev,
  showAiMarker = false,
  count,
  selected,
  onSelect,
}: {
  styles: Styles;
  title: string;
  sev: Severity;
  showAiMarker?: boolean;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
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
      <span className={styles.dot} style={{ backgroundColor: SEV_DOT[sev] }} aria-hidden="true" />
      <span className={styles.rowMain}>
        <span className={styles.rowTop}>
          {showAiMarker && <AiGeneratedMarker />}
          <span className={styles.rowTitle}>{title}</span>
        </span>
      </span>
      <span className={styles.rowRight}>
        <SevMini sev={sev} count={count} />
      </span>
    </div>
  );
}

function DimensionGroupCard({
  styles,
  group,
  selectedId,
  onSelect,
}: {
  styles: Styles;
  group: DimensionGroupView;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const clear = group.patterns.length === 0;
  const band = group.score !== null ? scoreBand(group.score) : null;
  const clearWarns = band !== null && band.color !== 'success';
  let clearMessage = 'No issues found on this dimension.';
  if (band?.color === 'success') {
    clearMessage = 'No issues found. Meets the bar on this dimension.';
  } else if (band !== null && group.score !== null) {
    clearMessage = `No specific findings, but this dimension scored ${Math.round(group.score)}% (${band.label}) — review manually.`;
  }
  return (
    <div className={styles.group} role="group" aria-label={group.label}>
      <div className={styles.groupHead}>
        <span className={styles.groupIcon} aria-hidden="true">{DIM_ICON[group.dimension]}</span>
        <span className={styles.groupName}>{group.label}</span>
        <span className={styles.groupRight}>
          {!clear && <CounterBadge count={group.patterns.length} appearance="ghost" color="informative" size="small" />}
          <Badge
            className={styles.groupScoreBadge}
            appearance="tint"
            color={band?.color ?? 'subtle'}
            size="small"
            shape="rounded"
          >
            {group.score !== null ? `${Math.round(group.score)}% · ${band!.label}` : 'Not scored'}
          </Badge>
        </span>
      </div>
      {clear ? (
        <div className={styles.clearRow}>
          {clearWarns ? (
            <WarningShieldRegular className={styles.clearWarnIcon} />
          ) : (
            <CheckmarkCircleRegular className={styles.clearIcon} />
          )}
          <span>{clearMessage}</span>
        </div>
      ) : (
        group.patterns.map((p) => (
          <PatternRow
            key={p.ruleId}
            styles={styles}
            title={p.title}
            sev={p.sev}
            count={p.instances.length}
            selected={p.ruleId === selectedId}
            onSelect={() => onSelect(p.ruleId)}
          />
        ))
      )}
    </div>
  );
}

function PatternDetail({
  styles,
  pattern,
  skillsById,
  openSkill,
  onOpenSkill,
}: {
  styles: Styles;
  pattern: SkillPatternView;
  skillsById: SkillsGroupedViewModel['skillsById'];
  openSkill: string | null;
  onOpenSkill: (id: string | null) => void;
}) {
  const drilled = openSkill ? skillsById[openSkill] : undefined;
  if (drilled) {
    return (
      <div className={styles.detail}>
        <SkillDrillView skill={drilled} backLabel={pattern.title} onBack={() => onOpenSkill(null)} />
      </div>
    );
  }
  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <Text className={styles.detailTitle} size={400}>{pattern.title}</Text>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>What this means</span>
        <Text className={styles.fieldValue}>{pattern.meaning}</Text>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>How to fix</span>
        <Text className={styles.fixValue}>{pattern.fix}</Text>
      </div>
      <div className={styles.field}>
        <span className={styles.affectedHead}>
          <span className={styles.fieldLabel}>Affected skills</span>
          <CounterBadge count={pattern.instances.length} appearance="filled" color="informative" size="small" />
        </span>
        <div className={styles.skillList}>
          {pattern.instances.map((inst) => {
            const skill = skillsById[inst.skillId];
            const clickable = !!skill;
            const pct = skill ? skillScorePercent(skill) : null;
            const band = pct !== null ? scoreBand(pct) : null;
            const notEvaluated = skill ? evaluationStateLabel(skill) : null;
            return (
              <div
                key={inst.skillId}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                className={mergeClasses(styles.skillRow, clickable && styles.skillRowClickable)}
                onClick={clickable ? () => onOpenSkill(inst.skillId) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpenSkill(inst.skillId);
                        }
                      }
                    : undefined
                }
              >
                <SkillGlyph size={18} />
                <span className={styles.skillIdentity}>
                  <span className={styles.skillNameRow}>
                    <span className={styles.skillName}>{inst.skillName}</span>
                    {inst.finding.provenance === 'ai-generated' && <AiGeneratedMarker />}
                    {skill && (
                      <Badge appearance="tint" color="subtle" size="small" shape="circular">
                        {skill.source}
                      </Badge>
                    )}
                  </span>
                  <span className={styles.skillEvidence}>{inst.evidence}</span>
                </span>
                <span className={styles.skillRight}>
                  {skill && (
                    <>
                      {pct !== null && band ? (
                        <>
                          <span className={styles.score}>{pct}%</span>
                          <Badge appearance="tint" color={band.color} shape="circular">{band.label}</Badge>
                        </>
                      ) : notEvaluated ? (
                        <Badge appearance="tint" color={notEvaluated.color} shape="circular">{notEvaluated.label}</Badge>
                      ) : null}
                      {skill.safetyFlagged && (
                        <Badge
                          appearance="tint"
                          color={skill.safetyDisposition === 'advisory' ? 'warning' : 'danger'}
                          shape="circular"
                          icon={skill.safetyDisposition === 'advisory' ? <WarningShieldRegular /> : <ShieldErrorRegular />}
                        >
                          {skill.safetyDisposition === 'advisory' ? 'Advisory' : 'Blocker'}
                        </Badge>
                      )}
                      <ChevronRightRegular className={styles.fieldValue} />
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OrchestrationDetail({
  styles,
  orch,
  skillsById,
  openPairKey,
  onOpenPair,
}: {
  styles: Styles;
  orch: OrchestrationPatternView;
  skillsById: SkillsGroupedViewModel['skillsById'];
  openPairKey: string | null;
  onOpenPair: (key: string | null) => void;
}) {
  const drilledPair = openPairKey
    ? orch.pairs.find((p) => p.id === openPairKey)
    : undefined;
  if (drilledPair) {
    return (
      <div className={styles.detail}>
        <PairView
          pair={drilledPair}
          skillsById={skillsById}
          backLabel={orch.title}
          fix={orch.fix}
          onBack={() => onOpenPair(null)}
        />
      </div>
    );
  }
  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <Text className={styles.detailTitle} size={400}>{orch.title}</Text>
        <Badge appearance="tint" color="brand" size="small" shape="rounded" icon={<OrganizationRegular />}>
          Across skills
        </Badge>
        <AiGeneratedMarker size={16} />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>What this means</span>
        <Text className={styles.fieldValue}>{orch.meaning}</Text>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>How to fix</span>
        <Text className={styles.fixValue}>{orch.fix}</Text>
      </div>
      {orch.pairs.length > 0 ? (
        <div className={styles.field}>
          <span className={styles.affectedHead}>
            <span className={styles.fieldLabel}>Overlaps</span>
            <CounterBadge count={orch.pairs.length} appearance="filled" color="brand" size="small" />
          </span>
          <div className={styles.overlapList}>
            {orch.pairs.map((pair) => {
              const key = pair.id;
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  className={styles.overlapRow}
                  onClick={() => onOpenPair(key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenPair(key);
                    }
                  }}
                >
                  <span className={styles.overlapPairText}>
                    <span className={styles.overlapPairName}>{pair.a}</span>
                    <ArrowSwapRegular className={styles.fieldValue} />
                    <span className={styles.overlapPairName}>{pair.b}</span>
                  </span>
                  <span className={styles.overlapEvidence}>{pair.evidence}</span>
                  <ChevronRightRegular className={styles.fieldValue} />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Involved skills</span>
          <div className={styles.chipRow}>
            {orch.skills.map((name) => (
              <Badge key={name} appearance="tint" color="subtle" shape="circular" icon={<SkillGlyph size={14} />}>
                {name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export interface SkillsGroupedProps {
  grouped: SkillsGroupedViewModel;
}

/**
 * Grouped-by-rubric-dimension skill evaluator with in-pane drill-down.
 * Four dimension groups are always shown (all-clear ones render a green row),
 * plus a separate brand-tinted cross-skill orchestration section.
 */
export function SkillsGrouped({ grouped }: SkillsGroupedProps) {
  const styles = useStyles();
  const { groups, orchestration, skillsById } = grouped;

  const dimPatterns = useMemo(() => groups.flatMap((g) => g.patterns), [groups]);
  const firstId = dimPatterns[0]?.ruleId ?? orchestration[0]?.ruleId ?? '';

  const [selectedId, setSelectedId] = useState<string>(firstId);
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  const [openPairKey, setOpenPairKey] = useState<string | null>(null);

  const selectedPattern = dimPatterns.find((p) => p.ruleId === selectedId);
  const selectedOrch = orchestration.find((o) => o.ruleId === selectedId);
  // Fall back to the first pattern only when nothing (pattern or orchestration) matches.
  const activePattern = selectedPattern ?? (selectedOrch ? undefined : dimPatterns[0]);

  const select = (id: string) => {
    setSelectedId(id);
    setOpenSkill(null);
    setOpenPairKey(null);
  };

  return (
    <div className={styles.split}>
      <div className={styles.list} role="list" aria-label="Weakness patterns by dimension">
        <Text className={styles.listCaption} size={200} block>
          {groups.length} rubric dimensions · always scored · worst first
        </Text>
        {groups.map((g) => (
          <DimensionGroupCard
            key={g.dimension}
            styles={styles}
            group={g}
            selectedId={selectedId}
            onSelect={select}
          />
        ))}

        {orchestration.length > 0 && (
          <div className={styles.orchGroup} role="group" aria-label="Cross-skill orchestration">
            <div className={styles.orchHead}>
              <span className={styles.groupIcon} style={{ color: tokens.colorBrandForeground2 }} aria-hidden="true">
                <OrganizationRegular />
              </span>
              <span className={styles.orchName}>Cross-skill orchestration</span>
              <span className={styles.groupCount}>
                <CounterBadge count={orchestration.length} appearance="ghost" color="brand" size="small" />
              </span>
            </div>
            <Text className={styles.orchCaption} block>
              Set-level checks across all skills, not one skill.
            </Text>
            {orchestration.map((o) => (
              <PatternRow
                key={o.ruleId}
                styles={styles}
                title={o.title}
                sev={o.sev}
                showAiMarker
                count={o.pairs.length || o.skills.length}
                selected={o.ruleId === selectedId}
                onSelect={() => select(o.ruleId)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedOrch ? (
        <OrchestrationDetail
          styles={styles}
          orch={selectedOrch}
          skillsById={skillsById}
          openPairKey={openPairKey}
          onOpenPair={setOpenPairKey}
        />
      ) : activePattern ? (
        <PatternDetail
          styles={styles}
          pattern={activePattern}
          skillsById={skillsById}
          openSkill={openSkill}
          onOpenSkill={setOpenSkill}
        />
      ) : (
        <div className={styles.detail}>
          <div className={styles.emptyDetail}>
            <Text>No issues found. Every dimension meets the bar.</Text>
          </div>
        </div>
      )}
    </div>
  );
}
