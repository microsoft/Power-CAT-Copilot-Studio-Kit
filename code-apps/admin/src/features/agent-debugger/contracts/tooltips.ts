/** Tooltip descriptions for section headers in the Agent Debugger. */
export const SECTION_TOOLTIPS = {
  generalInformation:
    "Key metrics for this conversation including session count, message turns, outcome, and duration.",
  debugInformation:
    "Step-by-step breakdown of the agent's reasoning, actions, and tool invocations for the selected user message.",
  conversationPreview:
    "Full conversation transcript between the user and agent. Click a user message to view its debug steps.",
} as const;
