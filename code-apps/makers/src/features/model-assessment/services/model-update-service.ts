/**
 * Changes a Copilot Studio agent's primary model, publishing it only for Kit evaluations.
 *
 * Standard agents keep the model in the `<schema>.gpt.default` botcomponent
 * (componenttype 15) YAML at `aISettings.model` ({ kind?, modelNameHint });
 * Copilot harness agents keep it in `bot.configuration.agentSettings.model.series`.
 * Copilot Studio has no supported model catalogue API, so the lists below mirror what
 * its own model picker requests (`featureSettings/modelSettings/v2`, supportedBy Default
 * and CLI) in Copilot Studio's order, read on 22 Oct 2026. Each code is the catalogue's
 * `modelHint`, which is what Copilot Studio writes to the agent. Left out: retired and retiring
 * models (GPT-5.5 Chat retires on 31 Oct 2026), Grok 4.2, whose provider (xAI) is off unless an
 * admin allows it, and Claude Fable 5 and 5.1, which most organisations turn off because they
 * don't meet zero data retention (ZDR).
 * An agent already on a left-out model still shows it as its current model.
 */

import yaml from 'js-yaml';
import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import { listDataverseRows } from '../../../shared/services/dataversePaging';
import { modelDisplayName } from '../contracts/model-display';
import { sameModel } from '../contracts/model-assessment';

const ORG = 'current';
const ACCEPT = 'application/json';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLISH_POLL_MS = 5_000;
const PUBLISH_TIMEOUT_MS = 5 * 60_000;

export interface ModelOption {
  code: string;
  /** Release channel written as `kind`; omitted for generally available models. */
  kind?: 'PreviewModels' | 'ExperimentalModels';
}

export class AgentModelPublishError extends Error {
  readonly option: ModelOption;

  constructor(option: ModelOption, cause: unknown) {
    const detail = typeof cause === 'string'
      ? cause
      : typeof cause === 'object' && cause !== null && 'message' in cause && typeof cause.message === 'string'
        ? cause.message
        : 'Dataverse rejected the publishing request.';
    super(`The model was saved, but publishing could not be confirmed. ${detail} Retry publishing before running Kit tests.`, { cause });
    this.name = 'AgentModelPublishError';
    this.option = option;
  }
}

export const STANDARD_MODELS: readonly ModelOption[] = [
  { code: 'GPT5Chat' },
  { code: 'GPT5Auto', kind: 'PreviewModels' },
  { code: 'GPT5Reasoning', kind: 'PreviewModels' },
  { code: 'GPT41' },
  { code: 'GPT56Chat' },
  { code: 'Sonnet46' },
  { code: 'opus4-1' },
  { code: 'Opus47' },
  { code: 'Opus48' },
];

// Auto is not in the catalogue but is a valid harness series that Copilot Studio writes.
export const HARNESS_MODELS: readonly ModelOption[] = [
  { code: 'Auto' },
  { code: 'GPT5Chat' },
  { code: 'GPT56Reasoning' },
  { code: 'GPT56ReasoningLuna' },
  { code: 'GPT56ReasoningTerra' },
  { code: 'gpt-6-astra' },
  { code: 'gpt-6-sol' },
  { code: 'gpt-6-1-sol' },
  { code: 'gpt-6-luna' },
  { code: 'Sonnet46' },
  { code: 'Sonnet5' },
  { code: 'claude-sonnet-5-5' },
  { code: 'claude-haiku-5-5' },
  { code: 'Opus48' },
  { code: 'claude-opus-5' },
  { code: 'claude-opus-5-5' },
];

/**
 * The static models for the agent's harness, led by its current model when that one is not listed.
 * Preview and experimental models are left out when the environment doesn't allow them.
 */
export function modelOptionsFor(
  harness: boolean,
  current?: string,
  allowPreview = true,
): readonly ModelOption[] {
  const all = harness ? HARNESS_MODELS : STANDARD_MODELS;
  const models = all.filter((option) => allowPreview || !option.kind);
  const code = current?.trim();
  if (!code || models.some((option) => sameModel(option.code, code))) return models;
  return [all.find((option) => sameModel(option.code, code)) ?? { code }, ...models];
}

/**
 * Whether the environment allows preview and experimental AI models: the Power Platform admin center
 * setting "Preview and experimental AI models", stored as `organization.paipreviewscenarioenabled`.
 */
export async function getPreviewModelsEnabled(): Promise<boolean> {
  const rows = await listDataverseRows(ORG, 'organizations', { select: 'paipreviewscenarioenabled' });
  return rows[0]?.paipreviewscenarioenabled !== false;
}

export const modelOptionLabel = (option: ModelOption): string => {
  const name = modelDisplayName(option.code);
  if (option.kind === 'PreviewModels') return `${name} (Preview)`;
  if (option.kind === 'ExperimentalModels') return `${name} (Experimental)`;
  return name;
};

const indentOf = (line: string) => line.length - line.trimStart().length;

