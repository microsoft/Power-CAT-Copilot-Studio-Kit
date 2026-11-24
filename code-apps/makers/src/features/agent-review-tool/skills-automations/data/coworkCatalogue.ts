/**
 * Cowork platform capability snapshot (spec 018).
 *
 * Taken from Microsoft's published Cowork capability catalogue. The version
 * constant is carried verbatim so a finding can name exactly what it was
 * checked against, and `snapshotDate` drives the staleness policy that softens
 * these findings once the snapshot ages.
 *
 * Do not edit tool names to "tidy" them. They are matched against skill text,
 * so a renamed entry silently stops detecting a real problem.
 */
import type { PlatformCatalogue } from '../contracts/PlatformCatalogue';

export const COWORK_CATALOGUE_VERSION = '2026-07-28';

/**
 * Cowork tool surface: Microsoft 365 first, plus local file and shell access.
 *
 * The published snapshot contains no `browser_*` entry. That supports a
 * compatibility warning, but not an unconditional failure: the evaluator
 * keeps the finding pending until the dependency is confirmed.
 */
const COWORK_TOOLS = [
  'm365_teams/ListChats',
  'm365_teams/ListChatMessages',
  'm365_teams/SendChatMessage',
  'm365_teams/ListTeams',
  'm365_teams/ListChannels',
  'm365_teams/ListChannelMessages',
  'm365_teams/SendChannelMessage',
  'm365_teams/GetMeetingTranscript',
  'outlook/ListMessages',
  'outlook/GetMessage',
  'outlook/SendMail',
  'outlook/ReplyToMessage',
  'outlook/ForwardMessage',
  'outlook/CreateDraft',
  'outlook/ListMailFolders',
  'outlook/MoveMessage',
  'outlook_calendar/ListEvents',
  'outlook_calendar/GetEvent',
  'outlook_calendar/CreateEvent',
  'outlook_calendar/UpdateEvent',
  'outlook_calendar/CancelEvent',
  'outlook_calendar/FindMeetingTimes',
  'outlook_calendar/GetSchedule',
  'sharepoint_onedrive/ListItems',
  'sharepoint_onedrive/GetItem',
  'sharepoint_onedrive/DownloadFile',
  'sharepoint_onedrive/UploadFile',
  'sharepoint_onedrive/CreateFolder',
  'sharepoint_onedrive/Search',
  'sharepoint_onedrive/ShareItem',
  'me_profile/GetMe',
  'me_profile/GetManager',
  'me_profile/GetDirectReports',
  'me_profile/GetPhoto',
  'm365_search/SearchM365',
  'graph/Get',
  'graph/Post',
  'graph/Patch',
  'graph/Delete',
  'pbi_fabricaihub/ListWorkspaces',
  'pbi_fabricaihub/ListDatasets',
  'pbi_fabricaihub/QueryDataset',
  'Read',
  'Glob',
  'Grep',
  'Write',
  'Edit',
  'Bash',
  'core/web_fetch',
  'core/web_search',
] as const;

/**
 * Skills Cowork already ships.
 *
 * A skill that re-implements one of these is not necessarily wrong. The
 * evaluator treats overlap as pending authoring advice.
 */
const COWORK_BUILT_IN_SKILLS = [
  'pptx',
  'docx',
  'xlsx',
  'pdf',
  'loop',
  'canvas',
  'deep-research',
  'code-review',
  'security-review',
  'powerbi',
  'calendar-management',
  'email-triage',
  'meeting-notes',
  'web-artifacts-builder',
  'spfx',
] as const;

export const coworkCatalogue: PlatformCatalogue = {
  runtime: 'cowork',
  version: COWORK_CATALOGUE_VERSION,
  snapshotDate: '2026-07-28',
  tools: COWORK_TOOLS,
  builtInSkills: COWORK_BUILT_IN_SKILLS,
  supportsBrowserAutomation: false,
  namePattern: /^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/,
  namePatternLabel:
    '1-64 lowercase letters or digits separated by single hyphens, with no leading or trailing hyphen',
  preferredClis: ['gh'],
};
