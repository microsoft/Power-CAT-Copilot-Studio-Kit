import type { Rule } from './ruleTypes.js';
import { norm } from './ruleTypes.js';

const FAMILY = 'Instructions';

/**
 * Characters that render as nothing, or that reorder what follows them.
 *
 * Deliberately excludes ordinary whitespace and newlines: the point is
 * characters a maker cannot see in the designer but that still reach the model.
 */
const HIDDEN_CHARACTERS = new Set([
  0x00AD, // soft hyphen
  0x180E, // Mongolian vowel separator
  0x200B, // zero-width space
  0x200C, // zero-width non-joiner
  0x200D, // zero-width joiner
  0x2060, // word joiner
  0xFEFF, // zero-width no-break space / BOM
  0x202A, 0x202B, 0x202C, 0x202D, 0x202E, // bidi embedding and overrides
  0x2066, 0x2067, 0x2068, 0x2069, // bidi isolates
]);

const HIDDEN_CHARACTER_NAMES: Record<string, string> = {
  'U+00AD': 'soft hyphen',
  'U+180E': 'Mongolian vowel separator',
  'U+200B': 'zero-width space',
  'U+200C': 'zero-width non-joiner',
  'U+200D': 'zero-width joiner',
  'U+2060': 'word joiner',
  'U+FEFF': 'zero-width no-break space',
  'U+202A': 'left-to-right embedding',
  'U+202B': 'right-to-left embedding',
  'U+202C': 'pop directional formatting',
  'U+202D': 'left-to-right override',
  'U+202E': 'right-to-left override',
  'U+2066': 'left-to-right isolate',
  'U+2067': 'right-to-left isolate',
  'U+2068': 'first strong isolate',
  'U+2069': 'pop directional isolate',
};

export const instructionRules: Rule[] = [
  {
    id: 'INS-01', family: FAMILY, severity: 'error', referenceId: 'ms-authoring-instructions',
    check(model) {
      const text = model.agentSettings.instructions.trim();
      if (text.length === 0) {
        return {
          id: 'INS-01', family: FAMILY, severity: 'error', referenceId: 'ms-authoring-instructions', ai: false,
          title: 'No instructions are configured',
          fact: 'instructions are empty',
          why: 'Instructions are required to define the agent\'s role, behavior, boundaries, ambiguity handling, and escalation guidance.',
          fix: 'Add instructions that define the agent\'s role, tone, boundaries, ambiguity handling, and escalation.',
        };
      }
      if (text.length >= 40) return null;
      return {
        id: 'INS-01', family: FAMILY, severity: 'error', referenceId: 'ms-authoring-instructions', ai: false,
        title: 'Instructions are missing or trivial',
        fact: `instructions length: ${text.length} characters`,
        why: 'Instructions are the primary control over a GitHub Copilot agent — role, tone, boundaries, and escalation all come from them.',
        fix: 'Write instructions covering the agent\'s role, tone, boundaries, ambiguous-input handling, and escalation.',
      };
    },
  },
  {
    id: 'INS-07', family: FAMILY, severity: 'error', referenceId: 'ms-authoring-instructions',
    check(model) {
      const text = norm(model.agentSettings.instructions);
      if (!text) return null;
      const configured = [
        ...model.tools.map(t => t.name), ...model.skills.map(s => s.frontmatterName ?? s.name),
        ...model.connectedAgents.map(a => a.name), ...model.knowledge.map(k => k.name),
      ].map(norm);
      // Match "the X tool" / "use X" style references to a named capability.
      const named = [...text.matchAll(/(?:the|use|call|invoke|run)\s+([a-z0-9][a-z0-9 -]{2,40}?)\s+(?:tool|skill|agent|action|flow)\b/g)]
        .map(m => norm(m[1]));
      const missing = named.filter(n => !configured.some(c => c === n || c.includes(n) || n.includes(c)));
      if (missing.length === 0) return null;
      return {
        id: 'INS-07', family: FAMILY, severity: 'error', referenceId: 'ms-authoring-instructions', ai: false,
        title: 'Instructions reference a capability the agent does not have',
        fact: `named but not configured: ${missing.join(', ')}`,
        why: 'An agent cannot act on instructions to use a tool, skill, or knowledge source it is not configured with.',
        fix: 'Add the referenced capability to the agent, or remove the reference from the instructions.',
      };
    },
  },
  {
    id: 'INS-08', family: FAMILY, severity: 'warning', referenceId: 'ms-authoring-instructions',
    check(model) {
      const text = norm(model.agentSettings.instructions);
      if (!/\bcitations?\b|\breferences?\b/.test(text)) return null;
      if (!/\b(format|structure|display|show|hide|remove|suppress)\b/.test(text)) return null;
      return {
        id: 'INS-08', family: FAMILY, severity: 'warning', referenceId: 'ms-authoring-instructions', ai: false,
        title: 'Instructions attempt to alter citation behavior',
        fact: 'instructions mention citations/references together with a formatting/visibility verb',
        why: 'Modifying or suppressing the system citation format can make the orchestrator treat responses as ungrounded and discard them.',
        fix: 'Remove instructions that change how citations are generated, structured, or displayed.',
      };
    },
  },
  {
    /*
     * Zero-width and bidirectional control characters in instructions.
     *
     * Found on ZAVA Visual Merchandiser: `\u200B\u200C` sat immediately after
     * "Reference the bay and fixture by name." — invisible in every editor, and
     * no rule caught it. The AI stage noticed and correctly treated it as
     * untrusted, but an agent should not depend on the model to spot this.
     *
     * These characters are a known prompt-injection carrier: text can be hidden
     * from a reviewer while remaining in the model's context, and RIGHT-TO-LEFT
     * OVERRIDE can visually reorder a line so it reads differently from what is
     * sent. Benign copy-paste from a word processor produces them too, which is
     * why this is a warning rather than an error — but either way the maker
     * cannot see them without being told.
     */
    id: 'INS-09', family: FAMILY, severity: 'warning', referenceId: 'ms-authoring-instructions',
    check(model) {
      const text = model.agentSettings.instructions;
      if (!text) return null;
      const found = new Map<string, number>();
      for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0;
        if (!HIDDEN_CHARACTERS.has(code)) continue;
        const key = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
        found.set(key, (found.get(key) ?? 0) + 1);
      }
      if (found.size === 0) return null;
      const detail = [...found.entries()]
        .map(([key, count]) => `${key} (${HIDDEN_CHARACTER_NAMES[key] ?? 'control'}) x${count}`)
        .join(', ');
      return {
        id: 'INS-09', family: FAMILY, severity: 'warning', referenceId: 'ms-authoring-instructions', ai: false,
        title: 'Instructions contain invisible characters',
        fact: `hidden characters: ${detail}`,
        why: 'Zero-width and bidirectional control characters are invisible in the designer but remain in the model prompt, so instructions can differ from what a reviewer sees. They are a known way to hide injected text.',
        fix: 'Retype the affected line, or paste as plain text, so the instructions contain only visible characters.',
      };
    },
  },
];
