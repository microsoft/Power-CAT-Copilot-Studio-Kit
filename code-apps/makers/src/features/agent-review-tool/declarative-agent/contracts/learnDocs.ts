/**
 * learnDocs.ts
 *
 * Official Microsoft Learn documentation links for each DA evaluation criterion
 * and manifest health check item. Used to surface "Learn more" links in the
 * review dialog next to each criterion and health check row.
 *
 * URLs use #:~:text= (Chrome Text Fragment API) to highlight the relevant
 * passage on the page — matching the pattern used in CS agent learn docs.
 *
 * Canonical base path: https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/
 * Validation guidelines (Teams-hosted page, M365 context): https://learn.microsoft.com/en-us/microsoftteams/platform/.../review-copilot-validation-guidelines?context=/microsoft-365/copilot/extensibility/context
 *
 * All URLs verified against learn.microsoft.com as of 2026-04.
 */

export interface LearnDocLink {
  /** Short label for the link (e.g., "Write effective instructions") */
  label: string;
  /** Full Microsoft Learn URL */
  url: string;
}

/**
 * Learn doc links for each AI evaluation criterion (Stage B).
 * Keyed by the criterion field name in DAEvaluationResult.
 *
 * Two links per criterion:
 *   [0] = primary — shown inline per issue
 *   [1] = secondary — shown in the section footer
 */
export const CRITERION_LEARN_DOCS: Record<string, LearnDocLink[]> = {
  instructionsCriterion: [
    {
      label: 'Best practices for building declarative agents',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices#:~:text=Provide%20up%20to%208%2C000%20characters%20of%20detailed%20guidance%20for%20how%20the%20agent%20should%20behave',
    },
    {
      label: 'Write effective instructions for declarative agents',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions#:~:text=Focus%20on%20what%20Copilot%20should%20do',
    },
  ],
  knowledgeCriterion: [
    {
      label: 'Add knowledge sources to your declarative agent',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/knowledge-sources#:~:text=You%20can%20enhance%20the%20user%20experience%20of%20your%20declarative%20agent%20by%20adding%20capabilities',
    },
    {
      label: 'Best practices: choosing the right knowledge sources',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices#:~:text=Relevance%20over%20quantity%3A%20Be%20selective%20about%20what%20knowledge%20you%20add',
    },
  ],
  capabilitiesCriterion: [
    {
      label: 'Declarative agent manifest: capabilities',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8#:~:text=capabilities',
    },
    {
      label: 'Add knowledge and capabilities to your agent',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices#:~:text=Capabilities%20give%20your%20agent%20extra%20skills',
    },
  ],
  actionsCriterion: [
    {
      label: 'Write instructions for declarative agents with API plugins',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices#:~:text=If%20your%20agent%20needs%20to%20query%20external%20systems%20or%20perform%20transactions',
    },
    {
      label: 'Declarative agent manifest: actions',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8#:~:text=actions',
    },
  ],
  conversationStartersCriterion: [
    {
      label: 'Best practices: conversation starters',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices#:~:text=Include%20a%20minimum%20of%20three%20sample%20prompts%20that%20reflect%20the%20core%20capabilities%20of%20your%20agent',
    },
    {
      label: 'Validation guidelines: Prompt starters',
      url: 'https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/review-copilot-validation-guidelines?context=/microsoft-365/copilot/extensibility/context#:~:text=A%20declarative%20agent%20or%20a%20custom%20engine%20agent%20must%20have%20at%20least%20three%20prompts',
    },
  ],
  gracefulErrorHandlingCriterion: [
    {
      label: 'Configure guardrails in agent instructions',
      url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=Only%20respond%20to%20messages%20that%20are%20relevant',
    },
  ],
  manifestHealth: [
    {
      label: 'Validation guidelines for agents',
      url: 'https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/review-copilot-validation-guidelines?context=/microsoft-365/copilot/extensibility/context#:~:text=For%20declarative%20agent%2C%20ensure%20that%20the%20following%20parameters%20are%20identical',
    },
    {
      label: 'Declarative agent manifest reference',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8',
    },
  ],
};

