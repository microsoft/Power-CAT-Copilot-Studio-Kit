import type { StandardTabId } from '../../adapters/standardReviewShellModel';
import type { StandardWorkspaceId } from './StandardWorkspaceNavigation';

/** The workspace ids of the standard review page, in the order of the workspace tabs. */
export const STANDARD_WORKSPACE_IDS: readonly StandardWorkspaceId[] = ['findings', 'agent-map', 'harness'];

/** The content tab ids of the Review findings workspace. */
export const STANDARD_FINDING_TAB_IDS: readonly StandardTabId[] = ['patterns', 'compliance'];

/**
 * The content tab ids of the Harness workspace, in the order of the content tabs.
 * The first id is the default tab of the workspace.
 */
export const STANDARD_HARNESS_TAB_IDS = ['upgrade-readiness', 'harness-fit'] as const;

/** A content tab id of the Harness workspace. */
export type StandardHarnessTabId = (typeof STANDARD_HARNESS_TAB_IDS)[number];

/** A value of the shared `tab` URL parameter of the standard review page. */
export type StandardContentTabId = StandardTabId | StandardHarnessTabId;

/** Returns true when the value is a workspace id of the standard review page. */
export function isStandardWorkspaceId(value: string): value is StandardWorkspaceId {
  return (STANDARD_WORKSPACE_IDS as readonly string[]).includes(value);
}

/** Returns true when the value is a content tab id of the Review findings workspace. */
export function isStandardFindingTabId(value: string): value is StandardTabId {
  return (STANDARD_FINDING_TAB_IDS as readonly string[]).includes(value);
}

/** Returns true when the value is a content tab id of the Harness workspace. */
export function isStandardHarnessTabId(value: string): value is StandardHarnessTabId {
  return (STANDARD_HARNESS_TAB_IDS as readonly string[]).includes(value);
}

/** Returns the content tab that a workspace shows when the URL has no valid tab for it. */
export function defaultStandardContentTab(workspace: StandardWorkspaceId): StandardContentTabId {
  return workspace === 'harness' ? STANDARD_HARNESS_TAB_IDS[0] : 'patterns';
}

/**
 * Returns the check for the `tab` URL parameter of a workspace.
 * The Architecture workspace uses the finding tab check, so the selected
 * finding tab stays the same when the maker goes back to Review findings.
 */
export function standardContentTabValidator(workspace: StandardWorkspaceId): (value: string) => boolean {
  return workspace === 'harness' ? isStandardHarnessTabId : isStandardFindingTabId;
}
