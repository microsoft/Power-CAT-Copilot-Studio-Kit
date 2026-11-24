import type { BotComponent } from '../../contracts/ServiceContracts';
import type { NormalizedEvaluationEvidence } from './EvaluationEvidence';
import type {
  UnifiedAvailability, UnifiedHarness, UnifiedOutcome, UnifiedPopulation,
  UnifiedRuleAssessment, UnifiedRuleContext, UnifiedRuleReport, UnifiedDeterministicScore,
} from './UnifiedReview';

export interface CapturedReviewMetadata {
  botId: string;
  name: string;
  configuration?: string;
  /** Agent authentication mode that was captured with the review; undefined when not captured. */
  authenticationMode?: number;
}

export interface CapturedDeterministicReviewInput {
  harness: UnifiedHarness;
  metadata: CapturedReviewMetadata;
  /** Original typed capture, retained for evaluation evidence and completeness counts. */
  components: readonly BotComponent[];
  /** Optional host-normalized view of the same Standard capture, used by both old and new local predicates. */
  standardComponents?: readonly BotComponent[];
  source?: 'live' | 'zip';
  availability?: Partial<Record<UnifiedPopulation | 'components', UnifiedAvailability>>;
  expectedComponentCount?: number;
}

export interface LegacyDeterministicBaseline {
  value: number | null;
  label: string;
  formula: 'standard-local-completed-pass-ratio' | 'copilot-base-legacy-credit-ratio';
  ruleCount: number;
  incomplete: boolean;
  /** Always recomputed on this capture; never a persisted ART rating or a mixed AI score. */
  origin: 'same-capture-recomputation';
}

export interface UnifiedRuleChange {
  key: string;
  ruleId: string;
  classification: 'existing' | 'new' | 'evidence-semantics';
  previousOutcome: UnifiedOutcome | null;
  currentOutcome: UnifiedOutcome | null;
  previous: UnifiedRuleAssessment | null;
  current: UnifiedRuleAssessment | null;
  predicateChanged: false;
  reason: string;
}

export interface UnifiedReviewComparison {
  harness: UnifiedHarness;
  metadata?: CapturedReviewMetadata;
  previous: { assessments: readonly UnifiedRuleAssessment[]; score: LegacyDeterministicBaseline };
  current: UnifiedRuleReport;
  changes: readonly UnifiedRuleChange[];
  /** Same completed quality checks with identical outcomes; completeness differences remain visible. */
  sameRule: { previous: LegacyDeterministicBaseline; current: UnifiedDeterministicScore };
  evaluation?: NormalizedEvaluationEvidence;
  scope: readonly string[];
}

export type DeterministicComparisonContext = UnifiedRuleContext;
