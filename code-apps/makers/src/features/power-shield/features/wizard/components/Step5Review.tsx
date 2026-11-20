import { useCallback, useState } from 'react';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { ArrowLeft20Regular, Checkmark20Regular, Info16Regular } from '@fluentui/react-icons';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  TabList,
  Tab,
} from '@fluentui/react-components';
import { useWizard } from './WizardShell';
import { CancelWizardDialog } from './CancelWizardDialog';
import { SaveDraftButton } from './SaveDraftButton';
import { useAuth } from '../../../shared/hooks/useAuth';
import { submitWizard, WizardSubmitError } from '../../../shared/services/dataverse/wizardSubmitService';
import { useNotify } from '../../../shared/hooks/useNotify';
import { getServiceTreeDetail } from '../../../shared/services/dataverse/serviceTreeService';
import { getEnvironmentGroupDetail } from '../../../shared/services/dataverse/environmentGroupService';
import type { ServiceTree } from '../../../models/serviceTree';
import type { EnvironmentGroupMember } from '../../../models/environmentGroup';
import { ReviewScopeTab } from './ReviewScopeTab';
import { ReviewDetailsTab } from './ReviewDetailsTab';
import { ReviewCollaborationTab } from './ReviewCollaborationTab';

// ─────────────────────────────────────────────────────────────────────────────
// Submit result state
// ─────────────────────────────────────────────────────────────────────────────

type SubmitResult =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'success'; requestId: string; requestNumber: string }
  | { phase: 'partial-failure'; requestId: string; message: string }
  | { phase: 'total-failure'; message: string };

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EnvGroupDetail {
  id: string;
  name: string;
  description?: string;
  ownerUpn?: string;
  members: EnvironmentGroupMember[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  capsuleRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    paddingBottom: tokens.spacingVerticalS,
  },
  capsule: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    paddingTop: '5px',
    paddingBottom: '5px',
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusCircular,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorBrandStroke1,
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    borderRightColor: tokens.colorBrandStroke1,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorBrandStroke1,
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorBrandStroke1,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    fontFamily: 'inherit',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2Hover,
      boxShadow: tokens.shadow2,
    },
    ':active': {
      backgroundColor: tokens.colorBrandBackground2Pressed,
    },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: '2px',
    },
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    paddingTop: tokens.spacingVerticalM,
  },
  dialogField: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    marginBottom: tokens.spacingVerticalS,
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

