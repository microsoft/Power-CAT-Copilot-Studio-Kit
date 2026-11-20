import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Field,
  Link,
  MessageBar,
  MessageBarBody,
  Textarea,
  Spinner,
  Tooltip,
  Text,
} from '@fluentui/react-components';
import type { DialogOpenChangeData, DialogOpenChangeEvent } from '@fluentui/react-components';
import { Info16Regular } from '@fluentui/react-icons';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useNotify } from '../../../shared/hooks/useNotify';
import {
  takeOwnership,
  approveAndFulfillRequest,
  rejectRequest,
} from '../../../shared/services/dataverse/requestService';
import { fulfillRequest, retriggerConnectorConfiguration } from '../../../shared/services/dlp/fulfillmentService';
import {
  getDlpPreflightSummary,
  type DlpPreflightSummary,
} from '../../../shared/services/dlp/dlpPreflightService';
import {
  getConnectorBlockedStatus,
  type ConnectorBlockedStatus,
} from '../../../shared/services/dataverse/connectorService';
import { getNotificationSettings } from '../../admin/services/notificationSettingsService';
import { ReviewApproveWizard } from './ReviewApproveWizard';
import type { RequestConnector } from '../../../models/requestConnector';
import type { RequestStatus } from '../../../models/status';

interface AdminActionsProps {
  requestId: string;
  environments: Array<{ guid: string; name: string }>;
  environmentCount: number;
  connectorCount: number;
  requestConnectors: RequestConnector[];
  status: RequestStatus;
  dlpPolicyId?: string;
  assignedAdminName?: string;
  assignedAdminDvUserId?: string;
  serviceTreeId?: string;
  environmentGroupId?: string;
  onActionComplete: () => void;
}

