/**
 * Pure (no-I/O) diff engine for the Agent Change Tracker.
 *
 * Compares the agent's current component/setting state against the previously
 * stored snapshot and derives create / update / delete change events. Also owns
 * the helpers for hashing payloads, flattening the `bot.configuration` JSON into
 * individual settings, and turning raw setting paths into friendly labels.
 */

import {
  ChangeType,
  ComponentType,
  isScalarComponentType,
  type Attribution,
  type ChangeLogEntry,
  type ComponentState,
  type SnapshotComponent,
} from '../contracts/change-tracker';

/** Max characters persisted/echoed for a single value (memo columns are large,
 *  but huge component YAML adds no diff value and slows writes). */
const VALUE_CAP = 8000;

/** FNV-1a 32-bit hash — fast, dependency-free, stable across runs. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Trim a value to the persisted cap, appending an ellipsis when truncated. */
export function cap(value: string): string {
  return value.length > VALUE_CAP ? `${value.slice(0, VALUE_CAP)}…` : value;
}

/**
 * Normalise line endings to LF so a component that is merely re-serialised with
 * CRLF (e.g. by a publish) is not mistaken for an edit. Callers hash and compare
 * bodies through this helper so whitespace-only differences never surface as a
 * phantom "Updated" change.
 */
export function normalizeBody(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

/** Friendly labels for the agent settings we surface by name. */
const SETTING_LABELS: Record<string, string> = {
  'settings.GenerativeActionsEnabled': 'Generative orchestration (Reasoning)',
  'aISettings.isFileAnalysisEnabled': 'File uploads',
  'aISettings.useModelKnowledge': 'General knowledge (model)',
  'aISettings.isSemanticSearchEnabled': 'Semantic search',
  'aISettings.contentModeration': 'Content moderation level',
  'aISettings.optInUseLatestModels': 'Use latest models',
  'isAgentConnectable': 'Connected agents (let other agents use this one)',
  // Voice (Settings > Voice > "Enable voice"). Copilot Studio stores the toggle
  // as `isTelephonyEnabled` in the bot configuration; surface it as a single
  // clean "Voice" setting. Enabling it also flips several companion flags
  // (TelephonyInitialized, voiceProcessingMode, realtimeVoiceModel,
  // botSpeechSettings) and auto-provisions system voice topics (Silence,
  // UnrecognizedSpeech, AnsweringMachineDetection, UnknownDtmfKey) — those
  // companions are suppressed (see SUPPRESSED_SETTING_PATHS below and the voice
  // system-topic filter in agent-state-service) so one user action reads as one
  // "Voice enabled" change instead of a dozen noisy cards.
  'isTelephonyEnabled': 'Voice',
  'authenticationConfiguration.type': 'Authentication type',
  // Web channel security > "Require secured access" (Safety & access). Copilot
  // Studio stores the toggle as configuration.settings.AnonymousAccessDisabled —
  // true when secured (anonymous Direct Line access disabled). Label MUST match
  // the Bot Settings flow descriptor (see Deploy-BotSettingsFlow.py) so it
  // reconciles as one clean enable/disable change.
  'settings.AnonymousAccessDisabled': 'Require secured access',
  // Channels (Settings > Channels). Copilot Studio stores the enabled channels
  // as configuration.channels — an array of { channelId, displayName, ... }.
  // flattenSettings serialises the channel list into one canonical "Channels"
  // leaf so adding/removing a channel tracks as a single change. Label MUST
  // match the Bot Settings flow descriptor (see Deploy-BotSettingsFlow.py).
  'channels': 'Channels',
  // New Copilot Studio designer (CLI/declarative agents, template cliagent-*)
  // stores the model + feature toggles under `agentSettings` rather than the
  // classic `aISettings`. Map them to friendly labels that MUST match the
  // labels the Bot Settings flow logs (see Deploy-BotSettingsFlow.py) so a
  // change reconciles as "Updated" instead of being hidden as un-baselined.
  'agentSettings.model.series': 'Model',
  'agentSettings.enableMemory': 'Memory',
  'agentSettings.web.enableWebSearch': 'Web search',
  // Greeting & prompts (Agent settings > Greeting & prompts). greetingText is a
  // plain string; conversationStarters is an array serialised to one canonical
  // line by flattenSettings so it tracks as a single "Suggested prompts" setting
  // (must match the Bot Settings flow's join, see Deploy-BotSettingsFlow.py).
  'agentSettings.greetingText': 'Greeting message',
  'agentSettings.conversationStarters': 'Suggested prompts',
  // Instructions (the agent's system prompt). The new designer stores it as an
  // object { segments: [{ $kind, value }] }; flattenSettings concatenates the
  // segment values into one "Instructions" leaf (must match the Bot Settings
  // flow's join, see Deploy-BotSettingsFlow.py).
  'agentSettings.instructions': 'Instructions',
};

function humanizePath(path: string): string {
  const leaf = path.split('.').pop() ?? path;
  return leaf
    .replace(/^is|^use|^opt(?=In)/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/, (c) => c.toUpperCase())
    .trim();
}

/** A human label for a flattened settings path. */
export function settingLabel(path: string): string {
  if (SETTING_LABELS[path]) return SETTING_LABELS[path];
  // Application Insights telemetry lives under configuration.diagnostics[]; the
  // exact leaf keys are owned by Copilot Studio, so disambiguate the humanized
  // field name with an "Application Insights" prefix instead of hard-coding keys.
  if (/^diagnostics(\.|$)/.test(path)) {
    return `Application Insights: ${humanizePath(path)}`;
  }
  return humanizePath(path);
}

/**
 * Lower-cased friendly labels of every setting the app intentionally tracks and
 * wants surfaced in history: the SETTING_LABELS values plus the synthetic
 * bot-level settings (Authentication / Agent status / Agent icon / Published on).
 * The reconciler uses this as a global allow-list so a tracked setting still
 * surfaces its edits even when it is absent from — or stored under an older
 * label in — a particular agent's baseline snapshot (e.g. Model/Memory/Web
 * search on agents baselined before the new-designer schema was supported, or
 * "Published on" on agents baselined before publish tracking was added).
 * Flow rows that are neither in this set nor in the agent's baseline (e.g.
 * "Authentication trigger") stay suppressed as un-tracked noise.
 */
export const TRACKED_SETTING_LABELS: ReadonlySet<string> = new Set(
  [
    ...Object.values(SETTING_LABELS),
    'Authentication',
    'Agent status',
    'Agent status reason',
    'Agent icon',
    'Published on',
    'Agent name',
    'Primary language',
    'Secondary languages',
    'Multi-tenant support',
  ].map((label) => label.toLowerCase()),
);

/**
 * Configuration paths that are deliberately NOT surfaced as individual settings.
 * These are the companion flags Copilot Studio flips when "Enable voice" is
 * toggled: they carry no standalone meaning to a reader and would each spawn a
 * cryptic card (e.g. "Silence Detection Timeout In Milliseconds") for a single
 * user action. The toggle itself is tracked as the friendly "Voice" setting
 * (`isTelephonyEnabled`, see SETTING_LABELS). A path is suppressed when it equals
 * an entry exactly or is nested beneath one.
 */
const SUPPRESSED_SETTING_PATHS: readonly string[] = [
  'settings.TelephonyInitialized',
  'voiceProcessingMode',
  'realtimeVoiceModel',
  'botSpeechSettings',
];

function isSuppressedSettingPath(path: string): boolean {
  return SUPPRESSED_SETTING_PATHS.some((p) => path === p || path.startsWith(`${p}.`));
}

/**
 * Flatten a parsed agent-configuration object into individual leaf settings.
 * Each leaf becomes its own tracked unit so toggling one setting produces one
 * precise change event. Object containers and noise keys (`$kind`) are skipped.
 */
export function flattenSettings(value: unknown, prefix = ''): Array<{ path: string; value: string }> {
  const out: Array<{ path: string; value: string }> = [];
  if (value === null || value === undefined) return out;
  if (typeof value !== 'object') {
    out.push({ path: prefix, value: String(value) });
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return out;
    // conversationStarters (new-designer suggested prompts) is serialised as a
    // single human-readable leaf ("<title>: <text> | <title>: <text>") so it
    // tracks as one "Suggested prompts" setting and matches the Bot Settings
    // flow's join. Descending per index would create unstable per-item paths
    // that churn whenever a prompt is added, removed or reordered.
    if (/(^|\.)conversationStarters$/.test(prefix)) {
      const joined = value
        .map((v) => {
          const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
          return `${o.title ?? ''}: ${o.text ?? ''}`;
        })
        .join(' | ');
      out.push({ path: prefix, value: joined });
      return out;
    }
    // channels (Settings > Channels) is an array of { channelId, displayName };
    // serialise the channel identifiers into one canonical "Channels" leaf so
    // adding/removing a channel tracks as a single setting change and matches
    // the Bot Settings flow's Select+join (displayName falls back to channelId,
    // which is what Copilot Studio populates — displayName is typically null).
    if (/(^|\.)channels$/.test(prefix)) {
      const joined = value
        .map((v) => {
          const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
          return String(o.displayName ?? o.channelId ?? '');
        })
        .join(' | ');
      out.push({ path: prefix, value: joined });
      return out;
    }
    // Arrays of objects (e.g. configuration.diagnostics — the Application
    // Insights telemetry config) are descended into so each field becomes its
    // own tracked setting; arrays of scalars stay a single JSON leaf.
    const allObjects = value.every((v) => v !== null && typeof v === 'object');
    if (allObjects) {
      value.forEach((v, i) => out.push(...flattenSettings(v, `${prefix}.${i}`)));
    } else {
      out.push({ path: prefix, value: JSON.stringify(value) });
    }
    return out;
  }
  // instructions (new-designer agent system prompt) is an object with a
  // `segments` array of {$kind, value}. Concatenate the segment values into a
  // single "Instructions" leaf so it tracks as one setting and matches the Bot
  // Settings flow's join('') of the same segment values.
  if (/(^|\.)instructions$/.test(prefix)) {
    const segs = (value as Record<string, unknown>).segments;
    const text = Array.isArray(segs)
      ? segs
          .map((s) => {
            const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
            return String(o.value ?? '');
          })
          .join('')
      : '';
    out.push({ path: prefix, value: text });
    return out;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === '$kind') continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (isSuppressedSettingPath(path)) continue;
    out.push(...flattenSettings(v, path));
  }
  return out;
}

