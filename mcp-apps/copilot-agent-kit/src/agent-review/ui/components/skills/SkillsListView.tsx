import { useState } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  Divider,
  Tab,
  TabList,
  makeStyles,
  shorthands,
  tokens,
  typographyStyles,
} from '@fluentui/react-components';
import {
  ShieldCheckmarkRegular,
  ShieldErrorRegular,
  WarningShieldRegular,
} from '@fluentui/react-icons';
import {
  dimensionBand,
  evaluationStateLabel,
  normalizedDimensionScore,
  scoreBand,
  skillScorePercent,
  weakestDimension,
} from '../skillHelpers.js';
import type { SkillView as SkillEvaluation } from '../viewTypes.js';
import { SkillGlyph } from '../common.js';
import { SkillScoreStrip } from '../SkillScoreStrip.js';
import { SkillFilesExplorer } from './SkillFilesExplorer.js';

/**
 * "By skill" listing — one accordion row per skill with its rubric and files.
 * Retained as an alternative to the grouped-by-dimension view.
 */

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
  list: {
    paddingBlock: tokens.spacingVerticalXS,
  },
  detailTabs: {
    marginBottom: tokens.spacingVerticalM,
  },
  headerContent: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    width: '100%',
    minWidth: 0,
    paddingBlock: tokens.spacingVerticalSNudge,
  },
  identity: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXXS),
    minWidth: 0,
    flex: 1,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    minWidth: 0,
  },
  name: {
    ...typographyStyles.body1Strong,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  description: {
    ...typographyStyles.caption1,
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  weakest: {
    ...typographyStyles.caption1,
    whiteSpace: 'nowrap',
  },
  score: {
    ...typographyStyles.subtitle2Stronger,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalMNudge),
    flexShrink: 0,
  },
  rubric: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    ...shorthands.gap(tokens.spacingVerticalM, tokens.spacingHorizontalXL),
    paddingBlockStart: tokens.spacingVerticalXS,
    paddingInline: tokens.spacingHorizontalXS,
  },
  dimTop: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
  dimKey: {
    ...typographyStyles.caption1Strong,
  },
  dimScore: {
    ...typographyStyles.caption1Strong,
    fontVariantNumeric: 'tabular-nums',
  },
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
  dimRationale: {
    ...typographyStyles.caption1,
    color: tokens.colorNeutralForeground2,
  },
  flags: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    marginTop: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalM,
  },
  filesPanel: {
    paddingTop: tokens.spacingVerticalS,
  },
});

type SkillDetailTab = 'rubric' | 'files';

function SkillRowHeader({ skill }: { skill: SkillEvaluation }) {
  const styles = useStyles();
  const pct = skillScorePercent(skill);
  const band = pct !== null ? scoreBand(pct) : null;
  const weakest = weakestDimension(skill);
  const weakestColor = weakest ? BAND_TEXT[dimensionBand(weakest.score)] : tokens.colorNeutralForeground3;
  const notEvaluated = evaluationStateLabel(skill);

  return (
    <div className={styles.headerContent}>
      <SkillGlyph size={18} />
      <div className={styles.identity}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{skill.name}</span>
          <Badge appearance="tint" color="subtle" size="small" shape="circular">
            {skill.source}
          </Badge>
        </div>
        <span className={styles.description}>{skill.description}</span>
      </div>
      <div className={styles.headerRight}>
        {weakest && (
          <span className={styles.weakest} style={{ color: weakestColor }}>
            Weakest: {weakest.key} {normalizedDimensionScore(weakest.score)}/10
          </span>
        )}
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
        {skill.safetyFlagged ? (
          <Badge
            appearance="tint"
            color={skill.safetyDisposition === 'advisory' ? 'warning' : 'danger'}
            shape="circular"
            icon={skill.safetyDisposition === 'advisory' ? <WarningShieldRegular /> : <ShieldErrorRegular />}
          >
            {skill.safetyDisposition === 'advisory' ? 'Prepublish advisory' : 'Security blocker'}
          </Badge>
        ) : (
          <Badge
            appearance="tint"
            color="success"
            shape="circular"
            icon={<ShieldCheckmarkRegular />}
          >
            Clean
          </Badge>
        )}
      </div>
    </div>
  );
}

