/**
 * useFRE Hook — First Run Experience
 *
 * Manages the welcome tour state with:
 * - localStorage as the fast-path primary cache (key: 'copilot_agent_optimizer_fre')
 * - Dataverse cat_agentreviewfre as durable cross-browser storage
 *
 * Read strategy: localStorage first → if miss, query Dataverse by createdby (user GUID)
 * Write strategy: localStorage FIRST (sync, guaranteed) → Dataverse async (best-effort)
 *
 * User identity: getContext() from Power Apps SDK → email → systemusers GUID lookup
 */

import { useState, useEffect, useCallback } from 'react';
import { getContext } from '@microsoft/power-apps/app';
import { Cat_agentreviewfresService } from '../../../generated/services/Cat_agentreviewfresService';
import { MicrosoftDataverseService } from '../../../generated';

const STORAGE_KEY = 'copilot_agent_optimizer_fre';
const TOUR_START_DELAY_MS = 500;

interface FRELocalState {
  tourCompleted: boolean;
}

function readLocalStorage(): FRELocalState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as FRELocalState) : { tourCompleted: false };
  } catch {
    return { tourCompleted: false };
  }
}

function writeLocalStorage(state: FRELocalState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Silently fail if localStorage unavailable
  }
}

/**
 * Get the current user's Dataverse systemuserid GUID.
 * Uses getContext() from Power Apps SDK to get email, then queries systemusers.
 */
async function getCurrentUserGuid(): Promise<string | null> {
  try {
    const ctx = await getContext();
    const email = ctx.user.userPrincipalName;
    if (!email) return null;

    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      'current',
      'systemusers',
      undefined, undefined, undefined, undefined,
      'systemuserid',
      `internalemailaddress eq '${email}'`,
      undefined, undefined, undefined,
      1,
    );

    const users = (result.data as { value?: { systemuserid?: string }[] } | undefined)?.value ?? [];
    const userId = users[0]?.systemuserid;
    return userId ? userId.replace(/[{}]/g, '').toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Check Dataverse for FRE completion by createdby field */
async function checkDataverseFRE(userId: string): Promise<boolean> {
  try {
    const result = await Cat_agentreviewfresService.getAll({
      filter: `createdby eq '${userId}' and cat_completed eq true`,
      top: 1,
      select: ['cat_completed'],
    });
    return !!(result.success && result.data && result.data.length > 0);
  } catch {
    return false;
  }
}

/** Upsert FRE completion record in Dataverse */
async function saveDataverseFRE(userId: string): Promise<void> {
  try {
    // Check if record exists by cat_user lookup
    const existing = await Cat_agentreviewfresService.getAll({
      filter: `_cat_user_value eq '${userId}'`,
      top: 1,
      select: ['cat_agentreviewfreid'],
    });

    const now = new Date().toISOString();

    if (existing.success && existing.data && existing.data.length > 0) {
      const recordId = existing.data[0].cat_agentreviewfreid;
      if (recordId) {
        await Cat_agentreviewfresService.update(recordId, {
          cat_completed: 1,
          cat_completeddate: now,
        });
      }
    } else {
      await Cat_agentreviewfresService.create({
        'cat_User@odata.bind': `/systemusers(${userId})`,
        cat_completed: 1,
        cat_completeddate: now,
        cat_name: 'Tour Status',
        ownerid: userId,
        owneridtype: 'systemusers',
        statecode: 0,
      });
    }
  } catch (error) {
    // Best-effort — localStorage already saved, don't throw
    console.error('[FRE] Failed to sync to Dataverse:', error);
  }
}

export interface FREState {
  shouldShowTour: boolean;
  currentStep: number;
  isLoading: boolean;
  nextStep: () => void;
  previousStep: () => void;
  completeTour: () => void;
}

/**
 * useFRE Hook
 *
 * Manages first-run experience tour state.
 * localStorage is the source of truth for the current session.
 * Dataverse provides durable cross-browser/cross-device persistence.
 */
export function useFRE(): FREState {
  const [isLoading, setIsLoading] = useState(true);
  const [tourCompleted, setTourCompleted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  // Load FRE status on mount
  useEffect(() => {
    const load = async () => {
      // Fast path: localStorage
      const localState = readLocalStorage();
      if (localState.tourCompleted) {
        setTourCompleted(true);
        setIsLoading(false);
        return;
      }

      // Slow path: get userId then check Dataverse
      try {
        const guid = await getCurrentUserGuid();
        if (guid) {
          setUserId(guid);
          const completed = await checkDataverseFRE(guid);
          if (completed) {
            writeLocalStorage({ tourCompleted: true });
            setTourCompleted(true);
            setIsLoading(false);
            return;
          }
        }
      } catch (error) {
        console.error('[FRE] Error checking Dataverse, using localStorage only:', error);
      }

      setTourCompleted(false);
      setIsLoading(false);
    };

    load().catch(() => setIsLoading(false));
  }, []);

  // Auto-start tour after delay once loading completes
  useEffect(() => {
    if (!isLoading && !tourCompleted) {
      const timer = setTimeout(() => setCurrentStep(1), TOUR_START_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [isLoading, tourCompleted]);

  const nextStep = useCallback(() => setCurrentStep((s) => s + 1), []);
  const previousStep = useCallback(() => setCurrentStep((s) => Math.max(1, s - 1)), []);

  const completeTour = useCallback(() => {
    // Immediately hide tour
    setTourCompleted(true);
    setCurrentStep(0);

    // localStorage FIRST — guaranteed
    writeLocalStorage({ tourCompleted: true });

    // Dataverse async — best-effort, non-blocking
    if (userId) {
      saveDataverseFRE(userId).catch((err) =>
        console.error('[FRE] Background Dataverse save failed:', err)
      );
    } else {
      // Try to get userId and save in background
      getCurrentUserGuid()
        .then((guid) => { if (guid) return saveDataverseFRE(guid); })
        .catch((err) => console.error('[FRE] Background Dataverse save failed:', err));
    }
  }, [userId]);

  return {
    shouldShowTour: !isLoading && !tourCompleted && currentStep > 0,
    currentStep,
    isLoading,
    nextStep,
    previousStep,
    completeTour,
  };
}