export function AdminActions({
  requestId,
  environments,
  environmentCount,
  connectorCount,
  requestConnectors,
  status,
  dlpPolicyId,
  assignedAdminName,
  assignedAdminDvUserId,
  serviceTreeId,
  environmentGroupId,
  onActionComplete,
}: AdminActionsProps) {
  const { aadObjectId, dvUserId } = useAuth();
  const { notifySuccess, notifyError, notifyWarning } = useNotify();

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFulfilling, setIsFulfilling] = useState(false);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [preflight, setPreflight] = useState<DlpPreflightSummary | null>(null);
  const [blockedStatuses, setBlockedStatuses] = useState<ConnectorBlockedStatus[]>([]);
  const [isRetryMode, setIsRetryMode] = useState(false);
  const [assignConfirmOpen, setAssignConfirmOpen] = useState(false);

  /** Returns a user-friendly message if the error is a DLP permission failure. */
  function getDlpPermissionError(errorText?: string): string | null {
    if (!errorText) return null;
    const permissionPatterns = [
      'EnvironmentAdminCannotDeleteTenantLevelDLPPolicy',
      'does not have permission',
      'not have permission to delete tenant level policy',
      'not have permission to create tenant level policy',
    ];
    if (permissionPatterns.some((p) => errorText.includes(p))) {
      return 'Unable to create DLP policy - you don\'t have the required permissions. Ask your IT admin to assign you the Power Platform Administrator role in the Microsoft 365 admin center (https://admin.microsoft.com).';
    }
    return null;
  }

  /** Fire-and-forget: warn the admin if email notifications won't be sent. */
  async function warnIfNotificationsDisabled() {
    try {
      const settings = await getNotificationSettings();
      if (!settings.enabled) {
        notifyWarning('Email notifications are disabled. The maker will not be notified. Configure in Settings > Setup > Notifications.');
      } else if (!settings.senderMailbox) {
        notifyWarning('Sender email is not configured. The maker will not be notified. Configure in Settings > Setup > Notifications.');
      }
    } catch {
      // Silently ignore — don't distract from the main action
    }
  }

  // ── Assign to Me ────────────────────────────────────────────────────────

  async function handleAssignToMe() {
    setAssignConfirmOpen(false);
    setIsLoading(true);
    try {
      await takeOwnership(requestId, dvUserId);
      notifySuccess('Request assigned to you successfully.');
      onActionComplete();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to assign request.');
    } finally {
      setIsLoading(false);
    }
  }

  // ── Pre-flight check ──────────────────────────────────────────────────────

  async function handleApproveClick(retry = false) {
    setIsRetryMode(retry);
    setIsPreflighting(true);
    try {
      const connectorIds = requestConnectors.map((c) => c.connectorId);
      const [summary, blocked] = await Promise.all([
        getDlpPreflightSummary(environments, serviceTreeId, environmentGroupId),
        getConnectorBlockedStatus(connectorIds),
      ]);
      setPreflight(summary);
      setBlockedStatuses(blocked);
      setApproveOpen(true);
    } catch {
      notifyError('Could not perform pre-flight check. Please try again.');
    } finally {
      setIsPreflighting(false);
    }
  }

  // ── Fulfillment handlers ──────────────────────────────────────────────────

  async function handleApprove(comment: string) {
    setIsFulfilling(true);
    try {
      const result = await approveAndFulfillRequest(
        requestId,
        aadObjectId,
        comment || undefined,
      );
      setApproveOpen(false);
      setPreflight(null);
      if (result.success && result.pendingPatterns) {
        const replaced = result.deletedExistingPolicy ? 'Existing DLP policy replaced.' : 'DLP policy created.';
        notifySuccess(`Request approved. ${replaced} Custom connector URL patterns will be applied shortly.`);
      } else if (result.success) {
        const replaced = result.deletedExistingPolicy ? 'Existing DLP policy replaced successfully.' : 'DLP policy created successfully.';
        notifySuccess(`Request approved. ${replaced}`);
      } else {
        const permissionMsg = getDlpPermissionError(result.errorSummary);
        notifyWarning(permissionMsg ?? `Request approved but DLP policy creation failed: ${result.errorSummary ?? 'Unknown error.'}`);
      }
      void warnIfNotificationsDisabled();
      onActionComplete();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to approve request.';
      const permissionMsg = getDlpPermissionError(errMsg);
      notifyError(permissionMsg ?? errMsg);
    } finally {
      setIsFulfilling(false);
    }
  }

  async function handleRetryFulfillment() {
    setIsFulfilling(true);
    try {
      const result = await fulfillRequest(requestId);
      setApproveOpen(false);
      setPreflight(null);
      if (result.success && result.pendingPatterns) {
        const replaced = result.deletedExistingPolicy ? 'Existing DLP policy replaced.' : 'DLP policy created.';
        notifySuccess(`${replaced} Custom connector URL patterns will be applied shortly.`);
      } else if (result.success) {
        const replaced = result.deletedExistingPolicy ? 'Existing DLP policy replaced successfully.' : 'DLP policy created successfully.';
        notifySuccess(replaced);
      } else {
        const permissionMsg = getDlpPermissionError(result.errorSummary);
        notifyWarning(permissionMsg ?? `DLP policy creation failed: ${result.errorSummary ?? 'Unknown error.'}`);
      }
      onActionComplete();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to retry DLP creation.';
      const permissionMsg = getDlpPermissionError(errMsg);
      notifyError(permissionMsg ?? errMsg);
    } finally {
      setIsFulfilling(false);
    }
  }

  async function handleRetriggerFlow() {
    setIsFulfilling(true);
    try {
      await retriggerConnectorConfiguration(requestId);
      notifySuccess('Connector configuration re-triggered. Settings will be applied shortly.');
      onActionComplete();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to re-trigger connector configuration.');
    } finally {
      setIsFulfilling(false);
    }
  }

  function handleConfirm(comment: string) {
    if (isRetryMode) {
      void handleRetryFulfillment();
    } else {
      void handleApprove(comment);
    }
  }

  // ── Reject handler ────────────────────────────────────────────────────────

  async function handleReject() {
    if (!rejectComment.trim()) return;
    setIsLoading(true);
    try {
      await rejectRequest(requestId, rejectComment);
      setRejectOpen(false);
      setRejectComment('');
      notifySuccess('Request rejected.');
      void warnIfNotificationsDisabled();
      onActionComplete();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to reject request.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleRejectOpenChange(_: DialogOpenChangeEvent, data: DialogOpenChangeData) {
    setRejectOpen(data.open);
  }

  const busy = isLoading || isFulfilling;

  return (
    <>
      {/* Assign to Me — visible when Submitted or UnderReview, hidden if already assigned to current admin */}
      {(status === 'Submitted' || (status === 'UnderReview' && assignedAdminDvUserId !== dvUserId)) && (
        <>
          <Tooltip
            content={
              status === 'UnderReview'
                ? 'Reassigns this request to you as the reviewing administrator.'
                : 'Assigns you as the reviewing administrator and moves this request to Under Review status.'
            }
            relationship="description"
            positioning="below"
          >
            <Button
              appearance="secondary"
              onClick={() => setAssignConfirmOpen(true)}
              disabled={busy}
              icon={<Info16Regular />}
              iconPosition="after"
            >
              Assign to Me
            </Button>
          </Tooltip>
          <Dialog open={assignConfirmOpen} onOpenChange={(_, data) => setAssignConfirmOpen(data.open)}>
            <DialogSurface>
              <DialogTitle>{status === 'UnderReview' ? 'Reassign Request' : 'Assign Request'}</DialogTitle>
              <DialogBody>
                <DialogContent>
                  {status === 'UnderReview' ? (
                    <>
                      <Text>
                        This request is currently assigned to{' '}
                        <strong>{assignedAdminName ?? 'another administrator'}</strong>.
                        You are about to reassign it to yourself. You will become the reviewing
                        administrator responsible for making a decision on this request.
                      </Text>
                      <br />
                      <Text>Do you want to proceed?</Text>
                    </>
                  ) : (
                    <>
                      <Text>
                        You are about to assign yourself as the reviewing administrator for this request.
                        The request status will change to <strong>Under Review</strong>, and you will be
                        responsible for reviewing and making a decision on it.
                      </Text>
                      <br />
                      <Text>Do you want to proceed?</Text>
                    </>
                  )}
                  <MessageBar intent="info" style={{ marginTop: '12px' }}>
                    <MessageBarBody>
                      To approve requests and create DLP policies, you need the{' '}
                      <strong>Power Platform Administrator</strong> role assigned in the{' '}
                      <Link href="https://admin.microsoft.com" target="_blank" inline>
                        Microsoft 365 admin center
                      </Link>.
                    </MessageBarBody>
                  </MessageBar>
                </DialogContent>
                <DialogActions>
                  <Button
                    appearance="primary"
                    onClick={() => void handleAssignToMe()}
                    disabled={isLoading}
                  >
                    Confirm
                  </Button>
                  <Button appearance="secondary" onClick={() => setAssignConfirmOpen(false)}>
                    Cancel
                  </Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </>
      )}

      {/* Approve — visible when UnderReview */}
      {status === 'UnderReview' && (
        <>
          <Button
            appearance="primary"
            disabled={busy || isPreflighting}
            onClick={() => void handleApproveClick(false)}
            icon={isPreflighting ? <Spinner size="tiny" /> : undefined}
          >
            Approve
          </Button>

          {preflight && (
            <ReviewApproveWizard
              open={approveOpen}
              onOpenChange={(open) => { if (!isFulfilling) setApproveOpen(open); }}
              preflight={preflight}
              blockedConnectors={blockedStatuses}
              requestConnectors={requestConnectors}
              environmentCount={environmentCount}
              connectorCount={connectorCount}
              isFulfilling={isFulfilling}
              onConfirm={handleConfirm}
            />
          )}
        </>
      )}

      {/* Reject — visible when UnderReview */}
      {status === 'UnderReview' && (
        <>
          <Button
            appearance="secondary"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
          >
            Reject
          </Button>
          <Dialog open={rejectOpen} onOpenChange={handleRejectOpenChange}>
            <DialogSurface>
              <DialogTitle>Reject Request</DialogTitle>
              <DialogBody>
                <DialogContent>
                  <Field label="Admin comment (required)" required>
                    <Textarea
                      value={rejectComment}
                      onChange={(_, data) => setRejectComment(data.value)}
                      placeholder="Enter your reason for rejection..."
                      rows={4}
                    />
                  </Field>
                </DialogContent>
                <DialogActions>
                  <Button
                    appearance="primary"
                    onClick={() => void handleReject()}
                    disabled={isLoading || !rejectComment.trim()}
                  >
                    Confirm Reject
                  </Button>
                  <Button appearance="secondary" onClick={() => setRejectOpen(false)}>
                    Cancel
                  </Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </>
      )}

      {/* Retry — visible when ImplementedWithErrors */}
      {status === 'ImplementedWithErrors' && (
        <>
          {dlpPolicyId ? (
            /* Case B: Policy exists, cloud flow failed — just re-trigger the flow */
            <Button
              appearance="primary"
              onClick={() => void handleRetriggerFlow()}
              disabled={busy}
              icon={isFulfilling ? <Spinner size="tiny" /> : undefined}
            >
              {isFulfilling ? 'Retrying...' : 'Retry Connector Configuration'}
            </Button>
          ) : (
            /* Case A: DLP creation failed — run full preflight + fulfillRequest */
            <>
              <Button
                appearance="primary"
                onClick={() => void handleApproveClick(true)}
                disabled={busy || isPreflighting}
                icon={isPreflighting ? <Spinner size="tiny" /> : undefined}
              >
                {isFulfilling ? 'Retrying...' : 'Retry DLP Creation'}
              </Button>

              {preflight && (
                <ReviewApproveWizard
                  open={approveOpen}
                  onOpenChange={(open) => { if (!isFulfilling) setApproveOpen(open); }}
                  preflight={preflight}
                  blockedConnectors={blockedStatuses}
                  requestConnectors={requestConnectors}
                  environmentCount={environmentCount}
                  connectorCount={connectorCount}
                  isFulfilling={isFulfilling}
                  onConfirm={handleConfirm}
                />
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
