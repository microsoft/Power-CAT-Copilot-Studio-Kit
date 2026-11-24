/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { CreditWizardEnvironment } from '../../../../models/creditRequest';
import {
  CREDIT_WIZARD_INITIAL_STATE,
  mergeSubmitOutcomes,
  type CreditWizardAction,
  type CreditWizardState,
  type CreditEnvConfirmation,
} from './creditWizardTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Credit wizard reducer (spec 016, T017). Separate context + reducer from the
// connector wizard (FR-008). See creditWizardTypes.ts for the design rationale.
// ─────────────────────────────────────────────────────────────────────────────

/** Confirmation state implied by a freshly resumed draft's revalidation result. */
function confirmationForRevalidation(
  revalidation: CreditWizardState['draftRevalidation'],
): CreditEnvConfirmation {
  switch (revalidation) {
    case 'unchanged':
      return 'confirmed';
    case 'changed':
      return 'diffPending';
    default:
      return 'unconfirmed';
  }
}

/** Keep only the entries whose environment is still selected (amounts and ticks). */
function pruneByEnvironment<T>(
  values: Record<string, T>,
  environments: CreditWizardEnvironment[],
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const env of environments) {
    if (values[env.environmentId] !== undefined) out[env.environmentId] = values[env.environmentId];
  }
  return out;
}

export function creditWizardReducer(
  state: CreditWizardState,
  action: CreditWizardAction,
): CreditWizardState {
  switch (action.type) {
    case 'SET_ENVIRONMENTS':
      return {
        ...state,
        selectedEnvironments: action.payload,
        requestedAmounts: pruneByEnvironment(state.requestedAmounts, action.payload),
        requestTenantDraw: pruneByEnvironment(state.requestTenantDraw, action.payload),
        envConfirmation: 'unconfirmed',
        // A fresh pick replaces any resumed-draft scope, so earlier resume warnings no longer apply.
        envDiff: null,
        draftRevalidation: state.draftRevalidation === 'notApplicable' ? 'notApplicable' : 'unchanged',
        highestCompletedStep: 0,
        step1Conflicts: [],
      };

    case 'CONFIRM_ENVIRONMENTS':
      // Only a first-run selection is confirmed here; a pending diff must be
      // acknowledged via ACKNOWLEDGE_ENV_DIFF, not silently confirmed.
      if (state.selectedEnvironments.length === 0) return state;
      if (state.envConfirmation === 'diffPending') return state;
      return { ...state, envConfirmation: 'confirmed' };

    case 'SET_ENV_DIFF':
      return {
        ...state,
        envDiff: action.payload.diff,
        draftRevalidation: action.payload.revalidation,
        envConfirmation: confirmationForRevalidation(action.payload.revalidation),
      };

    case 'ACKNOWLEDGE_ENV_DIFF': {
      if (state.envDiff === null) return state;
      const removedIds = new Set(state.envDiff.removed.map((e) => e.environmentId));
      const kept = state.selectedEnvironments.filter((e) => !removedIds.has(e.environmentId));
      // Keep envDiff so Step 3 can still show exactly what changed (duck #8).
      // Clear step1Conflicts: the environment set just changed, so any prior
      // probe result no longer describes it (re-probed on the next Next).
      return {
        ...state,
        selectedEnvironments: kept,
        requestedAmounts: pruneByEnvironment(state.requestedAmounts, kept),
        requestTenantDraw: pruneByEnvironment(state.requestTenantDraw, kept),
        envConfirmation: 'diffAcknowledged',
        step1Conflicts: [],
      };
    }

    case 'SET_REQUESTED_AMOUNT':
      return {
        ...state,
        requestedAmounts: {
          ...state.requestedAmounts,
          [action.payload.environmentId]: action.payload.raw,
        },
      };

    case 'SET_TENANT_DRAW': {
      // Store ticks only, so an untick leaves no `false` behind to save (the app only turns the setting on).
      const next = { ...state.requestTenantDraw };
      if (action.payload.value) next[action.payload.environmentId] = true;
      else delete next[action.payload.environmentId];
      return { ...state, requestTenantDraw: next };
    }

    case 'SET_JUSTIFICATION':
      return { ...state, justification: action.payload };

    case 'SET_DOCUMENT':
      // A new local file replaces any resumed-draft document reference.
      return {
        ...state,
        supportingDocument: action.payload,
        existingSupportingDocumentName: undefined,
      };

    case 'ADVANCE_STEP':
      return {
        ...state,
        highestCompletedStep: Math.max(
          state.highestCompletedStep,
          action.payload,
        ) as CreditWizardState['highestCompletedStep'],
      };

    case 'MARK_NEXT_ATTEMPTED':
      if (state.attemptedNextSteps.includes(action.payload)) return state;
      return { ...state, attemptedNextSteps: [...state.attemptedNextSteps, action.payload] };

    case 'SET_STEP1_CONFLICTS':
      return { ...state, step1Conflicts: action.payload };

    case 'LOAD_DRAFT': {
      // Reinitialise, then hydrate durable fields only. A File is never restored
      // from a draft; a previously attached doc is shown by name (duck #7).
      const revalidation = action.payload.draftRevalidation;
      return {
        ...CREDIT_WIZARD_INITIAL_STATE,
        draftRequestId: action.payload.draftRequestId,
        selectedEnvironments: action.payload.selectedEnvironments,
        requestedAmounts: pruneByEnvironment(
          action.payload.requestedAmounts ?? {},
          action.payload.selectedEnvironments,
        ),
        requestTenantDraw: pruneByEnvironment(
          action.payload.requestTenantDraw ?? {},
          action.payload.selectedEnvironments,
        ),
        justification: action.payload.justification,
        existingSupportingDocumentName: action.payload.existingSupportingDocumentName,
        envDiff: action.payload.envDiff,
        draftRevalidation: revalidation,
        envConfirmation: confirmationForRevalidation(revalidation),
        highestCompletedStep: revalidation === 'unchanged' ? 1 : 0,
      };
    }

    case 'SET_DRAFT_ID':
      return { ...state, draftRequestId: action.payload };

    case 'SUBMIT_START':
      return { ...state, submitPhase: 'submitting', submitOutcomes: [] };

    case 'SUBMIT_COMPLETE':
      return { ...state, submitPhase: 'completed', submitOutcomes: action.payload };

    case 'RETRY_START':
      return { ...state, submitPhase: 'submitting' };

    case 'RETRY_COMPLETE':
      return {
        ...state,
        submitPhase: 'completed',
        submitOutcomes: mergeSubmitOutcomes(state.submitOutcomes, action.payload),
      };

    case 'RESET':
      return { ...CREDIT_WIZARD_INITIAL_STATE };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

interface CreditWizardContextValue {
  state: CreditWizardState;
  dispatch: React.Dispatch<CreditWizardAction>;
}

const CreditWizardContext = createContext<CreditWizardContextValue | null>(null);

export function CreditWizardContextProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(creditWizardReducer, CREDIT_WIZARD_INITIAL_STATE);
  return (
    <CreditWizardContext.Provider value={{ state, dispatch }}>
      {children}
    </CreditWizardContext.Provider>
  );
}

export function useCreditWizard(): CreditWizardContextValue {
  const ctx = useContext(CreditWizardContext);
  if (ctx === null) {
    throw new Error('useCreditWizard must be used within CreditWizardContextProvider');
  }
  return ctx;
}
