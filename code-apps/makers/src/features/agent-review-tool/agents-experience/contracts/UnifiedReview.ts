import type { ParsedBotData } from '../../contracts/ServiceContracts';
import type { LocalPattern, PatternTopic } from '../../contracts/StageOutputs';
import type { AgentsExperienceModel } from './AgentsExperienceModel';
import type { GroundedFinding } from './Findings';
import type { NormalizedEvaluationEvidence } from './EvaluationEvidence';

export type UnifiedHarness = 'standard' | 'copilot';
export type UnifiedSeverity = 'high' | 'medium' | 'info';
export type UnifiedOutcome = 'pass' | 'fail' | 'not-applicable' | 'could-not-run';
export type UnifiedPopulation = 'instructions' | 'tools' | 'skills' | 'knowledge'
  | 'connectedAgents' | 'evaluation' | 'configuration';
export type UnifiedAvailability = 'complete' | 'partial' | 'unavailable';

export type UnifiedRuleContext =
  | { harness: 'standard'; model: ParsedBotData; evaluation?: NormalizedEvaluationEvidence }
  | {
    harness: 'copilot';
    model: AgentsExperienceModel;
    /** Omitted entries assert complete normalized capture; unknownKinds still makes inventories partial. */
    availability?: Partial<Record<UnifiedPopulation, UnifiedAvailability>>;
  };

export interface UnifiedEvidence {
  componentId?: string;
  schemaName?: string;
  fieldPath: string;
  quote?: string;
  status: 'verified' | 'unverified' | 'unavailable';
  reason?: string;
}

export interface UnifiedFinding {
  id: string;
  instanceId: string;
  title: string;
  fact: string;
  why: string;
  fix: string;
  severity: UnifiedSeverity;
  subject?: string;
  subjectId?: string;
  evidence: readonly UnifiedEvidence[];
  referenceIds: readonly string[];
  compatibility?: { standard?: PatternTopic; copilot?: GroundedFinding };
}

export interface UnifiedRuleMetadata {
  id: string;
  title: string;
  family: string;
  supportedHarnesses: readonly UnifiedHarness[];
  severity: UnifiedSeverity;
  kind: 'check' | 'record';
  fact: string;
  why: string;
  fix: string;
  tags: readonly string[];
  referenceIds: readonly string[];
}

export interface UnifiedRuleAssessment {
  key: string;
  ruleId: string;
  harness: UnifiedHarness;
  family: string;
  severity: UnifiedSeverity;
  kind: 'check' | 'record';
  outcome: UnifiedOutcome;
  title: string;
  fact: string;
  why: string;
  fix: string;
  tags: readonly string[];
  source: 'deterministic' | 'ai';
  incomplete: boolean;
  reason?: string;
  subject?: string;
  subjectId?: string;
  referenceIds: readonly string[];
  evidence: readonly UnifiedEvidence[];
  findings: readonly UnifiedFinding[];
  compatibility?: { standard?: LocalPattern; copilot?: readonly GroundedFinding[] };
}

export interface UnifiedDeterministicScore {
  value: number | null;
  earnedWeight: number;
  possibleWeight: number;
  incomplete: boolean;
  completed: number;
  couldNotRun: number;
  notApplicable: number;
  coverage: number | null;
  contributions: readonly { key: string; earnedWeight: number; possibleWeight: number }[];
  diagnostics: readonly string[];
}

export interface UnifiedRuleReport {
  harness: UnifiedHarness;
  policyVersion: string;
  assessments: readonly UnifiedRuleAssessment[];
  score: UnifiedDeterministicScore;
}

export type StandardRuleContext = Extract<UnifiedRuleContext, { harness: 'standard' }>;
export type CopilotRuleContext = Extract<UnifiedRuleContext, { harness: 'copilot' }>;

export interface UnifiedStandardRule extends UnifiedRuleMetadata {
  harness: 'standard';
  evaluate(context: StandardRuleContext): UnifiedRuleAssessment;
  legacyPattern(model: ParsedBotData): LocalPattern | undefined;
}

export interface UnifiedCopilotRule extends UnifiedRuleMetadata {
  harness: 'copilot';
  evaluate(context: CopilotRuleContext): UnifiedRuleAssessment;
}

export type UnifiedRuleDefinition = UnifiedStandardRule | UnifiedCopilotRule;
