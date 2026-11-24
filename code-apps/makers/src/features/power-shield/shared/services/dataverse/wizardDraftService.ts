import { getRequestDetail } from './requestService';
import type { WizardState, WizardAnswer, WizardSelectedEnvironment, WizardSelectedConnector, WizardCustomConnectorPattern } from '../../../features/wizard/contexts/wizardTypes';
import { DATA_GROUP_LABEL_TO_NUM } from '../../../models/customConnectorPattern';
import type { WizardParticipant } from './wizardSubmitService';
import type { RequestDetail } from './requestService';
import type { ActionOverrideMap } from '../../../models/connectorAction';

/** Removes duplicate items from an array, keeping the first occurrence per key. */
function deduplicateBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Maps a RequestDetail to WizardState. Shared logic for loadDraft and loadAsTemplate.
 */
function mapDetailToWizardState(detail: RequestDetail): Omit<WizardState, 'draftRequestId' | 'highestCompletedStep'> {
  // Deduplicate child records — Dataverse may contain duplicates from
  // prior save cycles where delete-then-create failed on the delete side.
  const selectedEnvironments: WizardSelectedEnvironment[] = deduplicateBy(
    detail.environments.map((e) => ({
      environmentId: e.environmentGuid,
      displayName: e.environmentName,
    })),
    (e) => e.environmentId,
  );

  const answers: WizardAnswer[] = deduplicateBy(
    detail.answers.map((a) => ({
      questionId: a.questionId,
      questionText: a.questionTextSnapshot,
      answerType: 'Text' as const,
      isRequired: false,
      answerValue: a.answerValue,
    })),
    (a) => a.questionId,
  );

  const dedupedConnectors = deduplicateBy(detail.connectors, (c) => c.connectorId);

  const selectedConnectors: WizardSelectedConnector[] = dedupedConnectors.map((c) => ({
    connectorId: c.connectorId,
    displayName: c.connectorName ?? '',
    connectorKey: c.connectorKey ?? '',
    connectorName: c.connectorDisplayName,
    connectorDetailsUrl: c.connectorUrl,
  }));

  const connectorActionOverrides: Record<string, ActionOverrideMap> = {};
  for (const c of dedupedConnectors) {
    if (c.actionOverrides && Object.keys(c.actionOverrides).length > 0) {
      connectorActionOverrides[c.connectorId] = c.actionOverrides;
    }
  }

  const customConnectorPatterns: WizardCustomConnectorPattern[] = deduplicateBy(
    (detail.customConnectorPatterns ?? []).map((p) => ({
      tempId: p.id,
      hostUrlPattern: p.hostUrlPattern,
      dataGroup: DATA_GROUP_LABEL_TO_NUM[p.dataGroup] ?? 1,
      order: p.order,
    })),
    (p) => p.hostUrlPattern,
  );

  const participants: WizardParticipant[] = deduplicateBy(
    detail.participants.map((p) => ({
      dvUserId: '',
      aadObjectId: p.participantAadObjectId,
      upn: p.participantUpn,
      displayName: p.participantUpn,
      role: p.role,
    })),
    (p) => p.aadObjectId,
  );

  return {
    serviceTreeId: detail.serviceTreeId,
    serviceTreeName: detail.serviceTreeName,
    selectedEnvironments,
    cachedEnvironments: null,
    validatedEnvironmentIds: [],
    selectedEnvironmentGroupId: detail.environmentGroupId,
    selectedEnvironmentGroupName: detail.environmentGroupName,
    hasQuestionnaire: null,
    cloneWarningDismissed: false,
    answers,
    selectedConnectors,
    connectorActionOverrides,
    customConnectorPatterns,
    justification: detail.justification,
    participants,
  };
}

/**
 * Loads a Draft request from Dataverse and maps it to WizardState so the
 * wizard can resume from where the user left off.
 *
 * @param hasQuestionnaire - Whether the admin has configured questionnaire
 *   questions. Controls the step-index mapping so the inferred
 *   highestCompletedStep matches the current wizard layout.
 *
 * Throws if the request is not in Draft status.
 */
