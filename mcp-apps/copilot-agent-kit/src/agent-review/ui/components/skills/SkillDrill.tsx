import { useState } from 'react';
import {
  Badge,
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  Divider,
  Tab,
  TabList,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowSwapRegular,
  ShieldCheckmarkRegular,
  ShieldErrorRegular,
  WarningShieldRegular,
} from '@fluentui/react-icons';
import { SkillGlyph } from '../common.js';
import { SkillScoreStrip } from '../SkillScoreStrip.js';
import { dimensionBand, evaluationStateLabel, normalizedDimensionScore, scoreBand, skillScorePercent, weakestDimension } from '../skillHelpers.js';
import type { OrchestrationPairView, SkillView } from '../viewTypes.js';
import { SkillFilesExplorer } from './SkillFilesExplorer.js';

const BAND_FILL: Record<'success' | 'warning' | 'danger', string> = {
  success: tokens.colorPaletteGreenBackground3,
  warning: tokens.colorPaletteMarigoldBackground3,
  danger: tokens.colorPaletteRedBackground3,
};
const BAND_TEXT: Record<'success' | 'warning' | 'danger', string> = {
  success: tokens.colorPaletteGreenForeground1,
  warning: tokens.colorPaletteMarigoldForeground1,
  danger: tokens.colorPaletteRedForeground1,
};

const useStyles = makeStyles({
  detailTitle: { fontWeight: tokens.fontWeightSemibold },
  score: { fontWeight: tokens.fontWeightBold, fontVariantNumeric: 'tabular-nums' },
  spacer: { marginInlineStart: 'auto' },
  field: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXXS),
  },
  fieldLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: 'uppercase',
    letterSpacing: '.03em',
  },
  fixValue: { color: tokens.colorNeutralForeground2 },
  skillViewHead: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    flexWrap: 'wrap',
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalL),
    paddingBlockStart: tokens.spacingVerticalS,
  },
  dims: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    ...shorthands.gap(tokens.spacingVerticalM, tokens.spacingHorizontalXL),
  },
  dimTop: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  dimKey: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  dimScore: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200, fontVariantNumeric: 'tabular-nums' },
  dimTrack: {
    height: tokens.spacingVerticalSNudge,
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
    backgroundColor: tokens.colorNeutralStroke3,
    overflow: 'hidden',
    marginBlock: tokens.spacingVerticalXS,
  },
  dimFill: {
    display: 'block',
    height: '100%',
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
  },
  dimRationale: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  flags: { display: 'flex', alignItems: 'center', ...shorthands.gap(tokens.spacingHorizontalS), flexWrap: 'wrap' },
  overlapCallout: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke3),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
  },
  compareGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    ...shorthands.gap(tokens.spacingHorizontalM),
  },
  compareCard: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalS),
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorNeutralBackground1,
  },
  compareTop: { display: 'flex', alignItems: 'center', ...shorthands.gap(tokens.spacingHorizontalXS), flexWrap: 'wrap' },
  compareName: { fontWeight: tokens.fontWeightSemibold },
  compareDesc: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200 },
  compareWeak: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

