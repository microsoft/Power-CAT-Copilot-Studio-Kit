/**
 * Per-component-type "relevant info" extraction.
 *
 * Given a component's YAML body, surface a small set of type-specific facts so
 * the change-timeline cards can show what each component actually is — the
 * trigger phrases of a topic, the source of a knowledge source, the operation a
 * tool calls, the purpose of a connected/child agent, and so on.
 */

import { flattenYaml } from './yaml-summary';
import { ComponentType } from '../contracts/change-tracker';

/** A single labelled fact rendered on a change card. */
export interface ComponentFact {
  label: string;
  value: string;
}

type FlatMap = Map<string, string>;

const MAX_VALUE = 64;

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstOf(map: FlatMap, ...keys: string[]): string {
  for (const key of keys) {
    const value = map.get(key);
    if (value && value.trim()) return value.trim();
  }
  return '';
}

/** Collect bare scalar list items (`prefix.[n]`) in order, up to `max`. */
function listScalars(map: FlatMap, prefix: string, max: number): string[] {
  const re = new RegExp(`^${escapeRe(prefix)}\\.\\[(\\d+)\\]$`);
  const items: { idx: number; value: string }[] = [];
  for (const [key, value] of map) {
    const m = key.match(re);
    if (m && value.trim()) items.push({ idx: Number(m[1]), value: value.trim() });
  }
  items.sort((a, b) => a.idx - b.idx);
  return items.slice(0, max).map((i) => i.value);
}

function truncate(value: string, max = MAX_VALUE): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Reduce a URL to its host so the card stays compact. */
function hostOf(url: string): string {
  const trimmed = url.trim();
  try {
    return new URL(trimmed).host;
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] || trimmed;
  }
}

/** Split a PascalCase / camelCase token into spaced words. */
function spaceCamel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

const KNOWLEDGE_SOURCE_LABEL: Record<string, string> = {
  publicsitesearchsource: 'Public website',
  dataversestructuredsearchsource: 'Dataverse',
  dataversesearchsource: 'Dataverse',
  sharepointsearchsource: 'SharePoint',
  sharepointsource: 'SharePoint',
  onedrivesearchsource: 'OneDrive',
  filesearchsource: 'Uploaded files',
  graphconnectorsearchsource: 'Graph connector',
  customsearchsource: 'Custom source',
  azureopenaisource: 'Azure OpenAI',
};

function friendlySourceKind(kind: string): string {
  const known = KNOWLEDGE_SOURCE_LABEL[kind.toLowerCase()];
  if (known) return known;
  return spaceCamel(kind.replace(/SearchSource$|Source$/, '')) || kind;
}

function topicFacts(map: FlatMap): ComponentFact[] {
  const examples = listScalars(map, 'beginDialog.intent.triggerQueries', 2);
  if (examples.length) {
    return [{ label: 'Triggers on', value: truncate(examples.map((q) => `“${q}”`).join(', '), 72) }];
  }
  return [];
}

function knowledgeFacts(map: FlatMap): ComponentFact[] {
  const facts: ComponentFact[] = [];
  const kind = firstOf(map, 'source.kind');
  if (kind) facts.push({ label: 'Source', value: friendlySourceKind(kind) });

  const site = firstOf(map, 'source.site', 'source.url');
  if (site) facts.push({ label: 'From', value: truncate(hostOf(site), 40) });
  return facts;
}

function toolFacts(map: FlatMap): ComponentFact[] {
  const description = firstOf(map, 'modelDescription', 'description');
  if (description) return [{ label: 'Does', value: truncate(description, 90) }];
  const operation = firstOf(map, 'modelDisplayName', 'displayName');
  return operation ? [{ label: 'Action', value: truncate(operation, 48) }] : [];
}

function agentFacts(map: FlatMap): ComponentFact[] {
  const purpose = firstOf(
    map,
    'beginDialog.description',
    'description',
    'settings.instructions',
    'instructions',
  );
  return purpose ? [{ label: 'Purpose', value: truncate(purpose, 90) }] : [];
}

function instructionsFacts(map: FlatMap): ComponentFact[] {
  const facts: ComponentFact[] = [];
  const model = firstOf(map, 'aISettings.model.modelNameHint', 'model.modelNameHint');
  if (model) facts.push({ label: 'Model', value: model });

  const capabilities: string[] = [];
  if (firstOf(map, 'gptCapabilities.webBrowsing') === 'true') capabilities.push('Web search');
  if (firstOf(map, 'gptCapabilities.codeInterpreter') === 'true') capabilities.push('Code');
  if (firstOf(map, 'gptCapabilities.imageInput') === 'true') capabilities.push('Image input');
  if (capabilities.length) facts.push({ label: 'Capabilities', value: capabilities.join(', ') });
  return facts.slice(0, 2);
}

/**
 * Extract the type-specific facts to display on a component's change card.
 * Returns an empty array when there is nothing meaningful to surface.
 */
export function extractComponentFacts(type: ComponentType, yaml: string | undefined): ComponentFact[] {
  if (!yaml) return [];
  const map = flattenYaml(yaml);
  if (map.size === 0) return [];

  switch (type) {
    case ComponentType.Topic:
      return topicFacts(map);
    case ComponentType.Knowledge:
      return knowledgeFacts(map);
    case ComponentType.Tool:
    case ComponentType.Connector:
    case ComponentType.MCP:
      return toolFacts(map);
    case ComponentType.ChildAgent:
    case ComponentType.Agent:
      return agentFacts(map);
    case ComponentType.Instructions:
      return instructionsFacts(map);
    default:
      return [];
  }
}
