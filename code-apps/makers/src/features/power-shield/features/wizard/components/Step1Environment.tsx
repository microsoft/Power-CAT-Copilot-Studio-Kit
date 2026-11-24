import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogTrigger,
} from '@fluentui/react-components';
import { ArrowRight20Regular, Dismiss20Regular } from '@fluentui/react-icons';
import { useWizard } from './WizardShell';
import { CancelWizardDialog } from './CancelWizardDialog';
import { SaveDraftButton } from './SaveDraftButton';
import { useEligibleEnvironments } from '../hooks/useEligibleEnvironments';
import { useConflictCheck } from '../hooks/useConflictCheck';
import { useApprovedRequests } from '../hooks/useApprovedRequests';
import { useServiceTrees } from '../hooks/useServiceTrees';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { useContainersByServiceTree } from '../hooks/useContainersByServiceTree';
import {
  EnvironmentGroupSelector,
  type EnvironmentGroupSnapshot,
} from '../../../shared/components/EnvironmentGroupSelector';
import { DlpCloneWarningDialog } from './DlpCloneWarningDialog';
import { loadCloneDataIntoWizard } from '../../../shared/services/dataverse/wizardDraftService';
import type { AdminCheckProgress } from '../../../shared/services/dataverse/environmentService';
import { useNotify } from '../../../shared/hooks/useNotify';
import type { PpEnvironment } from '../../../models/environment';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  navRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
  },
  navRowGroup: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
});

/**
 * Connector wizard Step 1 (rebuilt for spec 018). The Service Tree + Environment
 * Group selection UI now lives in the shared {@link EnvironmentGroupSelector}; this
 * wrapper keeps every connector-specific behavior: wizard-state reads/dispatches,
 * environment caching, auto-select of the first tree + group on a fresh request
 * (never overwriting a resumed draft), the Next-time side effects (admin probe —
 * currently disabled, DLP clone warning, clone-from-approved), the conflict check,
 * and footer navigation. Behavior is unchanged from the pre-extraction version.
 */
