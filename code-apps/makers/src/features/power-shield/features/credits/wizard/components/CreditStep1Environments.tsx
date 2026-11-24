import { useCallback, useMemo } from 'react';
import {
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  Button,
  Link,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useCreditWizard } from '../contexts/CreditWizardContext';
import type { EligibleEnvironmentsState } from '../../../wizard/hooks/useEligibleEnvironments';
import { EnvironmentPickerTable } from '../../../../shared/components/EnvironmentPickerTable';
import type { PpEnvironment } from '../../../../models/environment';
import type { CreditWizardEnvironment } from '../../../../models/creditRequest';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  validation: {
    color: tokens.colorPaletteRedForeground1,
  },
});

const key = (id: string) => id.toLowerCase();

/**
 * Step 1 — Environments (spec 028).
 *
 * The maker ticks the environments they want Copilot Credits for, straight from
 * the list of environments they can access. Each environment becomes its own
 * request at submit. The eligible list is fetched once by the shell and shared
 * with later steps. Environment IDs only ever come from that list, never typed.
 */
export function CreditStep1Environments({ eligible }: { eligible: EligibleEnvironmentsState }) {
  const styles = useStyles();
  const { state, dispatch } = useCreditWizard();
  const { environments, isLoading, error, refetch } = eligible;

  const selectedIds = useMemo(
    () => new Set(state.selectedEnvironments.map((e) => e.environmentId)),
    [state.selectedEnvironments],
  );

  const handleSelectionChange = useCallback(
    (next: Set<string>) => {
      const byId = new Map<string, CreditWizardEnvironment>(
        state.selectedEnvironments.map((e) => [e.environmentId, e]),
      );
      for (const env of environments) {
        byId.set(env.name, { environmentId: env.name, displayName: env.displayName });
      }
      const picked = [...next]
        .map((id) => byId.get(id))
        .filter((e): e is CreditWizardEnvironment => e !== undefined);
      dispatch({ type: 'SET_ENVIRONMENTS', payload: picked });
    },
    [dispatch, environments, state.selectedEnvironments],
  );

  // Environments the conflict check found already active, keyed by GUID.
  const conflictById = useMemo(
    () => new Map(state.step1Conflicts.map((c) => [key(c.environmentGuid), c.conflictWithRequestId])),
    [state.step1Conflicts],
  );
  const allConflict =
    state.step1Conflicts.length > 0 &&
    state.selectedEnvironments.every((e) => conflictById.has(key(e.environmentId)));

  const rowWarning = useCallback(
    (env: PpEnvironment) => {
      if (!conflictById.has(key(env.name))) return undefined;
      const requestId = conflictById.get(key(env.name));
      return (
        <>
          Already has an active credit request.
          {requestId && (
            <>
              {' '}
              <Link
                href={`#/power-shield/credit-requests/${requestId}`}
                aria-label={`Open the existing request for ${env.displayName}`}
              >
                Open the existing request
              </Link>
            </>
          )}
        </>
      );
    },
    [conflictById],
  );

  const showRequired =
    state.attemptedNextSteps.includes(1) && state.selectedEnvironments.length === 0;
  const removed = state.envDiff?.removed ?? [];

  return (
    <div className={styles.root}>
      {state.draftRevalidation === 'invalidAccess' && (
        <MessageBar intent="error">
          <MessageBarBody>
            You no longer have access to any of the environments saved in this draft. Select the
            environments you can access to continue, or discard this draft.
          </MessageBarBody>
        </MessageBar>
      )}

      {removed.length > 0 && state.envConfirmation === 'diffPending' && (
        <MessageBar intent="warning">
          <MessageBarBody>
            You no longer have access to some environments saved in this draft:{' '}
            {removed.map((e) => e.displayName).join(', ')}. They were removed from this request.
          </MessageBarBody>
          <MessageBarActions>
            <Button
              appearance="primary"
              size="small"
              onClick={() => dispatch({ type: 'ACKNOWLEDGE_ENV_DIFF' })}
            >
              Accept changes and continue
            </Button>
          </MessageBarActions>
        </MessageBar>
      )}

      {allConflict && (
        <MessageBar intent="error">
          <MessageBarBody>
            Every environment you selected already has an active credit request, so there is
            nothing new to submit. Open an existing request, or select different environments.
          </MessageBarBody>
        </MessageBar>
      )}

      <EnvironmentPickerTable
        items={environments}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        rowWarning={rowWarning}
        isLoading={isLoading}
        error={error ?? undefined}
        onRetry={refetch}
        emptyMessage="You don't have access to any environments you can request Copilot Credits for."
        ariaLabel="Environments for this credit request"
      />

      {showRequired && (
        <Text role="alert" className={styles.validation}>
          Select at least one environment.
        </Text>
      )}
    </div>
  );
}
