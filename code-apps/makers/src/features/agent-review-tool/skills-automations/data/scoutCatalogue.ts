/**
 * Scout platform capability snapshot (spec 018).
 *
 * Scout differs from Cowork in two ways that matter to review: its data access
 * runs through Work IQ rather than direct Graph calls, and it does have browser
 * tools — but only as a last-resort fallback, after a CLI or an API.
 */
import type { PlatformCatalogue } from '../contracts/PlatformCatalogue';

export const SCOUT_CATALOGUE_VERSION = '2026-07-26';
export const SCOUT_AUTOMATION_CATALOGUE_VERSION = '2026-07-26';

const SCOUT_TOOLS = [
  'workiq_ask',
  'workiq_retrieve',
  'workiq_fetch',
  'workiq_fetch_blob',
  'workiq_search_paths',
  'workiq_get_schema',
  'workiq_create_entity',
  'workiq_update_entity',
  'workiq_delete_entity',
  'workiq_do_action',
  'workiq_call_function',
  'workiq_list_agents',
  'view',
  'glob',
  'grep',
  'write',
  'edit',
  'web_fetch',
  'web_search',
  'bash',
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_snapshot',
  'browser_screenshot',
  'browser_evaluate',
  'browser_wait_for',
  'browser_select_option',
  'browser_press_key',
  'browser_close',
  'browser_tabs',
  'browser_file_upload',
  'browser_network_requests',
  'browser_console_messages',
  'browser_resize',
] as const;

const SCOUT_BUILT_IN_SKILLS = [
  'pptx',
  'docx',
  'xlsx',
  'loop',
  'web-artifacts-builder',
  'expense-report',
  'excalidraw',
] as const;

export const scoutCatalogue: PlatformCatalogue = {
  runtime: 'scout',
  version: SCOUT_CATALOGUE_VERSION,
  snapshotDate: '2026-07-26',
  tools: SCOUT_TOOLS,
  builtInSkills: SCOUT_BUILT_IN_SKILLS,
  supportsBrowserAutomation: true,
  preferredClis: ['gh', 'az'],
};

/**
 * Browser tool names, used by the runtime rules.
 *
 * Shared from here so Cowork's "these tools do not exist" check and Scout's
 * "prefer a CLI over a browser" check test the same list. Two copies would
 * drift, and then the two runtimes would disagree about what a browser tool is.
 */
export const BROWSER_TOOL_NAMES = SCOUT_TOOLS.filter((t) => t.startsWith('browser_'));
