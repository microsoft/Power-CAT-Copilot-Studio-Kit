import type { DAManifest } from '../contracts/DAManifest';
import type {
  BoolCheck,
  CountCheck,
  FieldCheck,
  ManifestHealthCheck,
} from '../contracts/ManifestHealthCheck';
import { SCHEMA_LIMITS } from '../contracts/constants';

const PROMPT_OVERRIDE_PHRASES = [
  'ignore previous instructions',
  'ignore all previous instructions',
  'forget previous instructions',
  'replace your instructions',
  'reveal the system prompt',
];
const URL_PATTERN = /https?:\/\/[^\s]+|www\.[^\s]+/i;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

function findPromptOverride(texts: string[]): string | null {
  const combined = texts.join(' ').toLowerCase();
  return PROMPT_OVERRIDE_PHRASES.find((phrase) => combined.includes(phrase)) ?? null;
}

function findUrlsOrEmojis(texts: string[]): string | null {
  const combined = texts.join(' ');
  if (URL_PATTERN.test(combined)) return 'URL found';
  if (EMOJI_PATTERN.test(combined)) return 'Emoji found';
  return null;
}

function checkHttpsOnActionUrls(manifest: DAManifest): BoolCheck {
  const violations: string[] = [];
  for (const [filename, pluginJson] of Object.entries(manifest.pluginFiles)) {
    if (!pluginJson || typeof pluginJson !== 'object') continue;
    const plugin = pluginJson as Record<string, unknown>;
    const runtimes = Array.isArray(plugin.runtimes)
      ? plugin.runtimes as Array<Record<string, unknown>>
      : [];

    for (const runtime of runtimes) {
      const spec = runtime.spec && typeof runtime.spec === 'object'
        ? runtime.spec as Record<string, unknown>
        : {};
      const url = typeof spec.url === 'string' ? spec.url : '';
      if (/^http:\/\//i.test(url)) violations.push(`${filename}: ${url}`);
    }
  }

  return violations.length > 0
    ? {
        pass: false,
        message: `Non-HTTPS runtime URL detected: ${violations.join('; ')}`,
      }
    : { pass: true, message: 'No non-HTTPS runtime URLs were found.' };
}

/**
 * Runs the legacy Stage A summary with stable v1.8 limits.
 *
 * New reviews also use the richer package validation model. This shape stays
 * available so existing saved reviews and the current PDF remain compatible.
 */
export function runManifestHealthCheck(manifest: DAManifest): ManifestHealthCheck {
  const nameLengthValue = manifest.name.length;
  const descriptionLengthValue = manifest.description.length;
  const instructionsLengthValue = manifest.instructions.length;
  const startersCount = manifest.conversationStarters.length;
  const actionsCount = manifest.actions.length;
  const starterTexts = manifest.conversationStarters.flatMap((starter) => [
    starter.title ?? '',
    starter.text,
  ]);

  const nameLength: FieldCheck = {
    value: nameLengthValue,
    limit: SCHEMA_LIMITS.NAME_MAX_LENGTH,
    pass: nameLengthValue <= SCHEMA_LIMITS.NAME_MAX_LENGTH,
    message: `${nameLengthValue} / ${SCHEMA_LIMITS.NAME_MAX_LENGTH} chars`,
  };
  const descriptionLength: FieldCheck = {
    value: descriptionLengthValue,
    limit: SCHEMA_LIMITS.DESCRIPTION_MAX_LENGTH,
    pass: descriptionLengthValue <= SCHEMA_LIMITS.DESCRIPTION_MAX_LENGTH,
    message: `${descriptionLengthValue} / ${SCHEMA_LIMITS.DESCRIPTION_MAX_LENGTH} chars`,
  };
  const instructionsPresent: FieldCheck = {
    value: instructionsLengthValue,
    limit: 1,
    pass: manifest.instructions.trim().length > 0,
    message: manifest.instructions.trim()
      ? 'Instructions are present.'
      : 'Instructions are required.',
  };
  const instructionsLength: FieldCheck = {
    value: instructionsLengthValue,
    limit: SCHEMA_LIMITS.INSTRUCTIONS_MAX_LENGTH,
    pass: instructionsLengthValue <= SCHEMA_LIMITS.INSTRUCTIONS_MAX_LENGTH,
    message: `${instructionsLengthValue} / ${SCHEMA_LIMITS.INSTRUCTIONS_MAX_LENGTH} chars`,
  };
  const conversationStartersCount: CountCheck = {
    value: startersCount,
    max: SCHEMA_LIMITS.STARTERS_MAX_COUNT,
    pass: startersCount <= SCHEMA_LIMITS.STARTERS_MAX_COUNT,
    message: startersCount === 0
      ? 'No conversation starters declared (optional).'
      : `${startersCount} / ${SCHEMA_LIMITS.STARTERS_MAX_COUNT} max`,
  };
  const actionsCountCheck: CountCheck = {
    value: actionsCount,
    max: SCHEMA_LIMITS.ACTIONS_MAX_COUNT,
    pass: actionsCount <= SCHEMA_LIMITS.ACTIONS_MAX_COUNT,
    message: actionsCount === 0
      ? 'No actions declared (optional).'
      : `${actionsCount} / ${SCHEMA_LIMITS.ACTIONS_MAX_COUNT} max`,
  };

  const injectionPhrase = findPromptOverride([manifest.instructions, ...starterTexts]);
  const noPromptInjection: BoolCheck = injectionPhrase
    ? { pass: false, message: `Instruction override phrase detected: "${injectionPhrase}".` }
    : { pass: true, message: 'No instruction override phrases detected.' };
  const urlOrEmoji = findUrlsOrEmojis([manifest.instructions, ...starterTexts]);
  const noUrlsOrEmojis: BoolCheck = urlOrEmoji
    ? { pass: false, message: `${urlOrEmoji} in instructions or conversation starters.` }
    : { pass: true, message: 'No URLs or emojis detected.' };

  return {
    schemaVersion: manifest.schemaVersion,
    versionSupported: {
      pass: manifest.schemaVersion === 'v1.8' || manifest.schemaVersion === 'v1.9',
      message: manifest.schemaVersion === 'v1.8' || manifest.schemaVersion === 'v1.9'
        ? `Declarative-agent version ${manifest.schemaVersion}.`
        : manifest.schemaVersion
          ? `Unsupported declarative-agent version ${manifest.schemaVersion}.`
          : 'Declarative-agent version is missing.',
    },
    nameLength,
    descriptionLength,
    instructionsPresent,
    instructionsLength,
    conversationStartersCount,
    actionsCount: actionsCountCheck,
    colorIconPresent: manifest.iconBase64 !== null,
    daFileResolved: Boolean(manifest.daId || manifest.name || manifest.description),
    nameConsistency: {
      pass: true,
      message: 'App, agent, and plugin display names may differ.',
    },
    noPromptInjection,
    noUrlsOrEmojis,
    isConsequentialFlags: {
      pass: true,
      message: 'Consequential operations are checked against packaged OpenAPI evidence.',
    },
    httpsOnActionUrls: checkHttpsOnActionUrls(manifest),
    mcpStaticDiscovery: {
      pass: true,
      message: 'Plugin v2.4 supports static and dynamic MCP tool discovery.',
    },
  };
}
