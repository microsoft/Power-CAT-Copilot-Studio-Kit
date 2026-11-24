/**
 * The strings behind {@link MeteredActionChip}, split into their own module so
 * the component file exports only a component — ESLint's `react-refresh` rule
 * disables fast refresh for any file that mixes the two.
 *
 * Keeping them in one place also means a chip on the grid and a chip on a
 * testing surface cannot describe the same spend differently.
 */

/** Which capacity an action draws down. There is no default; see the chip. */
export type CreditsMeter = 'credits' | 'messages';

export interface MeterCopy {
  /**
   * Always leads with a verb. Bare "Copilot Credits" beside a column label
   * reads as a second column name rather than as a statement about the
   * buttons below it.
   */
  label: string;
  /**
   * Carries what the label cannot: which mechanism actually spends.
   *
   * **Names the action, not "this".** The chip sits on a page header, so
   * "This runs AI models" would read as *opening this page* spending credits,
   * which is false and alarming. "Running a review" cannot be misread.
   *
   * **Names both backends, because a review can take either.**
   * `reviewAiBackend.resolveReviewAiProvider` chooses between `prompt` (AI
   * prompts through Dataverse PredictV2) and `workflow` (a Copilot Studio
   * workflow whose agent node evaluates each component, submitted as a job row
   * and polled). `DEFAULT_PROVIDER` is currently `workflow`, so a GitHub
   * Copilot harness review does *not* take the prompt path by default, and a
   * draft saying only "calls AI models" described the rollback path rather than
   * the running one. Both meter in Copilot Credits: the cost model in
   * `CostEfficiency` prices Copilot Studio agent runs in that unit.
   *
   * **"AI prompts", never "AI Builder prompts".** AI Builder is the surface
   * that hosts the prompt, not the meter that pays for it: `partnerSource` on
   * each PredictV2 call decides that, `PVA` for Copilot Credits and `AIBuilder`
   * for the legacy pool. Naming the product invites the reader to infer a
   * second billing claim the sentence is not making. It is also the vocabulary
   * this codebase already uses — `ReviewAiProviderKind` is `'prompt'`, and the
   * providers say "AI Prompt path" throughout — and it avoids printing a brand
   * that retires in Nov 2026.
   *
   * **What was deliberately left out, and where it went.**
   *
   * The `PVA` to `AIBuilder` fallback in
   * `AIService.invokePredictV2WithFallback` is real, and it fires on
   * availability rather than provisioning: `nocapacity`,
   * `entitlementnotavailable` and `0x80048d06` all cover a tenant that was
   * provisioned and has since run out. It is not in the tooltip because a
   * maker cannot act on it. The run costs the same either way and no decision
   * follows from knowing which pool drained.
   *
   * "Opening a saved review is free" is also true, and also gone. The chip sits
   * on a page title with no view action beside it, so the sentence answered a
   * question nobody was asking, and raising the possibility that looking might
   * cost was the only thing that put the idea there.
   *
   * The tooltip is one sentence carrying one fact: this spends, and on what.
   */
  description: string;
}

export const METER_COPY: Record<CreditsMeter, MeterCopy> = {
  credits: {
    label: 'Uses Copilot Credits',
    description:
      'Running a review spends Copilot Credits, through AI prompts or a '
      + 'Copilot Studio workflow depending on the agent.',
  },
  messages: {
    label: 'Uses Copilot Studio messages',
    description:
      'Running a test sends messages to the agent and spends your tenant\u2019s '
      + 'Copilot Studio message capacity.',
  },
};