export async function loadDraft(requestId: string, hasQuestionnaire: boolean): Promise<WizardState> {
  // Isolation (SC-002 / FR-017): getRequestDetail strict-asserts the parent is a
  // Connector request (on the raw discriminator) before any child read, so a
  // Credit id can never be loaded into the connector wizard here.
  const detail: RequestDetail = await getRequestDetail(requestId);

  if (detail.status !== 'Draft') {
    throw new Error(`Cannot edit request - status is "${detail.status}", expected "Draft".`);
  }

  const mapped = mapDetailToWizardState(detail);

  // Infer how far the user got based on saved data.
  // Step indices must match the current wizard layout so getResumeStepPath,
  // the deep-link guard, and the step indicator all work correctly.
  let highestCompletedStep: WizardState['highestCompletedStep'] = 0;

  if (mapped.selectedEnvironments.length === 0) {
    // No environment data — start from the beginning
  } else if (hasQuestionnaire) {
    // 5-step layout: Env(1) → Questions(2) → Connectors(3) → Justification(4)
    highestCompletedStep = 1;
    if (mapped.answers.length > 0) {
      highestCompletedStep = 2;
      if (mapped.selectedConnectors.length > 0) {
        highestCompletedStep = 3;
        if (detail.justification.length >= 20) highestCompletedStep = 4;
      }
    }
  } else {
    // 4-step layout: Env(1) → Connectors(2) → Justification(3)
    highestCompletedStep = 1;
    if (mapped.selectedConnectors.length > 0) {
      highestCompletedStep = 2;
      if (detail.justification.length >= 20) highestCompletedStep = 3;
    }
  }

  return {
    ...mapped,
    draftRequestId: requestId,
    highestCompletedStep,
  };
}

/**
 * Loads any request from Dataverse as a wizard template. Used for Resubmit
 * from a Withdrawn request — opens the wizard pre-populated with the source
 * request's data but creates a brand-new record on submit.
 *
 * Unlike loadDraft:
 * - No status guard (accepts any status)
 * - draftRequestId is NOT set — wizard submit creates a fresh request
 * - highestCompletedStep is always 4 so all steps are navigable
 */
export async function loadAsTemplate(requestId: string): Promise<WizardState> {
  // Isolation: getRequestDetail strict-asserts Connector before child reads.
  const detail: RequestDetail = await getRequestDetail(requestId);
  const mapped = mapDetailToWizardState(detail);

  return {
    ...mapped,
    // draftRequestId intentionally omitted — new record will be created on submit
    highestCompletedStep: 4,
  };
}

/**
 * Partial wizard state containing only the data fields that should be merged
 * when a maker clones an approved request from the Step 1 warning dialog.
 */
export interface CloneableWizardData {
  selectedEnvironments: WizardSelectedEnvironment[];
  selectedConnectors: WizardSelectedConnector[];
  connectorActionOverrides: Record<string, ActionOverrideMap>;
  customConnectorPatterns: WizardCustomConnectorPattern[];
}

/**
 * Loads the cloneable data (environments, connectors, action overrides,
 * custom connector patterns) from an existing request. Used by the DLP
 * clone-warning dialog to merge prior approved request data into the
 * current wizard state without overwriting Step 1 selections
 * (service tree, environment group).
 */
export async function loadCloneDataIntoWizard(requestId: string): Promise<CloneableWizardData> {
  // Isolation: getRequestDetail strict-asserts Connector before child reads.
  const detail: RequestDetail = await getRequestDetail(requestId);
  const mapped = mapDetailToWizardState(detail);

  return {
    selectedEnvironments: mapped.selectedEnvironments,
    selectedConnectors: mapped.selectedConnectors,
    connectorActionOverrides: mapped.connectorActionOverrides,
    customConnectorPatterns: mapped.customConnectorPatterns,
  };
}
