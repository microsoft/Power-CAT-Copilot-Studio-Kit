import { useMemo } from 'react';
import type { AgentsExperienceModel } from '../../contracts/AgentsExperienceModel';
import { HARNESS_FIT_OVERWORK_QUOTE, assessCopilotHarnessFit } from '../../../utils/harnessFit';
import { HarnessFitContent } from '../../../components/review-page/HarnessFitContent';

export interface CopilotHarnessFitBlockProps {
  /** The review model of the agent (saved, live, or ZIP review). */
  model: AgentsExperienceModel;
  /** The heading level of the block title. */
  headingLevel?: 'h3' | 'h4';
}

const TITLE = 'Simple agent on the Microsoft Copilot harness';
const LEAD =
  'This agent already uses the Microsoft Copilot harness. The agent is simple, so this harness is possibly more than it needs. Make sure that this harness gives a business benefit.';

/**
 * Shows harness fit advice when a Copilot agent is simple.
 * Information only: the advice changes no score, count, badge, or cost estimate.
 * Renders nothing for other agents.
 */
export function CopilotHarnessFitBlock({ model, headingLevel = 'h3' }: CopilotHarnessFitBlockProps) {
  const advice = useMemo(() => assessCopilotHarnessFit(model), [model]);

  if (advice.verdict !== 'copilot-possibly-not-needed') {
    return null;
  }

  return (
    <HarnessFitContent
      headingLevel={headingLevel}
      headingId="cost-harness-fit-heading"
      title={TITLE}
      lead={LEAD}
      reasons={advice.reasons}
      quote={HARNESS_FIT_OVERWORK_QUOTE}
    />
  );
}
