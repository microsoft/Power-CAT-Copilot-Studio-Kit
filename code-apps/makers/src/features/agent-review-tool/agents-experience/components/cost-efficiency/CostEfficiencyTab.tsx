import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Body1,
  Body1Strong,
  Caption1,
  Card,
  CardHeader,
  Divider,
  Subtitle2,
  Title3,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { InfoRegular } from '@fluentui/react-icons';
import type { AgentsExperienceModel } from '../../contracts/AgentsExperienceModel';
import type { CostScenario } from '../../contracts/CostEfficiency';
import type { CrossSkillOrchestrationEvaluation } from '../../contracts/SkillEvaluation';
import {
  NO_EVIDENCE_REASON,
  type EvidenceState,
} from '../../contracts/TranscriptEvidence';
import { buildAiEfficiencyOpportunities } from '../../services/cost-efficiency/buildAiEfficiencyOpportunities';
import {
  buildScenarioExposure,
  estimateMonthlyCost,
  parseMonthlyTaskInput,
} from '../../services/cost-efficiency/buildCostEfficiencyReview';
import { buildEvidenceOpportunities } from '../../services/cost-efficiency/buildEvidenceOpportunities';
import {
  buildCostOpportunities,
  collectCostArchitectureFacts,
} from '../../services/cost-efficiency/costOpportunityBuilders';
import {
  formatCount,
} from '../../services/cost-efficiency/costDisplay';
import { ConfigurationSignalsRow } from './ConfigurationSignalsRow';
import { CopilotHarnessFitBlock } from './CopilotHarnessFitBlock';
import { CostEstimateHero } from './CostEstimateHero';
import { CostMethodologyDisclosure } from './CostMethodologyDisclosure';
import { CostOpportunitiesList } from './CostOpportunitiesList';
import { EvaluationRunGuidance } from './EvaluationRunGuidance';
import { ObservedEvidenceCard } from './ObservedEvidenceCard';
import { ScenarioExposureTable } from './ScenarioExposureTable';