export function Step1Environment() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { state, dispatch } = useWizard();
  const auth = useAuth();
  const { environments, isLoading: envsLoading, error: envsError } = useEligibleEnvironments(
    state.cachedEnvironments ?? undefined,
  );
  const { serviceTrees, isLoading: treesLoading, refresh: refreshTrees } = useServiceTrees(
    auth.dvUserId,
  );
  const { containers, isLoading: containersLoading, loadedForTreeId, refresh: refreshContainers } =
    useContainersByServiceTree(state.serviceTreeId);
  const { notifyError, notifySuccess } = useNotify();

  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Admin validation — the probe is currently disabled (see handleNext); the state
  // and dialog are retained so the disabled flow's behavior is byte-for-byte.
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [isValidatingAdmin] = useState(false);
  const [adminCheckError, setAdminCheckError] = useState<string | null>(null);
  const [invalidEnvs] = useState<PpEnvironment[]>([]);
  const [validEnvs] = useState<PpEnvironment[]>([]);
  const [validationProgress] = useState<AdminCheckProgress | null>(null);

  const { conflict, isChecking } = useConflictCheck(state.serviceTreeId, state.draftRequestId);

  // DLP clone warning dialog
  const { approvedRequests, isLoading: isLoadingApproved, fetch: fetchApproved } =
    useApprovedRequests();
  const [showCloneWarning, setShowCloneWarning] = useState(false);
  const [isCloning, setIsCloning] = useState(false);

  const isFirstTimeUser = !treesLoading && serviceTrees.length === 0;
  // Guards the first-container auto-select so it fires at most once per tree load.
  const autoSelectedForTree = useRef<string | undefined>(undefined);

  // Cache environments in wizard state on first successful fetch.
  useEffect(() => {
    if (!state.cachedEnvironments && environments.length > 0) {
      dispatch({ type: 'CACHE_ENVIRONMENTS', payload: environments });
    }
  }, [environments, state.cachedEnvironments, dispatch]);

  // Auto-select the first (most recent) service tree when none is selected — new
  // requests only (never a draft/template resume).
  useEffect(() => {
    if (!treesLoading && serviceTrees.length > 0 && !state.serviceTreeId && !state.draftRequestId) {
      const first = serviceTrees[0];
      dispatch({ type: 'SET_SERVICE_TREE', payload: { id: first.id, name: first.name } });
    }
  }, [treesLoading, serviceTrees, state.serviceTreeId, state.draftRequestId, dispatch]);

  const handleServiceTreeChange = useCallback(
    (tree: { id: string; name: string } | null) => {
      if (!tree) {
        dispatch({ type: 'CLEAR_SERVICE_TREE' });
        dispatch({ type: 'SET_ENVIRONMENT_GROUP', payload: undefined });
        dispatch({ type: 'SET_ENVIRONMENTS', payload: [] });
        return;
      }
      if (state.serviceTreeId === tree.id) return;
      dispatch({ type: 'SET_SERVICE_TREE', payload: { id: tree.id, name: tree.name } });
      // The connector reducer does not clear downstream scope on a tree change, so
      // clear the group + environments here (parity with the old behavior).
      dispatch({ type: 'SET_ENVIRONMENT_GROUP', payload: undefined });
      dispatch({ type: 'SET_ENVIRONMENTS', payload: [] });
    },
    [state.serviceTreeId, dispatch],
  );

  const handleGroupSelectionStarted = useCallback(
    (group: { id: string; name: string }) => {
      // Clear the previous environment snapshot the moment a new group is chosen so
      // it can never be reviewed or submitted while the new members load (FR-009).
      dispatch({ type: 'SET_ENVIRONMENT_GROUP', payload: { id: group.id, name: group.name } });
      dispatch({ type: 'SET_ENVIRONMENTS', payload: [] });
      setAdminCheckError(null);
    },
    [dispatch],
  );

  const handleGroupSnapshot = useCallback(
    (snapshot: EnvironmentGroupSnapshot) => {
      dispatch({
        type: 'SET_ENVIRONMENTS',
        payload: snapshot.environments.map((e) => ({
          environmentId: e.environmentId,
          displayName: e.displayName,
        })),
      });
    },
    [dispatch],
  );

  // Auto-select the first (most recent) group when none is selected — new requests
  // only, and only once the containers + eligible environments for the current tree
  // have loaded (FR-015).
  useEffect(() => {
    if (
      !containersLoading &&
      containers.length > 0 &&
      environments.length > 0 &&
      loadedForTreeId === state.serviceTreeId &&
      !state.selectedEnvironmentGroupId &&
      state.serviceTreeId &&
      !state.draftRequestId &&
      autoSelectedForTree.current !== state.serviceTreeId
    ) {
      autoSelectedForTree.current = state.serviceTreeId;
      const first = containers[0];
      handleGroupSelectionStarted({ id: first.id, name: first.name });
    }
  }, [
    containersLoading,
    containers,
    environments,
    loadedForTreeId,
    state.serviceTreeId,
    state.selectedEnvironmentGroupId,
    state.draftRequestId,
    handleGroupSelectionStarted,
  ]);

  const selectedEnvironmentIds = useMemo(
    () => state.selectedEnvironments.map((e) => e.environmentId),
    [state.selectedEnvironments],
  );

  // A resumed draft already carries its group snapshot — suppress the selector's
  // automatic member reload so the cached selection is preserved.
  const groupSnapshotLoaded =
    !!state.selectedEnvironmentGroupId &&
    (state.selectedEnvironments.length > 0 || !!state.draftRequestId);

  const canProceed =
    !!state.serviceTreeId &&
    !!state.selectedEnvironmentGroupId &&
    !conflict &&
    !isChecking &&
    !isValidatingAdmin &&
    !isLoadingMembers &&
    state.selectedEnvironments.length > 0;

  // Detect when a pre-selected service tree (from a draft) is no longer accessible.
  const serviceTreeNotFound =
    !!state.serviceTreeId &&
    !treesLoading &&
    serviceTrees.length > 0 &&
    !serviceTrees.some((t) => t.id === state.serviceTreeId);

  function proceedToNext() {
    dispatch({ type: 'ADVANCE_STEP', payload: 1 });
    if (state.hasQuestionnaire === false) {
      dispatch({ type: 'ADVANCE_STEP', payload: 2 });
      navigate('/new-request/connectors');
    } else {
      navigate('/new-request/questionnaire');
    }
  }

  async function handleNext() {
    if (!canProceed) return;
    setAdminCheckError(null);

    const allEnvIds = state.selectedEnvironments.map((e) => e.environmentId);
    if (allEnvIds.length === 0) {
      proceedToNext();
      return;
    }

    // System Administrator validation is off. The app has no connection
    // reference for the `powerplatformforadmins` connector. The original check
    // called GetSingleEnvironment per environment to confirm admin access.

    // Check for approved requests under this Service Tree — show clone warning if any exist.
    if (state.serviceTreeId && !state.cloneWarningDismissed) {
      const approved = await fetchApproved(state.serviceTreeId);
      if (approved.length > 0) {
        setShowCloneWarning(true);
        return;
      }
    }

    proceedToNext();
  }

  async function handleClone(requestId: string) {
    setIsCloning(true);
    try {
      const cloneData = await loadCloneDataIntoWizard(requestId);
      dispatch({ type: 'MERGE_CLONE_DATA', payload: cloneData });
      setShowCloneWarning(false);
      proceedToNext();
      // Delay toast so it renders after the step transition completes.
      setTimeout(() => {
        notifySuccess('Connectors and environments copied from the selected request.');
      }, 300);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to clone request data.');
    } finally {
      setIsCloning(false);
    }
  }

  function handleSkipClone() {
    dispatch({ type: 'DISMISS_CLONE_WARNING' });
    setShowCloneWarning(false);
    proceedToNext();
  }

  if (envsLoading || treesLoading) return <Spinner label="Loading..." />;
  if (envsError) return <Text>Error loading environments: {envsError}</Text>;

  return (
    <div className={styles.root}>
      {conflict && (
        <MessageBar intent="warning">
          <MessageBarBody>
            <Text block>
              A request for this Service Tree is already in progress ({conflict.requestNumber}). Only
              one active request is allowed per Service Tree at a time.
            </Text>
            <Text block size={200} style={{ marginTop: tokens.spacingVerticalXS }}>
              You may not have access to view this request if it was created by another team member.
              Please coordinate with your team to have it completed or withdrawn before submitting a
              new one.
            </Text>
          </MessageBarBody>
        </MessageBar>
      )}

      {!state.serviceTreeId && (
        <MessageBar intent="info">
          <MessageBarBody>
            {isFirstTimeUser
              ? 'Welcome! To submit a connector request, start by creating a Service Tree for your team, then set up an Environment Group with the environments you need access to.'
              : "Select your team's Service Tree, then choose an Environment Group to continue."}
          </MessageBarBody>
        </MessageBar>
      )}

      {serviceTreeNotFound && (
        <MessageBar intent="warning">
          <MessageBarBody>
            The Service Tree &quot;{state.serviceTreeName}&quot; from your saved draft is no longer
            available. Please select a different Service Tree to continue.
          </MessageBarBody>
        </MessageBar>
      )}

      <EnvironmentGroupSelector
        serviceTreeId={state.serviceTreeId}
        serviceTreeName={state.serviceTreeName}
        environmentGroupId={state.selectedEnvironmentGroupId}
        environmentGroupName={state.selectedEnvironmentGroupName}
        selectedEnvironmentIds={selectedEnvironmentIds}
        groupSnapshotLoaded={groupSnapshotLoaded}
        serviceTrees={serviceTrees}
        serviceTreesLoading={treesLoading}
        onRefreshServiceTrees={refreshTrees}
        containers={containers}
        containersLoading={containersLoading}
        loadedForTreeId={loadedForTreeId}
        onRefreshContainers={refreshContainers}
        environments={environments}
        environmentsLoading={envsLoading}
        environmentsError={envsError ?? undefined}
        onServiceTreeChange={handleServiceTreeChange}
        onEnvironmentGroupSelectionStarted={handleGroupSelectionStarted}
        onEnvironmentGroupSnapshot={handleGroupSnapshot}
        onMembersError={(m) => notifyError(m)}
        onLoadingMembersChange={setIsLoadingMembers}
      />

      {adminCheckError && (
        <MessageBar intent="error">
          <MessageBarBody>Failed to verify administrator access: {adminCheckError}</MessageBarBody>
        </MessageBar>
      )}

      {isValidatingAdmin && (
        <MessageBar intent="info">
          <MessageBarBody>
            <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
              <Spinner size="tiny" />
              <Text>
                {validationProgress
                  ? `Verifying administrator access… (${validationProgress.completed} of ${validationProgress.total} environments checked)`
                  : `Verifying your System Administrator access across ${state.selectedEnvironments.length} environment${state.selectedEnvironments.length === 1 ? '' : 's'}…`}
              </Text>
            </div>
          </MessageBarBody>
        </MessageBar>
      )}

      <Text
        size={200}
        style={{
          color: canProceed ? tokens.colorBrandForeground1 : tokens.colorNeutralForeground3,
        }}
      >
        {canProceed
          ? 'All set - proceed to the next step.'
          : isFirstTimeUser
            ? 'Create a Service Tree for your team to get started.'
            : !state.serviceTreeId
              ? 'Select a Service Tree to continue.'
              : containers.length === 0 && !containersLoading
                ? 'Create an Environment Group to bundle the environments for your request.'
                : !state.selectedEnvironmentGroupId
                  ? 'Choose an Environment Group to continue.'
                  : state.selectedEnvironments.length === 0 && !isLoadingMembers
                    ? 'Select environments to continue.'
                    : 'Choose an Environment Group to continue.'}
      </Text>

      <div className={styles.navRow}>
        <CancelWizardDialog />
        <div className={styles.navRowGroup}>
          <SaveDraftButton disabled={!canProceed} />
          <Button
            appearance="primary"
            onClick={() => {
              void handleNext();
            }}
            disabled={!canProceed || isLoadingApproved}
            icon={isLoadingApproved ? <Spinner size="tiny" /> : <ArrowRight20Regular />}
            iconPosition="after"
          >
            {isLoadingApproved ? 'Checking…' : 'Next'}
          </Button>
        </div>
      </div>

      {/* Admin validation dialog (retained; shown only if the disabled probe is re-enabled). */}
      <Dialog open={showAdminDialog} onOpenChange={(_, data) => setShowAdminDialog(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle
              action={
                <DialogTrigger disableButtonEnhancement>
                  <Button appearance="subtle" aria-label="Close" icon={<Dismiss20Regular />} />
                </DialogTrigger>
              }
            >
              System Administrator Role Required
            </DialogTitle>
            <DialogContent>
              <Text block style={{ marginBottom: tokens.spacingVerticalM }}>
                You must have the <strong>System Administrator</strong> security role in each
                environment in the selected Environment Group. Please choose a different group.
              </Text>
              <Text weight="semibold" block>
                Not authorized ({invalidEnvs.length}):
              </Text>
              <ul
                style={{
                  margin: `${tokens.spacingVerticalXS} 0 0 0`,
                  paddingLeft: tokens.spacingHorizontalXL,
                }}
              >
                {invalidEnvs.map((e) => (
                  <li key={e.name}>
                    <Text>{e.displayName}</Text>
                  </li>
                ))}
              </ul>
              {validEnvs.length > 0 && (
                <>
                  <Text weight="semibold" block style={{ marginTop: tokens.spacingVerticalM }}>
                    Authorized ({validEnvs.length}):
                  </Text>
                  <ul
                    style={{
                      margin: `${tokens.spacingVerticalXS} 0 0 0`,
                      paddingLeft: tokens.spacingHorizontalXL,
                    }}
                  >
                    {validEnvs.map((e) => (
                      <li key={e.name}>
                        <Text>{e.displayName}</Text>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="subtle" onClick={() => setShowAdminDialog(false)}>
                Cancel
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* DLP clone warning dialog */}
      <DlpCloneWarningDialog
        open={showCloneWarning}
        approvedRequests={approvedRequests}
        isLoading={isLoadingApproved}
        isCloning={isCloning}
        onClone={(requestId) => {
          void handleClone(requestId);
        }}
        onSkip={handleSkipClone}
        onCancel={() => setShowCloneWarning(false)}
      />
    </div>
  );
}