/**
 * Learn doc links for each manifest health check field (Stage A).
 * Keyed by the field name in ManifestHealthCheck.
 */
export const HEALTH_CHECK_LEARN_DOCS: Record<string, LearnDocLink[]> = {
  nameLength: [
    {
      label: 'Declarative agent manifest: name field',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8#:~:text=name',
    },
  ],
  descriptionLength: [
    {
      label: 'Declarative agent manifest: description field',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8#:~:text=description',
    },
  ],
  instructionsPresent: [
    {
      label: 'Write effective instructions for declarative agents',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions#:~:text=Focus%20on%20what%20Copilot%20should%20do',
    },
  ],
  conversationStartersCount: [
    {
      label: 'Best practices: conversation starters',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices#:~:text=Include%20a%20minimum%20of%20three%20sample%20prompts%20that%20reflect%20the%20core%20capabilities%20of%20your%20agent',
    },
    {
      label: 'Validation guidelines: Prompt starters',
      url: 'https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/review-copilot-validation-guidelines?context=/microsoft-365/copilot/extensibility/context#:~:text=A%20declarative%20agent%20or%20a%20custom%20engine%20agent%20must%20have%20at%20least%20three%20prompts',
    },
  ],
  actionsCount: [
    {
      label: 'Declarative agent manifest: actions',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8#:~:text=actions',
    },
  ],
  colorIconPresent: [
    {
      label: 'Agents are apps: app package',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/agents-are-apps',
    },
  ],
  daFileResolved: [
    {
      label: 'Declarative agent overview',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-declarative-agent',
    },
  ],
  nameConsistency: [
    {
      label: 'Validation guidelines: Agent name consistency',
      url: 'https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/review-copilot-validation-guidelines?context=/microsoft-365/copilot/extensibility/context#:~:text=For%20declarative%20agent%2C%20ensure%20that%20the%20following%20parameters%20are%20identical',
    },
  ],
  noPromptInjection: [
    {
      label: 'Validation guidelines: Prompt injection phrases',
      url: 'https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/review-copilot-validation-guidelines?context=/microsoft-365/copilot/extensibility/context#:~:text=Instructional%20phrases%2C%20for%20example',
    },
  ],
  noUrlsOrEmojis: [
    {
      label: 'Validation guidelines: URLs and emojis',
      url: 'https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/review-copilot-validation-guidelines?context=/microsoft-365/copilot/extensibility/context#:~:text=URLs%2C%20emojis%2C%20or%20hidden%20characters',
    },
  ],
  isConsequentialFlags: [
    {
      label: 'Validation guidelines: Consequential actions',
      url: 'https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/review-copilot-validation-guidelines?context=/microsoft-365/copilot/extensibility/context#:~:text=Consequential%20actions%20(Create%2C%20Update%2C%20or%20Delete%20API%20calls)%20must%20require%20explicit%20user%20permission',
    },
    {
      label: 'Customizing confirmation text for plugin actions',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api-plugin-confirmation-prompts',
    },
  ],
  httpsOnActionUrls: [
    {
      label: 'Validation guidelines: HTTPS requirement',
      url: 'https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/review-copilot-validation-guidelines?context=/microsoft-365/copilot/extensibility/context#:~:text=All%20calls%20must%20use%20HTTPS%20with%20TLS%201.2%20or%20higher',
    },
  ],
  mcpStaticDiscovery: [
    {
      label: 'Dynamic tool discovery for MCP plugins',
      url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-dynamic-tool-discovery',
    },
  ],
};

/**
 * Client-side map from stable issueKey strings (returned by the AI model) to
 * pre-verified MS Learn URLs with #:~:text= fragment highlighting.
 *
 * The AI model returns `issueKey` on each EvaluationIssue. This map resolves
 * the exact Learn page and text fragment so makers land on the precise passage
 * backing each finding — without relying on the AI to generate accurate URLs.
 *
 * Key naming convention: `{criterion-short}-{issue-slug}`
 * All URLs verified against learn.microsoft.com as of 2026-04.
 */