const DEFAULT_EVIDENCE_STATE: EvidenceState = {
  status: 'no-access',
  reason: NO_EVIDENCE_REASON,
};

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXL,
    minWidth: 0,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
  },
  pageHeading: {
    margin: 0,
  },
  summaryCard: {
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalS,
  },
  summaryHeading: {
    margin: 0,
  },
  summaryMetrics: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr)',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalXS,
    margin: 0,
    '@media (max-width: 639px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  summaryMetric: {
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
    margin: 0,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
  },
  summaryDivider: {
    height: tokens.spacingVerticalXXL,
    '@media (max-width: 639px)': {
      display: 'none',
    },
  },
  summaryDividerMobile: {
    display: 'none',
    '@media (max-width: 639px)': {
      display: 'flex',
    },
  },
  summaryLabel: {
    color: tokens.colorNeutralForeground3,
    margin: 0,
  },
  summaryValue: {
    color: tokens.colorNeutralForeground1,
    fontVariantNumeric: 'tabular-nums',
    margin: 0,
    overflowWrap: 'anywhere',
  },
  questionsCard: {
    gap: 0,
    overflow: 'hidden',
    padding: 0,
  },
  accordion: {
    width: '100%',
  },
  questionItem: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    ':last-child': {
      borderBottomWidth: 0,
    },
  },
  questionHeaderButton: {
    minHeight: '44px',
  },
  questionHeaderContent: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
    width: '100%',
    '@media (max-width: 639px)': {
      gridTemplateColumns: 'auto minmax(0, 1fr)',
      alignItems: 'start',
    },
  },
  questionText: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  questionStatus: {
    color: tokens.colorNeutralForeground3,
    overflowWrap: 'anywhere',
  },
  questionBadges: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalXS,
    minWidth: 0,
    '@media (max-width: 639px)': {
      gridColumn: '2',
      justifyContent: 'flex-start',
    },
  },
  panelContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minWidth: 0,
    paddingBottom: tokens.spacingVerticalM,
  },
  panelIntro: {
    color: tokens.colorNeutralForeground2,
    margin: 0,
  },
  evidenceBoundary: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground3,
    margin: 0,
  },
  evidenceBoundaryIcon: {
    flexShrink: 0,
    marginTop: tokens.spacingVerticalXXS,
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

interface ObservationSummary {
  conversationValue: string;
  status: string;
  observed?: number;
  notAttributable?: number;
}

function observationSummary(state: EvidenceState): ObservationSummary {
  switch (state.status) {
    case 'loading':
      return {
        conversationValue: 'Loading',
        status: 'Reading conversation transcripts',
      };
    case 'no-access':
      return {
        conversationValue: 'Unavailable',
        status: 'Observed capability use is unavailable for this review',
      };
    case 'no-transcripts':
      return {
        conversationValue: formatCount(state.window.conversations),
        status: `No conversation activity in the last ${state.window.days} days`,
      };
    case 'no-signal':
      return {
        conversationValue: formatCount(state.window.conversations),
        status: `No configured capability calls recorded in the last ${state.window.days} days`,
      };
    case 'ready':
      return {
        conversationValue: formatCount(state.window.conversations),
        status:
          `Capability use from ${formatCount(state.window.conversations)} `
          + `conversations in the last ${state.window.days} days`,
        observed: state.coverage.reduce(
          (total, coverage) => total + coverage.observed,
          0,
        ),
        notAttributable: state.coverage.reduce(
          (total, coverage) => total + (coverage.notAttributable ?? 0),
          0,
        ),
      };
  }
}

interface ReviewQuestionHeaderProps {
  step: number;
  question: string;
  status: string;
  badges: ReactNode;
}

function ReviewQuestionHeader({
  step,
  question,
  status,
  badges,
}: ReviewQuestionHeaderProps) {
  const styles = useStyles();
  return (
    <span className={styles.questionHeaderContent}>
      <Badge appearance="filled" color="brand" shape="circular">
        {step}
      </Badge>
      <span className={styles.questionText}>
        <Subtitle2 as="span">{question}</Subtitle2>
        <Body1 className={styles.questionStatus}>{status}</Body1>
      </span>
      <span className={styles.questionBadges}>{badges}</span>
    </span>
  );
}

export interface CostEfficiencyTabProps {
  model: AgentsExperienceModel;
  monthlyTasksInput: string;
  scenario: CostScenario;
  /**
   * Observed-use evidence, read once by the page so the tab and the exports
   * share a single transcript read.
   */
  evidence?: EvidenceState;
  /** Existing saved AI review evidence. No new AI request is made by this tab. */
  aiOrchestration?: CrossSkillOrchestrationEvaluation;
  onMonthlyTasksInputChange: (value: string) => void;
  onScenarioChange: (scenario: CostScenario) => void;
}

/** Organizes the cost review around evidence, action, validation, and budget. */
export function CostEfficiencyTab({
  model,
  monthlyTasksInput,
  scenario,
  evidence,
  aiOrchestration,
  onMonthlyTasksInputChange,
  onScenarioChange,
}: CostEfficiencyTabProps) {
  const styles = useStyles();
  const parseResult = useMemo(
    () => parseMonthlyTaskInput(monthlyTasksInput),
    [monthlyTasksInput],
  );
  const estimate = useMemo(
    () => parseResult.valid
      ? estimateMonthlyCost({ monthlyTasks: parseResult.value, scenario })
      : undefined,
    [parseResult, scenario],
  );
  const facts = useMemo(() => collectCostArchitectureFacts(model), [model]);
  const opportunities = useMemo(() => buildCostOpportunities(model), [model]);
  const aiFindings = aiOrchestration?.findings;
  const aiOpportunities = useMemo(
    () => buildAiEfficiencyOpportunities(aiFindings ?? []),
    [aiFindings],
  );
  const exposure = useMemo(
    () => parseResult.valid
      ? buildScenarioExposure(parseResult.value, scenario)
      : undefined,
    [parseResult, scenario],
  );
  // Without the page context, the tab cannot distinguish an upload from a
  // missing environment, so use the generic no-access state.
  const evidenceState = evidence ?? DEFAULT_EVIDENCE_STATE;
  const evidenceOpportunities = useMemo(
    () => buildEvidenceOpportunities(evidenceState),
    [evidenceState],
  );
  const observed = useMemo(
    () => observationSummary(evidenceState),
    [evidenceState],
  );
  const reviewLeadCount =
    evidenceOpportunities.length + aiOpportunities.length + opportunities.length;
  const reviewLeadLabel =
    `${formatCount(reviewLeadCount)} review ${reviewLeadCount === 1 ? 'lead' : 'leads'}`;
  const improvementStatus = aiOpportunities.length > 0
    ? 'Ranked findings from observed use, configuration, and AI review'
    : 'Ranked findings from observed use and saved configuration';

  return (
    <div className={styles.root}>
      <div
        aria-atomic="true"
        aria-live="polite"
        className={styles.visuallyHidden}
        role="status"
      >
        {observed.status}
      </div>
      <Title3 as="h2" className={styles.pageHeading} id="cost-efficiency-heading">
        Cost &amp; efficiency
      </Title3>

      <Card className={styles.summaryCard} appearance="filled-alternative">
        <CardHeader
          header={(
            <Body1Strong as="h3" className={styles.summaryHeading}>
              Review summary
            </Body1Strong>
          )}
        />
        <div className={styles.summaryMetrics}>
          <div className={styles.summaryMetric}>
            <Subtitle2 as="span" className={styles.summaryValue}>
              {observed.conversationValue}
            </Subtitle2>
            <Body1 as="span" className={styles.summaryLabel}>
              conversations reviewed
            </Body1>
          </div>
          <Divider aria-hidden className={styles.summaryDivider} vertical />
          <Divider aria-hidden className={styles.summaryDividerMobile} />
          <div className={styles.summaryMetric}>
            <Subtitle2 as="span" className={styles.summaryValue}>
              {formatCount(reviewLeadCount)}
            </Subtitle2>
            <Body1 as="span" className={styles.summaryLabel}>
              changes to review
            </Body1>
          </div>
          <Divider aria-hidden className={styles.summaryDivider} vertical />
          <Divider aria-hidden className={styles.summaryDividerMobile} />
          <div className={styles.summaryMetric}>
            <Subtitle2 as="span" className={styles.summaryValue}>
              {formatCount(facts.testCases)}
            </Subtitle2>
            <Body1 as="span" className={styles.summaryLabel}>
              saved validation cases
            </Body1>
          </div>
        </div>
      </Card>

      <Card
        aria-label="Cost and efficiency review questions"
        className={styles.questionsCard}
        appearance="outline"
      >
        <Accordion
          className={styles.accordion}
          collapsible
          multiple
          defaultOpenItems={['improve']}
        >
          <AccordionItem className={styles.questionItem} value="observe">
            <AccordionHeader
              as="h3"
              button={{ className: styles.questionHeaderButton }}
              expandIconPosition="start"
            >
              <ReviewQuestionHeader
                step={1}
                question="What did we observe?"
                status={observed.status}
                badges={(
                  <>
                    {observed.observed !== undefined ? (
                      <Badge appearance="tint" color="brand" shape="rounded">
                        {formatCount(observed.observed)} observed
                      </Badge>
                    ) : null}
                    {observed.notAttributable !== undefined
                      && observed.notAttributable > 0 ? (
                        <Badge
                          appearance="tint"
                          color="informative"
                          shape="rounded"
                        >
                          {formatCount(observed.notAttributable)} not attributable
                        </Badge>
                      ) : null}
                  </>
                )}
              />
            </AccordionHeader>
            <AccordionPanel>
              <div className={styles.panelContent}>
                <ObservedEvidenceCard
                  state={evidenceState}
                  collapsible={false}
                  headingLevel="h4"
                  announceStatus={false}
                />
              </div>
            </AccordionPanel>
          </AccordionItem>

          <AccordionItem className={styles.questionItem} value="improve">
            <AccordionHeader
              as="h3"
              button={{ className: styles.questionHeaderButton }}
              expandIconPosition="start"
            >
              <ReviewQuestionHeader
                step={2}
                question="What should I improve?"
                status={improvementStatus}
                badges={(
                  <Badge appearance="tint" color="brand" shape="rounded">
                    {reviewLeadLabel}
                  </Badge>
                )}
              />
            </AccordionHeader>
            <AccordionPanel>
              <div className={styles.panelContent}>
                <Body1 as="p" className={styles.panelIntro}>
                  Start with the highest-value change. Open a finding to see its
                  evidence, risk, and validation plan.
                </Body1>
                <ConfigurationSignalsRow
                  facts={facts}
                  evidence={evidenceState}
                  headingLevel="h4"
                />
                <CopilotHarnessFitBlock model={model} headingLevel="h4" />
                <CostOpportunitiesList
                  opportunities={opportunities}
                  aiOpportunities={aiOpportunities}
                  evidence={evidenceState}
                  headingLevel="h4"
                />
              </div>
            </AccordionPanel>
          </AccordionItem>

          <AccordionItem className={styles.questionItem} value="validate">
            <AccordionHeader
              as="h3"
              button={{ className: styles.questionHeaderButton }}
              expandIconPosition="start"
            >
              <ReviewQuestionHeader
                step={3}
                question="How do I validate it?"
                status="Run the same baseline before and after one configuration change"
                badges={(
                  <>
                    <Badge appearance="tint" color="informative" shape="rounded">
                      {formatCount(facts.testCases)} cases
                    </Badge>
                  </>
                )}
              />
            </AccordionHeader>
            <AccordionPanel>
              <div className={styles.panelContent}>
                <EvaluationRunGuidance
                  testCases={facts.testCases}
                  headingLevel="h4"
                />
              </div>
            </AccordionPanel>
          </AccordionItem>

          <AccordionItem className={styles.questionItem} value="budget">
            <AccordionHeader
              as="h3"
              button={{ className: styles.questionHeaderButton }}
              expandIconPosition="start"
            >
              <ReviewQuestionHeader
                step={4}
                question="How do I plan a budget?"
                status="Use published scenario ranges; this is planning guidance, not measured spend"
                badges={(
                  <Badge appearance="tint" color="informative" shape="rounded">
                    Light / Medium / Heavy
                  </Badge>
                )}
              />
            </AccordionHeader>
            <AccordionPanel>
              <div className={styles.panelContent}>
                <CostEstimateHero
                  monthlyTasksInput={monthlyTasksInput}
                  scenario={scenario}
                  parseResult={parseResult}
                  estimate={estimate}
                  onMonthlyTasksInputChange={onMonthlyTasksInputChange}
                  onScenarioChange={onScenarioChange}
                  headingLevel="h4"
                />
                {exposure ? (
                  <ScenarioExposureTable
                    exposure={exposure}
                    headingLevel="h4"
                  />
                ) : null}
                <CostMethodologyDisclosure headingLevel="h4" />
              </div>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Card>

      <Caption1 as="p" className={styles.evidenceBoundary}>
        <InfoRegular className={styles.evidenceBoundaryIcon} aria-hidden />
        <span>
          No actual agent cost or guaranteed saving is claimed. Evaluation runs
          consume Copilot Credits based on the runtime work performed. Use the
          same test set before and after one change, then compare recorded credit
          consumption and quality.
        </span>
      </Caption1>
    </div>
  );
}