/** In-pane rubric + files view for a single drilled skill. */
export function SkillDrillView({
  skill,
  backLabel,
  onBack,
}: {
  skill: SkillView;
  backLabel: string;
  onBack: () => void;
}) {
  const styles = useStyles();
  const [tab, setTab] = useState<'rubric' | 'files'>('rubric');
  const pct = skillScorePercent(skill);
  const band = pct !== null ? scoreBand(pct) : null;
  const notEvaluated = evaluationStateLabel(skill);

  return (
    <>
      <Breadcrumb size="small" aria-label="Pattern to skill">
        <BreadcrumbItem>
          <BreadcrumbButton onClick={onBack}>{backLabel}</BreadcrumbButton>
        </BreadcrumbItem>
        <BreadcrumbDivider />
        <BreadcrumbItem>
          <BreadcrumbButton current>{skill.name}</BreadcrumbButton>
        </BreadcrumbItem>
      </Breadcrumb>

      <div className={styles.skillViewHead}>
        <SkillGlyph size={20} />
        <Text className={styles.detailTitle} size={400}>
          {skill.name}
        </Text>
        <Badge appearance="tint" color="subtle" size="small" shape="circular">
          {skill.source}
        </Badge>
        <div className={styles.spacer} />
        {pct !== null && band ? (
          <>
            <span className={styles.score}>{pct}%</span>
            <Badge appearance="tint" color={band.color} shape="circular">
              {band.label}
            </Badge>
            {skill.evaluationState === 'partial' && (
              <Badge appearance="tint" color="warning" shape="circular">
                Partial evaluation
              </Badge>
            )}
          </>
        ) : (
          <Badge appearance="tint" color={notEvaluated.color} shape="circular">
            {notEvaluated.label}
          </Badge>
        )}
      </div>

      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as 'rubric' | 'files')}>
        <Tab value="rubric">Rubric</Tab>
        <Tab value="files">Files</Tab>
      </TabList>

      {tab === 'rubric' ? (
        <div className={styles.tabContent}>
          {skill.scores && <SkillScoreStrip scores={skill.scores} />}
          {skill.dimensions.length === 0 ? (
            <Text className={styles.dimRationale}>
              {notEvaluated.label}
              {skill.evaluationMessage && skill.evaluationMessage !== notEvaluated.label
                ? ` — ${skill.evaluationMessage}`
                : ''}
            </Text>
          ) : (
            <div className={styles.dims}>
              {skill.dimensions.map((d) => {
                const dband = dimensionBand(d.score);
                return (
                  <div key={d.key}>
                    <div className={styles.dimTop}>
                      <span className={styles.dimKey}>{d.key}</span>
                      <span className={styles.dimScore} style={{ color: BAND_TEXT[dband] }}>
                        {normalizedDimensionScore(d.score)}/10
                      </span>
                    </div>
                    <div className={styles.dimTrack} aria-hidden="true">
                      <span
                        className={styles.dimFill}
                        style={{
                          width: `${normalizedDimensionScore(d.score) * 10}%`,
                          backgroundColor: BAND_FILL[dband],
                        }}
                      />
                    </div>
                    <div className={styles.dimRationale}>{d.rationale}</div>
                  </div>
                );
              })}
            </div>
          )}
          <Divider />
          <div className={styles.flags}>
            {skill.safetyFlagged ? (
              <Badge
                appearance="tint"
                color={skill.safetyDisposition === 'advisory' ? 'warning' : 'danger'}
                shape="circular"
                icon={skill.safetyDisposition === 'advisory' ? <WarningShieldRegular /> : <ShieldErrorRegular />}
              >
                {skill.safetyDisposition === 'advisory' ? 'Prepublish advisory' : 'Security blocker'}
                {skill.safetyFindingId ? ` · ${skill.safetyFindingId}` : ''}
              </Badge>
            ) : (
              <Badge appearance="tint" color="success" shape="circular" icon={<ShieldCheckmarkRegular />}>
                Safety scan clean
              </Badge>
            )}
            <Badge appearance="tint" color="informative" shape="circular">
              {skill.sizeLabel}
            </Badge>
          </div>
        </div>
      ) : (
        <div className={styles.tabContent}>
          <SkillFilesExplorer skill={skill} />
        </div>
      )}
    </>
  );
}

/** Side-by-side comparison of the two skills in a drilled orchestration overlap. */
export function PairView({
  pair,
  skillsById,
  backLabel,
  fix,
  onBack,
}: {
  pair: OrchestrationPairView;
  skillsById: Record<string, SkillView>;
  backLabel: string;
  fix: string;
  onBack: () => void;
}) {
  const styles = useStyles();
  const label = `${pair.a} vs ${pair.b}`;

  return (
    <>
      <Breadcrumb size="small" aria-label="Pattern to overlap">
        <BreadcrumbItem>
          <BreadcrumbButton onClick={onBack}>{backLabel}</BreadcrumbButton>
        </BreadcrumbItem>
        <BreadcrumbDivider />
        <BreadcrumbItem>
          <BreadcrumbButton current>{label}</BreadcrumbButton>
        </BreadcrumbItem>
      </Breadcrumb>

      <div className={styles.overlapCallout}>
        <ArrowSwapRegular />
        <span>Overlap evidence: {pair.evidence}</span>
      </div>

      <div className={styles.compareGrid}>
        {[
          { side: 'a', name: pair.a, skillId: pair.aSkillId },
          { side: 'b', name: pair.b, skillId: pair.bSkillId },
        ].map(({ side, name, skillId }) => {
          const skill = skillId ? skillsById[skillId] : undefined;
          if (!skill) {
            return (
              <div key={side} className={styles.compareCard}>
                <div className={styles.compareTop}>
                  <SkillGlyph size={18} />
                  <span className={styles.compareName}>{name}</span>
                </div>
                <span className={styles.compareWeak}>Skill detail not available.</span>
              </div>
            );
          }
          const pct = skillScorePercent(skill);
          const band = pct !== null ? scoreBand(pct) : null;
          const weak = weakestDimension(skill);
          const notEvaluated = evaluationStateLabel(skill);
          return (
            <div key={skill.id} className={styles.compareCard}>
              <div className={styles.compareTop}>
                <SkillGlyph size={18} />
                <span className={styles.compareName}>{skill.name}</span>
                <Badge appearance="tint" color="subtle" size="small" shape="circular">
                  {skill.source}
                </Badge>
                <div className={styles.spacer} />
                {pct !== null && band ? (
                  <>
                    <span className={styles.score}>{pct}%</span>
                    <Badge appearance="tint" color={band.color} shape="circular">
                      {band.label}
                    </Badge>
                  </>
                ) : (
                  <Badge appearance="tint" color={notEvaluated.color} shape="circular">
                    {notEvaluated.label}
                  </Badge>
                )}
              </div>
              <span className={styles.compareDesc}>{skill.description}</span>
              <span className={styles.compareWeak}>
                {weak ? `Weakest: ${weak.key} ${normalizedDimensionScore(weak.score)}/10 · ${weak.rationale}` : notEvaluated.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>How to fix</span>
        <Text className={styles.fixValue}>{fix}</Text>
      </div>
    </>
  );
}
