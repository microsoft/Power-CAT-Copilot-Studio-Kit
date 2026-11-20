import type { EvidenceState } from './TranscriptEvidence';

/** Published Microsoft Copilot harness runtime scenarios. */
export type CostScenario = 'light' | 'medium' | 'heavy';

/** A numeric range whose lower boundary can be exclusive and whose upper boundary can be open. */
export interface NumericRange {
  lowerBound: number;
  lowerBoundInclusive: boolean;
  upperBound?: number;
}

/** Valid planning assumptions used by the cost estimator. */
export interface CostPlanningInput {
  monthlyTasks: number;
  scenario: CostScenario;
}

/**
 * Monthly planning estimate.
 *
 * The scenario is a reviewer assumption about task complexity. The
 * Copilot Credits billing overview states runtime consumption "increases with the
 * complexity of the work being performed", so saved configuration cannot
 * select the band on the reviewer's behalf.
 */
export interface CostEstimate {
  monthlyTasks: number;
  scenario: CostScenario;
  creditsPerTask: NumericRange;
  monthlyCredits: NumericRange;
  publicPaygCostCents: NumericRange;
  publicPricePerCreditUsd: 0.01;
  priceBasis: 'public-payg-list-price';
  sourceLabel: 'Microsoft Learn — Billing overview';
}

/**
 * One published band evaluated at the reviewer's task volume.
 *
 * Every field is published arithmetic. Nothing here is inferred from the
 * agent's configuration.
 */
export interface ScenarioExposure {
  scenario: CostScenario;
  creditsPerTask: NumericRange;
  monthlyCredits: NumericRange;
  publicPaygCostCents: NumericRange;
  selected: boolean;
  /** Published sentence that defines this band, quoted from the guide. */
  definition: string;
  /** Published qualifying bullets for this band, quoted from the guide. */
  criteria: readonly string[];
}

/** Direct facts captured in the saved Microsoft Copilot harness review. */
export interface CostArchitectureFacts {
  modelSeries?: string;
  connectorTools: number;
  mcpTools: number;
  skills: number;
  knowledgeSources: number;
  connectedAgents: number;
  triggers: number;
  webSearchEnabled?: boolean;
  evaluationSets: number;
  testCases: number;
  toolAssertionCases: number;
}

/** Possible cost direction used to rank a configuration opportunity. */
export type PotentialImpact = 'high' | 'medium' | 'low';

/** Confidence in the static evidence used for an opportunity. */
export type EvidenceConfidence = 'high' | 'medium' | 'low';

/**
 * Provenance of the evidence behind an opportunity.
 *
 * `configured` is read from saved configuration alone. `observed` is
 * corroborated by the agent's own conversation transcripts. `ai-reviewed`
 * comes from the saved cross-skill orchestration review and is never a cost
 * measurement.
 */
export type CostEvidenceLabel = 'configured' | 'observed' | 'ai-reviewed';

/** A configuration-based change that requires controlled validation. */
export interface CostOpportunity {
  id: string;
  title: string;
  potentialImpact: PotentialImpact;
  confidence: EvidenceConfidence;
  evidenceLabel: CostEvidenceLabel;
  /** Named skill nodes affected by an AI-reviewed orchestration finding. */
  affectedSkills?: string[];
  evidence: string[];
  recommendation: string;
  qualityRisk: string;
  validationPlan: string;
  relatedRuleIds?: string[];
}

/** Complete deterministic output for the Cost & efficiency tab. */
export interface CostEfficiencyReview {
  estimate: CostEstimate;
  facts: CostArchitectureFacts;
  opportunities: CostOpportunity[];
  /**
   * Observed-usage evidence, when transcripts were readable. Optional because
   * the published-band calculator never waits on the transcript read, and
   * because transcript access is an environment setting that can be off.
   */
  evidence?: EvidenceState;
}

/** Result of parsing the monthly task field without coercion. */
export type MonthlyTaskParseResult =
  | { valid: true; value: number }
  | { valid: false; message: string };