export interface SkillsListViewProps {
  skills: SkillEvaluation[];
  onOpenFinding: (findingId: string) => void;
  defaultOpenSkillIds?: string[];
  defaultOpenFileSkillIds?: string[];
}

export function SkillsListView({
  skills,
  onOpenFinding,
  defaultOpenSkillIds,
  defaultOpenFileSkillIds,
}: SkillsListViewProps) {
  const styles = useStyles();
  const [selectedTabs, setSelectedTabs] = useState<Readonly<Record<string, SkillDetailTab>>>(
    () => Object.fromEntries(
      (defaultOpenFileSkillIds ?? []).map(skillId => [skillId, 'files' as const]),
    ),
  );

  const selectTab = (skillId: string, tab: SkillDetailTab) => {
    setSelectedTabs(current => ({ ...current, [skillId]: tab }));
  };

  return (
    <Accordion
      collapsible
      multiple
      className={styles.list}
      defaultOpenItems={defaultOpenSkillIds}
    >
      {skills.map((skill) => {
        const evaluationLabel = evaluationStateLabel(skill).label;
        const selectedTab = selectedTabs[skill.id] ?? 'rubric';
        return (
          <AccordionItem key={skill.id} value={skill.id}>
            <AccordionHeader expandIconPosition="end" as="h3">
              <SkillRowHeader skill={skill} />
            </AccordionHeader>
            <AccordionPanel>
              <TabList
                className={styles.detailTabs}
                selectedValue={selectedTab}
                onTabSelect={(_, data) => {
                  if (data.value === 'rubric' || data.value === 'files') {
                    selectTab(skill.id, data.value);
                  }
                }}
                size="small"
                aria-label={`${skill.name} detail view`}
              >
                <Tab value="rubric">Rubric</Tab>
                <Tab value="files">Files</Tab>
              </TabList>
              {selectedTab === 'rubric' ? (
                <>
                  {skill.scores && <SkillScoreStrip scores={skill.scores} />}
                  {skill.dimensions.length === 0 ? (
                    <div className={styles.dimRationale}>
                      {evaluationLabel}
                      {skill.evaluationMessage && skill.evaluationMessage !== evaluationLabel
                        ? ` — ${skill.evaluationMessage}`
                        : ''}
                    </div>
                  ) : (
                    <div className={styles.rubric}>
                      {skill.dimensions.map((dim) => {
                        const band = dimensionBand(dim.score);
                        return (
                          <div key={dim.key}>
                            <div className={styles.dimTop}>
                              <span className={styles.dimKey}>{dim.key}</span>
                              <span className={styles.dimScore} style={{ color: BAND_TEXT[band] }}>
                                {normalizedDimensionScore(dim.score)}/10
                              </span>
                            </div>
                            <div className={styles.dimTrack} aria-hidden="true">
                              <span
                                className={styles.dimFill}
                                style={{
                                  width: `${normalizedDimensionScore(dim.score) * 10}%`,
                                  backgroundColor: BAND_FILL[band],
                                }}
                              />
                            </div>
                            <div className={styles.dimRationale}>{dim.rationale}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Divider />
                  <div className={styles.flags}>
                    {skill.safetyFlagged && skill.safetyFindingId ? (
                      <Button
                        size="small"
                        appearance="secondary"
                        icon={skill.safetyDisposition === 'advisory'
                          ? <WarningShieldRegular />
                          : <ShieldErrorRegular />}
                        onClick={() => onOpenFinding(skill.safetyFindingId!)}
                      >
                        {skill.safetyDisposition === 'advisory'
                          ? 'View prepublish advisory'
                          : 'View security blocker'} · {skill.safetyFindingId}
                      </Button>
                    ) : (
                      <Badge appearance="tint" color="success" shape="circular">
                        Safety scan clean
                      </Badge>
                    )}
                    <Badge appearance="tint" color="informative" shape="circular">
                      Description present
                    </Badge>
                    <Badge appearance="tint" color="informative" shape="circular">
                      {skill.sizeLabel}
                    </Badge>
                  </div>
                </>
              ) : (
                <div className={styles.filesPanel}>
                  <SkillFilesExplorer skill={skill} />
                </div>
              )}
            </AccordionPanel>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