export const ISSUE_LEARN_URLS: Record<string, LearnDocLink> = {
  // ── Instructions Quality ─────────────────────────────────────────────────
  'instructions-empty': {
    label: 'Instructions field requirements',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8#:~:text=instructions',
  },
  'instructions-too-long': {
    label: 'Instructions 8,000 character limit',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices#:~:text=Provide%20up%20to%208%2C000%20characters%20of%20detailed%20guidance%20for%20how%20the%20agent%20should%20behave',
  },
  'instructions-no-structure': {
    label: 'Structure instructions in Markdown',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions#:~:text=Use%20%23%2C%20%23%23%2C%20and%20%23%23%23%20for%20section%20headers',
  },
  'instructions-vague-verbs': {
    label: 'Use precise verbs in instructions',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions#:~:text=Use%20precise%2C%20specific%20verbs',
  },
  'instructions-no-tone-format': {
    label: 'Always specify tone, verbosity, and output format',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions#:~:text=Always%20specify%20tone%2C%20verbosity%2C%20and%20output%20format',
  },
  'instructions-no-purpose': {
    label: 'Define a clear agent purpose',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions#:~:text=Purpose',
  },
  'instructions-negative-only': {
    label: 'Focus on what Copilot should do',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions#:~:text=Focus%20on%20what%20Copilot%20should%20do',
  },
  'instructions-no-knowledge-reference': {
    label: 'Explicitly reference capabilities, knowledge, and actions',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions#:~:text=Explicitly%20reference%20capabilities%2C%20knowledge%2C%20and%20actions',
  },
  'instructions-harmful-content': {
    label: 'Responsible AI validation for agents',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/rai-validation',
  },

  // ── Knowledge Sources Quality ─────────────────────────────────────────────
  'knowledge-too-many-websearch-scopes': {
    label: 'WebSearch maximum 4 scoped sites',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/knowledge-sources#:~:text=scope%20your%20web%20search%20to%20up%20to%20four%20public%20websites',
  },
  'knowledge-too-many-teams-urls': {
    label: 'TeamsMessages maximum 5 URLs',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/knowledge-sources#:~:text=scope%20Teams%20knowledge%20to%20up%20to%20five%20Teams%20resources',
  },
  'knowledge-embedded-file-limit': {
    label: 'EmbeddedKnowledge file limits',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/knowledge-sources#:~:text=upload%20files%20directly%20from%20your%20device%20or%20the%20cloud',
  },
  'knowledge-irrelevant-sources': {
    label: 'Be selective about knowledge sources',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices#:~:text=Relevance%20over%20quantity%3A%20Be%20selective%20about%20what%20knowledge%20you%20add',
  },
  'knowledge-broad-unscoped': {
    label: 'Prefer scoped knowledge sources',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices#:~:text=adding%20specific%20chat%20threads%20yields%20more%20targeted%20results',
  },
  'knowledge-no-sources-but-claims-grounding': {
    label: 'Knowledge sources and grounding consistency',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices#:~:text=Relevance%20over%20quantity%3A%20Be%20selective%20about%20what%20knowledge%20you%20add',
  },

  // ── Capabilities Fit ──────────────────────────────────────────────────────
  'capabilities-code-interpreter-not-referenced': {
    label: 'Explicitly reference capabilities in instructions',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions#:~:text=Explicitly%20reference%20capabilities%2C%20knowledge%2C%20and%20actions',
  },
  'capabilities-onedrive-not-referenced': {
    label: 'Explicitly reference capabilities in instructions',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions#:~:text=Explicitly%20reference%20capabilities%2C%20knowledge%2C%20and%20actions',
  },
  'capabilities-duplicate-type': {
    label: 'Declarative agent capabilities schema',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8#:~:text=capabilities',
  },

  // ── Actions Quality ───────────────────────────────────────────────────────
  'actions-exceeds-limit': {
    label: 'Actions maximum 10 limit',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8#:~:text=actions',
  },
  'actions-missing-is-consequential': {
    label: 'Consequential actions and user confirmation',
    url: 'https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/review-copilot-validation-guidelines?context=/microsoft-365/copilot/extensibility/context#:~:text=Consequential%20actions%20(Create%2C%20Update%2C%20or%20Delete%20API%20calls)%20must%20require%20explicit%20user%20permission',
  },
  'actions-not-referenced-in-instructions': {
    label: 'Reference actions in instructions',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions#:~:text=Explicitly%20reference%20capabilities%2C%20knowledge%2C%20and%20actions',
  },

  // ── Conversation Starters Quality ─────────────────────────────────────────
  'starters-too-few': {
    label: 'Minimum 3 conversation starters required',
    url: 'https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/review-copilot-validation-guidelines?context=/microsoft-365/copilot/extensibility/context#:~:text=A%20declarative%20agent%20or%20a%20custom%20engine%20agent%20must%20have%20at%20least%20three%20prompts',
  },
  'starters-too-many': {
    label: 'Maximum 12 conversation starters (schema v1.8)',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8#:~:text=conversation_starters',
  },
  'starters-identical': {
    label: 'Conversation starters must be unique',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8#:~:text=conversation_starters',
  },
  'starters-not-relevant': {
    label: 'Starters should reflect core capabilities',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices#:~:text=Include%20a%20minimum%20of%20three%20sample%20prompts%20that%20reflect%20the%20core%20capabilities%20of%20your%20agent',
  },
  'starters-not-diverse': {
    label: 'Diverse conversation starters',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices#:~:text=Include%20a%20minimum%20of%20three%20sample%20prompts%20that%20reflect%20the%20core%20capabilities%20of%20your%20agent',
  },
  'starters-missing-title': {
    label: 'Conversation starter title field',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8#:~:text=conversation_starters',
  },
  'starters-empty-text': {
    label: 'Conversation starter text requirement',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8#:~:text=conversation_starters',
  },

  // ── Graceful Error Handling ───────────────────────────────────────────────
  'error-handling-no-scope-rejection': {
    label: 'Configure guardrails in agent instructions',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=Only%20respond%20to%20messages%20that%20are%20relevant',
  },
  'error-handling-no-invalid-input': {
    label: 'Configure guardrails in agent instructions',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=Only%20respond%20to%20messages%20that%20are%20relevant',
  },
  'error-handling-no-inappropriate-language': {
    label: 'Configure guardrails in agent instructions',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=Only%20respond%20to%20messages%20that%20are%20relevant',
  },
  'error-handling-no-fallback': {
    label: 'Configure guardrails in agent instructions',
    url: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance#:~:text=Only%20respond%20to%20messages%20that%20are%20relevant',
  },
};

