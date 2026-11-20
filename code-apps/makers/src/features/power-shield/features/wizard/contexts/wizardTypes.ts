import type { AnswerType, ParticipantRole } from '../../../models/status';
import type { PpEnvironment } from '../../../models/environment';
import type { ActionOverrideMap } from '../../../models/connectorAction';
import type { CloneableWizardData } from '../../../shared/services/dataverse/wizardDraftService';

export interface WizardAnswer {
  questionId: string;
  questionText: string;
  answerType: AnswerType;
  isRequired: boolean;
  answerValue: string;
  /** false when the parent condition is not met; defaults to true when absent */
  isApplicable?: boolean;
}

export interface WizardParticipant {
  dvUserId: string;
  aadObjectId: string;
  upn: string;
  displayName: string;
  role: ParticipantRole;
}

export interface WizardSelectedEnvironment {
  environmentId: string;  // PP environment unique ID (from API value.name)
  displayName: string;    // PP environment display name (from API value.properties.displayName)
}

export interface WizardSelectedConnector {
  connectorId: string;
  displayName: string;
  connectorKey: string;
  connectorDetailsUrl?: string;
  connectorName?: string;
}

export interface WizardCustomConnectorPattern {
  tempId: string;            // crypto.randomUUID() for React keys
  hostUrlPattern: string;    // cat_name
  dataGroup: 1 | 2 | 3;     // 1=Non-business, 2=Business, 3=Blocked
  order: number;             // cat_order (1-based)
}

export interface WizardState {
  draftRequestId?: string;
  highestCompletedStep: 0 | 1 | 2 | 3 | 4;
  /** Whether the admin has configured questionnaire questions. Set on wizard mount. */
  hasQuestionnaire: boolean | null;
  /** Set to true after the maker dismisses the DLP clone warning (clone or continue). Resets on Service Tree change. */
  cloneWarningDismissed: boolean;
  serviceTreeId?: string;
  serviceTreeName?: string;
  selectedEnvironments: WizardSelectedEnvironment[];
  cachedEnvironments: PpEnvironment[] | null;
  selectedEnvironmentGroupId?: string;
  selectedEnvironmentGroupName?: string;
  /** Environment IDs whose admin access has already been verified this session. */
  validatedEnvironmentIds: string[];
  answers: WizardAnswer[];
  selectedConnectors: WizardSelectedConnector[];
  /** Per-connector action overrides set by the maker. Key = connectorId (Dataverse GUID). */
  connectorActionOverrides: Record<string, ActionOverrideMap>;
  customConnectorPatterns: WizardCustomConnectorPattern[];
  justification: string;
  supportingDocument?: File;
  participants: WizardParticipant[];
}

export const WIZARD_INITIAL_STATE: WizardState = {
  highestCompletedStep: 0,
  hasQuestionnaire: null,
  cloneWarningDismissed: false,
  selectedEnvironments: [],
  cachedEnvironments: null,
  validatedEnvironmentIds: [],
  answers: [],
  selectedConnectors: [],
  connectorActionOverrides: {},
  customConnectorPatterns: [],
  justification: '',
  participants: [],
};

export type WizardAction =
  | { type: 'SET_SERVICE_TREE'; payload: { id: string; name: string } }
  | { type: 'CLEAR_SERVICE_TREE' }
  | { type: 'SET_ENVIRONMENTS'; payload: WizardSelectedEnvironment[] }
  | { type: 'SET_ENVIRONMENT_GROUP'; payload: { id: string; name: string } | undefined }
  | { type: 'SET_ANSWER'; payload: WizardAnswer }
  | { type: 'SET_HAS_QUESTIONNAIRE'; payload: boolean }
  | { type: 'SET_CONNECTORS'; payload: WizardSelectedConnector[] }
  | { type: 'SET_CONNECTOR_ACTION_OVERRIDES'; payload: { connectorId: string; overrides: ActionOverrideMap } }
  | { type: 'SET_CUSTOM_CONNECTOR_PATTERNS'; payload: WizardCustomConnectorPattern[] }
  | { type: 'SET_JUSTIFICATION'; payload: string }
  | { type: 'SET_DOCUMENT'; payload: File | undefined }
  | { type: 'SET_PARTICIPANTS'; payload: WizardParticipant[] }
  | { type: 'CACHE_ENVIRONMENTS'; payload: PpEnvironment[] }
  | { type: 'CACHE_VALIDATED_ENVS'; payload: string[] }
  | { type: 'ADVANCE_STEP'; payload: 1 | 2 | 3 | 4 }
  | { type: 'LOAD_DRAFT'; payload: WizardState }
  | { type: 'MERGE_CLONE_DATA'; payload: CloneableWizardData }
  | { type: 'DISMISS_CLONE_WARNING' }
  | { type: 'RESET' };