function isSetting(state: { componentType: ComponentType }): boolean {
  return isScalarComponentType(state.componentType);
}

/** Concise "after" text for a created/updated component or setting. */
function summarize(state: ComponentState): string {
  if (isSetting(state)) return state.body;
  return cap(state.body);
}

/**
 * Compare current state against the prior snapshot and emit one change entry
 * per created / updated / deleted unit. All entries share `txId` (one Save) and
 * are stamped with `capturedOn` when the source row has no modified date.
 * `capturedBy` attributes changes (especially deletes) to the agent's most
 * recent editor when no component-level author is available.
 */
export function diffStates(
  prev: Map<string, SnapshotComponent>,
  current: ComponentState[],
  txId: string,
  capturedOn: string,
  capturedBy: Attribution = {},
): ChangeLogEntry[] {
  const entries: ChangeLogEntry[] = [];
  const currentKeys = new Set<string>();
  let seq = 0;

  for (const state of current) {
    currentKeys.add(state.key);
    const before = prev.get(state.key);
    if (!before) {
      entries.push({
        id: `${txId}:${seq++}`,
        agentId: '',
        componentType: state.componentType,
        componentId: state.componentId,
        componentName: state.componentName,
        changeType: ChangeType.Created,
        newValue: summarize(state),
        changedOn: state.modifiedOn ?? capturedOn,
        changedByName: state.modifiedByName ?? capturedBy.name,
        saveTransactionId: txId,
      });
    } else if (
      before.hash
        ? before.hash !== state.hash
        : normalizeBody(before.body) !== normalizeBody(cap(state.body))
    ) {
      // Baseline leaves written by the capture flow carry no hash (the flow
      // cannot compute FNV-1a), so fall back to comparing the capped body. Both
      // sides are line-ending normalised so a CRLF re-serialisation from the
      // flow's raw `data` does not re-report a change the flow already logged.
      entries.push({
        id: `${txId}:${seq++}`,
        agentId: '',
        componentType: state.componentType,
        componentId: state.componentId,
        componentName: state.componentName,
        changeType: ChangeType.Updated,
        fieldName: isSetting(state) ? state.componentName : undefined,
        oldValue: isSetting(state) ? before.body : cap(before.body),
        newValue: summarize(state),
        changedOn: state.modifiedOn ?? capturedOn,
        changedByName: state.modifiedByName ?? capturedBy.name,
        saveTransactionId: txId,
      });
    }
  }

  for (const [key, before] of prev) {
    if (currentKeys.has(key)) continue;
    entries.push({
      id: `${txId}:${seq++}`,
      agentId: '',
      componentType: before.componentType,
      componentName: before.componentName,
      changeType: ChangeType.Deleted,
      oldValue: cap(before.body),
      changedOn: capturedOn,
      changedByName: capturedBy.name,
      saveTransactionId: txId,
    });
  }

  return entries;
}