/**
 * Top-level Learn doc link for the DA schema reference (used in the schema version badge).
 */
export const SCHEMA_LEARN_DOCS: Record<string, LearnDocLink> = {
  'v1.8': {
    label: 'Declarative agent schema v1.8',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8',
  },
  'v1.7': {
    label: 'Declarative agent schema v1.7',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.7',
  },
  'v1.6': {
    label: 'Declarative agent schema v1.6',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.6',
  },
  'v1.5': {
    label: 'Declarative agent schema v1.5',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.5',
  },
  'v1.4': {
    label: 'Declarative agent schema v1.4',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.4',
  },
  'v1.3': {
    label: 'Declarative agent schema v1.3',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.3',
  },
  'v1.2': {
    label: 'Declarative agent schema v1.2',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.2',
  },
  default: {
    label: 'Declarative agent schema reference',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-declarative-agent',
  },
};

/**
 * Microsoft Learn pages that the deterministic package checks cite as their
 * guidance URL. The review page shows each page one time, with this label.
 */
export const PACKAGE_GUIDANCE_DOCS = {
  declarativeAgentManifest: {
    label: 'Declarative agent manifest reference',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8',
  },
  apiPluginManifest: {
    label: 'API plugin manifest reference',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api-plugin-manifest-2.4',
  },
  confirmationPrompts: {
    label: 'Confirmation prompts for plugin actions',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api-plugin-confirmation-prompts',
  },
  localization: {
    label: 'Localize your agent',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/localize-agents',
  },
  connectedAgents: {
    label: 'Connected agents',
    url: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-connected-agent',
  },
  agentSkills: {
    label: 'Agent skills',
    url: 'https://learn.microsoft.com/microsoft-365/copilot/extensibility/declarative-agent-skills',
  },
} as const satisfies Record<string, LearnDocLink>;