export function Step5Review() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { state } = useWizard();
  const { aadObjectId, upn } = useAuth();
  const { notifySuccess, notifyError } = useNotify();
  const [submitResult, setSubmitResult] = useState<SubmitResult>({ phase: 'idle' });

  const [selectedTab, setSelectedTab] = useState<string>('scope');

  // ── Capsule dialog state ────────────────────────────────────────────────
  const [serviceTreeOpen, setServiceTreeOpen] = useState(false);
  const [serviceTreeDetail, setServiceTreeDetail] = useState<ServiceTree | null>(null);
  const [serviceTreeLoading, setServiceTreeLoading] = useState(false);
  const [serviceTreeError, setServiceTreeError] = useState<string | null>(null);

  const [envGroupOpen, setEnvGroupOpen] = useState(false);
  const [envGroupDetail, setEnvGroupDetail] = useState<EnvGroupDetail | null>(null);
  const [envGroupLoading, setEnvGroupLoading] = useState(false);
  const [envGroupError, setEnvGroupError] = useState<string | null>(null);

  const handleServiceTreeClick = useCallback(async () => {
    setServiceTreeOpen(true);
    if (serviceTreeDetail) return;
    setServiceTreeLoading(true);
    setServiceTreeError(null);
    try {
      setServiceTreeDetail(await getServiceTreeDetail(state.serviceTreeId!));
    } catch {
      setServiceTreeError('Failed to load Service Tree details.');
    } finally {
      setServiceTreeLoading(false);
    }
  }, [state.serviceTreeId, serviceTreeDetail]);

  const handleEnvGroupClick = useCallback(async () => {
    if (!state.selectedEnvironmentGroupId) return;
    setEnvGroupOpen(true);
    if (envGroupDetail) return;
    setEnvGroupLoading(true);
    setEnvGroupError(null);
    try {
      setEnvGroupDetail(await getEnvironmentGroupDetail(state.selectedEnvironmentGroupId));
    } catch {
      setEnvGroupError('Failed to load Environment Container details.');
    } finally {
      setEnvGroupLoading(false);
    }
  }, [state.selectedEnvironmentGroupId, envGroupDetail]);

  async function handleSubmit() {
    setSubmitResult({ phase: 'submitting' });
    try {
      const result = await submitWizard({
        serviceTreeId: state.serviceTreeId!,
        createdByAadObjectId: aadObjectId,
        createdByUpn: upn,
        justification: state.justification,
        environments: state.selectedEnvironments,
        connectors: state.selectedConnectors,
        connectorActionOverrides: state.connectorActionOverrides,
        customConnectorPatterns: state.customConnectorPatterns.map((p) => ({
          hostUrlPattern: p.hostUrlPattern,
          dataGroup: p.dataGroup,
          order: p.order,
        })),
        answers: state.answers.map((a) => ({
          questionId: a.questionId,
          answerValue: a.answerValue,
          questionTextSnapshot: a.questionText,
          policyRequestId: '', // filled by service
        })),
        participants: state.participants,
        supportingDocument: state.supportingDocument,
        draftRequestId: state.draftRequestId,
        environmentGroupId: state.selectedEnvironmentGroupId,
      });

      notifySuccess(`Request ${result.requestNumber} submitted successfully.`);
      navigate('/', { replace: true, state: { bypassGuard: true } });
    } catch (err) {
      if (err instanceof WizardSubmitError && err.partialRequestId) {
        setSubmitResult({
          phase: 'partial-failure',
          requestId: err.partialRequestId,
          message: err.message,
        });
        notifyError('Submission partially failed. Check the details below.');
      } else {
        const message = err instanceof Error ? err.message : 'Submission failed.';
        notifyError(message);
        setSubmitResult({ phase: 'total-failure', message });
      }
    }
  }

  const isSubmitting = submitResult.phase === 'submitting';

  return (
    <div className={styles.root}>
      {/* Partial-failure banner — kept inline because it contains the recovery request ID */}
      {submitResult.phase === 'partial-failure' && (
        <MessageBar intent="error">
          <MessageBarBody>
            The request header was created (ID: {submitResult.requestId}) but some child records
            failed to save. Please contact support and quote this ID: {submitResult.requestId}.{' '}
            {submitResult.message}
          </MessageBarBody>
        </MessageBar>
      )}

      {/* ── Capsules — Service Tree & Environment Container ──────────────── */}
      <div className={styles.capsuleRow}>
        <button className={styles.capsule} onClick={() => void handleServiceTreeClick()}
                aria-label="View Service Tree details">
          Service Tree: {state.serviceTreeName ?? state.serviceTreeId}
          <Info16Regular />
        </button>
        {state.selectedEnvironmentGroupId && (
          <button className={styles.capsule} onClick={() => void handleEnvGroupClick()}
                  aria-label="View Environment Container details">
            Env Container: {state.selectedEnvironmentGroupName ?? state.selectedEnvironmentGroupId}
            <Info16Regular />
          </button>
        )}
      </div>

      {/* ── Service Tree detail dialog ────────────────────────────────────── */}
      <Dialog open={serviceTreeOpen} onOpenChange={(_, d) => setServiceTreeOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Service Tree</DialogTitle>
            <DialogContent>
              {serviceTreeLoading && <Spinner size="small" label="Loading..." labelPosition="after" />}
              {serviceTreeError && <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{serviceTreeError}</Text>}
              {serviceTreeDetail && (
                <>
                  <div className={styles.dialogField}>
                    <Text weight="semibold" size={300}>Name</Text>
                    <Text size={300}>{serviceTreeDetail.name || '-'}</Text>
                  </div>
                  <div className={styles.dialogField}>
                    <Text weight="semibold" size={300}>Organization</Text>
                    <Text size={300}>{serviceTreeDetail.organization || '-'}</Text>
                  </div>
                  <div className={styles.dialogField}>
                    <Text weight="semibold" size={300}>Description</Text>
                    <Text size={300}>{serviceTreeDetail.description || '-'}</Text>
                  </div>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setServiceTreeOpen(false)}>Close</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* ── Environment Container detail dialog ──────────────────────────── */}
      <Dialog open={envGroupOpen} onOpenChange={(_, d) => setEnvGroupOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Environment Container</DialogTitle>
            <DialogContent>
              {envGroupLoading && <Spinner size="small" label="Loading..." labelPosition="after" />}
              {envGroupError && <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{envGroupError}</Text>}
              {envGroupDetail && (
                <>
                  <div className={styles.dialogField}>
                    <Text weight="semibold" size={300}>Name</Text>
                    <Text size={300}>{envGroupDetail.name}</Text>
                  </div>
                  {envGroupDetail.description && (
                    <div className={styles.dialogField}>
                      <Text weight="semibold" size={300}>Description</Text>
                      <Text size={300}>{envGroupDetail.description}</Text>
                    </div>
                  )}
                  {envGroupDetail.ownerUpn && (
                    <div className={styles.dialogField}>
                      <Text weight="semibold" size={300}>Owner</Text>
                      <Text size={300}>{envGroupDetail.ownerUpn}</Text>
                    </div>
                  )}
                  <div className={styles.dialogField}>
                    <Text weight="semibold" size={300}>Environments</Text>
                    {envGroupDetail.members.length === 0 ? (
                      <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>No environments in this group.</Text>
                    ) : (
                      <Table size="small" aria-label="Member environments">
                        <TableBody>
                          {envGroupDetail.members.map((m) => (
                            <TableRow key={m.environmentGuid}>
                              <TableCell>{m.environmentName || m.environmentGuid}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setEnvGroupOpen(false)}>Close</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* ── Tabbed content ─────────────────────────────────────────────── */}
      <TabList
        selectedValue={selectedTab}
        onTabSelect={(_, d) => setSelectedTab(d.value as string)}
      >
        <Tab value="scope">Scope</Tab>
        <Tab value="details">Details</Tab>
        <Tab value="collaboration">Collaboration</Tab>
      </TabList>

      <div className={styles.tabContent}>
        {selectedTab === 'scope' && <ReviewScopeTab />}
        {selectedTab === 'details' && <ReviewDetailsTab />}
        {selectedTab === 'collaboration' && <ReviewCollaborationTab />}
      </div>


      <div className={styles.navRow}>
        <div className={styles.navRowGroup}>
          <Button
            appearance="secondary"
            onClick={() => navigate('/new-request/justification')}
            disabled={isSubmitting}
            icon={<ArrowLeft20Regular />}
          >
            Back
          </Button>
          <CancelWizardDialog disabled={isSubmitting} />
        </div>
        <div className={styles.navRowGroup}>
          <SaveDraftButton disabled={isSubmitting} />
          <Button
            appearance="primary"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            icon={isSubmitting ? <Spinner size="tiny" /> : <Checkmark20Regular />}
            iconPosition="after"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </div>
      </div>
    </div>
  );
}
