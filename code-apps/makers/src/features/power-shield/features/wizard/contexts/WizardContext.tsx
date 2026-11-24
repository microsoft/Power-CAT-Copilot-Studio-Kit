/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';
import {
  WIZARD_INITIAL_STATE,
  type WizardAction,
  type WizardState,
} from './wizardTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_SERVICE_TREE':
      return {
        ...state,
        serviceTreeId: action.payload.id,
        serviceTreeName: action.payload.name,
        cloneWarningDismissed: state.serviceTreeId !== action.payload.id ? false : state.cloneWarningDismissed,
      };

    case 'CLEAR_SERVICE_TREE':
      return {
        ...state,
        serviceTreeId: undefined,
        serviceTreeName: undefined,
        cloneWarningDismissed: false,
      };

    case 'SET_ENVIRONMENTS':
      return { ...state, selectedEnvironments: action.payload };

    case 'SET_ENVIRONMENT_GROUP':
      return {
        ...state,
        selectedEnvironmentGroupId: action.payload?.id,
        selectedEnvironmentGroupName: action.payload?.name,
      };

    case 'SET_HAS_QUESTIONNAIRE':
      return { ...state, hasQuestionnaire: action.payload };

    case 'SET_ANSWER': {
      const exists = state.answers.some((a) => a.questionId === action.payload.questionId);
      const answers = exists
        ? state.answers.map((a) =>
            a.questionId === action.payload.questionId ? action.payload : a,
          )
        : [...state.answers, action.payload];
      return { ...state, answers };
    }

    case 'SET_CONNECTORS': {
      // Prune overrides for connectors that are no longer selected
      const selectedIds = new Set(action.payload.map((c) => c.connectorId));
      const pruned = Object.fromEntries(
        Object.entries(state.connectorActionOverrides).filter(([id]) => selectedIds.has(id)),
      );
      return { ...state, selectedConnectors: action.payload, connectorActionOverrides: pruned };
    }

    case 'SET_CONNECTOR_ACTION_OVERRIDES':
      return {
        ...state,
        connectorActionOverrides: {
          ...state.connectorActionOverrides,
          [action.payload.connectorId]: action.payload.overrides,
        },
      };

    case 'SET_CUSTOM_CONNECTOR_PATTERNS':
      return { ...state, customConnectorPatterns: action.payload };

    case 'SET_JUSTIFICATION':
      return { ...state, justification: action.payload };

    case 'SET_DOCUMENT':
      return { ...state, supportingDocument: action.payload };

    case 'SET_PARTICIPANTS':
      return { ...state, participants: action.payload };

    case 'CACHE_ENVIRONMENTS':
      return { ...state, cachedEnvironments: action.payload };

    case 'CACHE_VALIDATED_ENVS':
      return {
        ...state,
        validatedEnvironmentIds: [
          ...new Set([...state.validatedEnvironmentIds, ...action.payload]),
        ],
      };

    case 'ADVANCE_STEP':
      return {
        ...state,
        highestCompletedStep: Math.max(state.highestCompletedStep, action.payload) as WizardState['highestCompletedStep'],
      };

    case 'LOAD_DRAFT':
      return { ...action.payload };

    case 'MERGE_CLONE_DATA':
      return {
        ...state,
        selectedEnvironments: action.payload.selectedEnvironments,
        selectedConnectors: action.payload.selectedConnectors,
        connectorActionOverrides: action.payload.connectorActionOverrides,
        customConnectorPatterns: action.payload.customConnectorPatterns,
        cloneWarningDismissed: true,
      };

    case 'DISMISS_CLONE_WARNING':
      return { ...state, cloneWarningDismissed: true };

    case 'RESET':
      return { ...WIZARD_INITIAL_STATE };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

interface WizardContextValue {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function WizardContextProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(wizardReducer, WIZARD_INITIAL_STATE);
  return (
    <WizardContext.Provider value={{ state, dispatch }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (ctx === null) {
    throw new Error('useWizard must be used within WizardContextProvider');
  }
  return ctx;
}
