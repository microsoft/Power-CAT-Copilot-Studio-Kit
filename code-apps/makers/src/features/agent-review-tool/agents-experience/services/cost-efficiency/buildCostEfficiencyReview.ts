import type {
  CostEfficiencyReview,
  CostEstimate,
  CostPlanningInput,
  CostScenario,
  MonthlyTaskParseResult,
  NumericRange,
  ScenarioExposure,
} from '../../contracts/CostEfficiency';
import type { AgentsExperienceModel } from '../../contracts/AgentsExperienceModel';
import {
  buildCostOpportunities,
  collectCostArchitectureFacts,
} from './costOpportunityBuilders';

const MAX_PUBLISHED_BOUNDARY = 500;

/** Largest monthly task count that keeps every published boundary multiplication safe. */
export const MAX_MONTHLY_TASKS = Math.floor(
  Number.MAX_SAFE_INTEGER / MAX_PUBLISHED_BOUNDARY,
);

/** Published August 2026 Microsoft Copilot harness runtime scenario ranges. */
export const PUBLISHED_CREDIT_RANGES: Readonly<
  Record<CostScenario, Readonly<NumericRange>>
> = {
  light: {
    lowerBound: 100,
    lowerBoundInclusive: true,
    upperBound: 300,
  },
  medium: {
    lowerBound: 300,
    lowerBoundInclusive: true,
    upperBound: 500,
  },
  heavy: {
    lowerBound: 500,
    lowerBoundInclusive: false,
  },
};

/**
 * Published scenario descriptors, quoted from Microsoft Learn.
 *
 * Source: Microsoft Learn — Overview of usage-based billing, which covers the
 * Microsoft Copilot harness. The guide publishes a definition and three
 * qualifying bullets beside each credit range. Those words are the only
 * published rule for choosing a band, so they are quoted rather than
 * paraphrased. Do not add a threshold that the guide does not state.
 */
export const PUBLISHED_SCENARIO_DESCRIPTORS: Readonly<
  Record<CostScenario, Readonly<{ definition: string; criteria: readonly string[] }>>
> = {
  light: {
    definition:
      'Leverages a handful of knowledge sources for a light reasoning scenario '
      + 'like a summary, usually resulting in one short deliverable.',
    criteria: ['Few sources', 'Light reasoning', '1 or fewer outputs'],
  },
  medium: {
    definition:
      'References many sources over varying timeframes, uses structured '
      + 'reasoning, and produces multiple deliverables.',
    criteria: ['Many sources', 'Structured reasoning', '2+ outputs'],
  },
  heavy: {
    definition:
      'Requires deep analysis and broad source aggregation over long time '
      + 'frames, generating many outputs.',
    criteria: ['Broad aggregation', 'Deep reasoning', 'Many outputs'],
  },
};

function isValidMonthlyTaskCount(value: number): boolean {
  return Number.isFinite(value)
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= MAX_MONTHLY_TASKS;
}

function fixedZeroRange(): NumericRange {
  return {
    lowerBound: 0,
    lowerBoundInclusive: true,
    upperBound: 0,
  };
}

function multiplyRange(range: Readonly<NumericRange>, multiplier: number): NumericRange {
  if (multiplier === 0) return fixedZeroRange();
  return {
    lowerBound: range.lowerBound * multiplier,
    lowerBoundInclusive: range.lowerBoundInclusive,
    ...(range.upperBound === undefined
      ? {}
      : { upperBound: range.upperBound * multiplier }),
  };
}

/** Parses monthly task text without rounding or accepting exponential notation. */
export function parseMonthlyTaskInput(input: string): MonthlyTaskParseResult {
  if (!/^\d+$/.test(input)) {
    return {
      valid: false,
      message: 'Enter a whole number of monthly tasks.',
    };
  }

  const value = Number(input);
  if (!Number.isSafeInteger(value) || value > MAX_MONTHLY_TASKS) {
    return {
      valid: false,
      message: 'This value is too large to estimate safely.',
    };
  }

  return { valid: true, value };
}

/** Calculates monthly credits and integer-cent public PAYG ranges. */
export function estimateMonthlyCost(input: CostPlanningInput): CostEstimate {
  if (!isValidMonthlyTaskCount(input.monthlyTasks)) {
    throw new Error(
      'Monthly tasks must be a finite, safe, non-negative whole number.',
    );
  }

  const publishedRange = PUBLISHED_CREDIT_RANGES[input.scenario];
  const creditsPerTask: NumericRange = { ...publishedRange };
  const monthlyCredits = multiplyRange(publishedRange, input.monthlyTasks);

  return {
    monthlyTasks: input.monthlyTasks,
    scenario: input.scenario,
    creditsPerTask,
    monthlyCredits,
    // At $0.01 per credit, one credit maps to one US cent.
    publicPaygCostCents: { ...monthlyCredits },
    publicPricePerCreditUsd: 0.01,
    priceBasis: 'public-payg-list-price',
    sourceLabel: 'Microsoft Learn — Billing overview',
  };
}

/** Builds the complete deterministic cost and efficiency review. */
export function buildCostEfficiencyReview(
  model: AgentsExperienceModel,
  input: CostPlanningInput,
): CostEfficiencyReview {
  return {
    estimate: estimateMonthlyCost(input),
    facts: collectCostArchitectureFacts(model),
    opportunities: buildCostOpportunities(model),
  };
}

/** Published scenario order, lightest first. */
export const SCENARIO_ORDER: readonly CostScenario[] = ['light', 'medium', 'heavy'];

/**
 * Evaluates every published band at one task volume.
 *
 * The guide ties the band to task complexity, which saved configuration cannot
 * observe. Showing all three bands states that uncertainty instead of implying
 * the selected band is a measurement.
 */
export function buildScenarioExposure(
  monthlyTasks: number,
  selected: CostScenario,
): ScenarioExposure[] {
  if (!isValidMonthlyTaskCount(monthlyTasks)) {
    throw new Error(
      'Monthly tasks must be a finite, safe, non-negative whole number.',
    );
  }

  return SCENARIO_ORDER.map(scenario => {
    const publishedRange = PUBLISHED_CREDIT_RANGES[scenario];
    const monthlyCredits = multiplyRange(publishedRange, monthlyTasks);
    const descriptor = PUBLISHED_SCENARIO_DESCRIPTORS[scenario];
    return {
      scenario,
      creditsPerTask: { ...publishedRange },
      monthlyCredits,
      publicPaygCostCents: { ...monthlyCredits },
      selected: scenario === selected,
      definition: descriptor.definition,
      criteria: descriptor.criteria,
    };
  });
}