/** Replace only the `aISettings.model` block of a GPT component, keeping everything else verbatim. */
export function setModelInGptYaml(data: string, option: ModelOption): string {
  const lines = data.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  const block = (indent: string) => [
    `${indent}model:`,
    ...(option.kind ? [`${indent}  kind: ${option.kind}`] : []),
    `${indent}  modelNameHint: ${option.code}`,
  ];

  const ai = lines.findIndex((line) => /^aISettings:\s*$/.test(line));
  if (ai < 0) {
    if (lines.some((line) => /^aISettings:/.test(line))) throw new Error('The agent model settings have an unexpected format.');
    lines.push('aISettings:', ...block('  '));
  } else {
    let end = ai + 1;
    while (end < lines.length && (lines[end].trim() === '' || indentOf(lines[end]) > 0)) end++;
    const firstChild = lines.slice(ai + 1, end).find((line) => line.trim() !== '');
    const indent = firstChild ? ' '.repeat(indentOf(firstChild)) : '  ';
    const model = lines.findIndex((line, i) => i > ai && i < end && line === `${indent}model:`);
    if (model < 0) {
      if (lines.slice(ai + 1, end).some((line) => line.startsWith(`${indent}model:`))) {
        throw new Error('The agent model settings have an unexpected format.');
      }
      lines.splice(ai + 1, 0, ...block(indent));
    } else {
      let stop = model + 1;
      while (stop < end && (lines[stop].trim() === '' || indentOf(lines[stop]) > indent.length)) stop++;
      lines.splice(model, stop - model, ...block(indent));
    }
  }

  const next = `${lines.join('\n')}\n`;
  const parsed = yaml.load(next) as { aISettings?: { model?: { modelNameHint?: unknown } } } | undefined;
  if (parsed?.aISettings?.model?.modelNameHint !== option.code) {
    throw new Error('Could not update the agent model settings safely.');
  }
  return next;
}

type Row = Record<string, unknown>;

async function update(entitySet: string, id: string, item: Row): Promise<void> {
  const result = await MicrosoftDataverseService.UpdateRecordWithOrganization('return=minimal', ACCEPT, ORG, entitySet, id, item);
  if (!result.success) throw new Error('Could not save the new model to the agent.');
}

async function setStandardModel(botId: string, option: ModelOption): Promise<void> {
  const rows = await listDataverseRows(ORG, 'botcomponents', {
    select: 'botcomponentid,schemaname,data',
    filter: `_parentbotid_value eq ${botId} and componenttype eq 15 and statecode eq 0`,
  });
  const row = rows.find((r) => String(r['schemaname'] ?? '').toLowerCase().endsWith('.gpt.default')) ?? rows[0];
  const id = row?.['botcomponentid'];
  const data = row?.['data'];
  if (typeof id !== 'string' || typeof data !== 'string') throw new Error('The agent model component was not found.');
  await update('botcomponents', id, { data: setModelInGptYaml(data, option) });
}

async function setHarnessModel(botId: string, option: ModelOption): Promise<void> {
  const rows = await listDataverseRows(ORG, 'bots', { select: 'configuration', filter: `botid eq ${botId}` });
  const raw = rows[0]?.['configuration'];
  if (typeof raw !== 'string') throw new Error('The agent configuration was not found.');
  const configuration = JSON.parse(raw) as { agentSettings?: { model?: Row } };
  if (!configuration.agentSettings) throw new Error('The agent configuration has no model settings.');
  configuration.agentSettings.model = {
    $kind: 'ModelConfig',
    ...configuration.agentSettings.model,
    series: option.code,
  };
  await update('bots', botId, { configuration: JSON.stringify(configuration) });
}

async function getPublishedOn(botId: string): Promise<string | undefined> {
  const rows = await listDataverseRows(ORG, 'bots', { select: 'publishedon', filter: `botid eq ${botId}` });
  if (!rows[0]) throw new Error('The Copilot Studio agent was not found.');
  const publishedOn = rows[0]['publishedon'];
  if (publishedOn === undefined || publishedOn === null) return undefined;
  if (typeof publishedOn !== 'string' || Number.isNaN(Date.parse(publishedOn))) {
    throw new Error('Dataverse returned an invalid agent publication timestamp.');
  }
  return new Date(publishedOn).toISOString();
}

async function publishAgent(botId: string, previousPublishedOn: string | undefined): Promise<void> {
  const result = await MicrosoftDataverseService.PerformBoundActionWithOrganization(
    ORG, 'bots', 'Microsoft.Dynamics.CRM.PvaPublish', botId,
  );
  if (!result.success) throw result.error ?? new Error('The publishing request failed.');

  // Follow Microsoft's publishing sample: action acceptance alone does not mean the draft is live.
  const deadline = Date.now() + PUBLISH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const publishedOn = await getPublishedOn(botId);
    if (publishedOn && publishedOn !== previousPublishedOn) return;
    await new Promise<void>((resolve) => setTimeout(resolve, PUBLISH_POLL_MS));
  }
  throw new Error('Publishing was not confirmed within five minutes and may still be in progress.');
}

/** Copilot Studio evaluations use the saved draft; Kit evaluations require a confirmed publish. */
export async function updateAgentModel(
  botId: string,
  harness: boolean,
  option: ModelOption,
  kitMode = false,
): Promise<void> {
  if (!GUID.test(botId)) throw new Error('A valid Copilot Studio agent ID is required.');
  if (kitMode && harness) throw new Error('Kit evaluations do not support Copilot harness agents.');
  const previousPublishedOn = kitMode ? await getPublishedOn(botId) : undefined;
  await (harness ? setHarnessModel(botId, option) : setStandardModel(botId, option));
  if (kitMode) {
    try {
      await publishAgent(botId, previousPublishedOn);
    } catch (error) {
      throw new AgentModelPublishError(option, error);
    }
  }
}
