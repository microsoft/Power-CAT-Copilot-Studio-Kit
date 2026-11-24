import { useCallback, useState } from 'react';
import {
  makeStyles,
  tokens,
  Spinner,
  Text,
  Card,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Link,
  Tooltip,
  Button,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
} from '@fluentui/react-components';
import type { RequestDetail } from '../../../shared/services/dataverse/requestService';
import { downloadAttachment } from '../../../shared/services/dataverse/commentService';
import { downloadBase64File } from '../../../shared/utils/fileUtils';
import { AttachmentChip } from '../../comments/components/AttachmentChip';
import type { ServiceTree } from '../../../models/serviceTree';
import { getServiceTreeDetail } from '../../../shared/services/dataverse/serviceTreeService';
import { getEnvironmentGroupDetail } from '../../../shared/services/dataverse/environmentGroupService';
import type { EnvironmentGroupMember } from '../../../models/environmentGroup';
import { Info16Regular, ChevronRight20Regular, ChevronDown20Regular, DismissCircle16Filled, CheckmarkCircle16Filled } from '@fluentui/react-icons';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  card: {
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
  },

  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },

  sectionHeading: {
    fontWeight: tokens.fontWeightSemibold,
  },

  metaText: {
    color: tokens.colorNeutralForeground3,
  },

  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalL,
  },

  justificationBlock: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    whiteSpace: 'pre-wrap',
  },

  adminCommentBlock: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    whiteSpace: 'pre-wrap',
    borderLeft: `4px solid ${tokens.colorBrandBackground}`,
    paddingLeft: tokens.spacingHorizontalM,
  },

  labelRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
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
    border: `1px solid ${tokens.colorBrandStroke1}`,
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

  tableActionCell: {
    width: '220px',
    minWidth: '220px',
    whiteSpace: 'nowrap',
  },

  dialogField: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    marginBottom: tokens.spacingVerticalS,
  },

  scrollableTableBody: {
    maxHeight: '220px',
    overflowY: 'auto',
  },

  actionRulesToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    cursor: 'pointer',
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase200,
    paddingTop: '2px',
    paddingBottom: '2px',
    background: 'none',
    border: 'none',
    fontFamily: 'inherit',
    ':hover': {
      textDecorationLine: 'underline',
    },
  },
  actionRulesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    paddingLeft: tokens.spacingHorizontalL,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
  },
  actionRuleItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  actionRuleIcon: {
    color: tokens.colorPaletteRedForeground1,
    flexShrink: 0,
  },
  actionAllowIcon: {
    color: tokens.colorPaletteGreenForeground1,
    flexShrink: 0,
  },
  actionRuleBadge: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
  },
  actionAllowBadge: {
    color: tokens.colorPaletteGreenForeground1,
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
  },
  actionCategoryHeader: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXXS,
  },
});

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
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface RequestSummaryTabProps {
  detail: RequestDetail;
}

export function RequestSummaryTab({ detail }: RequestSummaryTabProps) {
  const styles = useStyles();

  // ── Capsule dialog state ────────────────────────────────────────────────
  const [serviceTreeOpen, setServiceTreeOpen] = useState(false);
  const [serviceTreeDetail, setServiceTreeDetail] = useState<ServiceTree | null>(null);
  const [serviceTreeLoading, setServiceTreeLoading] = useState(false);
  const [serviceTreeError, setServiceTreeError] = useState<string | null>(null);

  const [envGroupOpen, setEnvGroupOpen] = useState(false);
  const [envGroupDetail, setEnvGroupDetail] = useState<EnvGroupDetail | null>(null);
  const [envGroupLoading, setEnvGroupLoading] = useState(false);
  const [envGroupError, setEnvGroupError] = useState<string | null>(null);
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

  const handleServiceTreeClick = useCallback(async () => {
    setServiceTreeOpen(true);
    if (serviceTreeDetail) return;
    setServiceTreeLoading(true);
    setServiceTreeError(null);
    try {
      setServiceTreeDetail(await getServiceTreeDetail(detail.serviceTreeId));
    } catch {
      setServiceTreeError('Failed to load Service Tree details.');
    } finally {
      setServiceTreeLoading(false);
    }
  }, [detail.serviceTreeId, serviceTreeDetail]);

  const handleEnvGroupClick = useCallback(async () => {
    if (!detail.environmentGroupId) return;
    setEnvGroupOpen(true);
    if (envGroupDetail) return;
    setEnvGroupLoading(true);
    setEnvGroupError(null);
    try {
      setEnvGroupDetail(await getEnvironmentGroupDetail(detail.environmentGroupId));
    } catch {
      setEnvGroupError('Failed to load Environment Container details.');
    } finally {
      setEnvGroupLoading(false);
    }
  }, [detail.environmentGroupId, envGroupDetail]);

  const handleDownloadSupportingDoc = useCallback(async () => {
    if (!detail.supportingDocumentAttachment) return;
    const { fileName, mimeType, base64 } = await downloadAttachment(detail.supportingDocumentAttachment.id);
    downloadBase64File(base64, fileName, mimeType);
  }, [detail.supportingDocumentAttachment]);

  return (
    <>
      {/* ── Capsules — Service Tree & Environment Container ──────────────── */}
      <div className={styles.capsuleRow}>
        <button className={styles.capsule} onClick={handleServiceTreeClick}
                aria-label="View Service Tree details">
          Service Tree: {detail.serviceTreeName ?? detail.serviceTreeId}
          <Info16Regular />
        </button>
        {detail.environmentGroupId && (
          <button className={styles.capsule} onClick={handleEnvGroupClick}
                  aria-label="View Environment Container details">
            Env Container: {detail.environmentGroupName ?? detail.environmentGroupId}
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

      {/* ── Environments ─────────────────────────────────────────────────── */}
      <Card className={styles.card}>
        <div className={styles.section}>
          <Text className={styles.sectionHeading} size={400}>
            Environments ({detail.environments.length})
          </Text>
          {detail.environments.length === 0 ? (
            <Text className={styles.metaText}>No environments selected.</Text>
          ) : (
            <div className={styles.scrollableTableBody}>
            <Table aria-label="Environments">
              <TableBody>
                {detail.environments.map((env) => {
                  const hasId = !!env.environmentGuid;
                  const adminCenterUrl = hasId
                    ? `https://admin.powerplatform.microsoft.com/security/dataprotection/dlp/environmentFilter/${env.environmentGuid}`
                    : undefined;
                  return (
                    <TableRow key={env.id}>
                      <TableCell>{env.environmentName || env.environmentGuid}</TableCell>
                      <TableCell className={styles.tableActionCell}>
                        <Tooltip
                          content={
                            hasId
                              ? 'Opens Admin Center to check which DLP policies include this environment.'
                              : 'Environment ID not available.'
                          }
                          relationship="label"
                        >
                          <Link
                            href={adminCenterUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            disabled={!hasId}
                          >
                            Check DLP Membership ↗
                          </Link>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </div>
      </Card>

      {/* ── Connectors ───────────────────────────────────────────────────── */}
      <Card className={styles.card}>
        <div className={styles.section}>
          <Text className={styles.sectionHeading} size={400}>
            Connectors ({detail.connectors.length})
          </Text>
          {detail.connectors.length === 0 ? (
            <Text className={styles.metaText}>No connectors selected.</Text>
          ) : (
            <div className={styles.scrollableTableBody}>
            <Table aria-label="Connectors">
              <TableBody>
                {detail.connectors.map((con) => {
                  const overrides = con.actionOverrides;
                  const blockedActions = overrides
                    ? Object.entries(overrides).filter(([, b]) => b === 'Block').map(([k]) => k)
                    : [];
                  const allowedActions = overrides
                    ? Object.entries(overrides).filter(([, b]) => b === 'Allow').map(([k]) => k)
                    : [];
                  const totalOverrides = allowedActions.length + blockedActions.length;
                  const hasAnyOverrides = totalOverrides > 0;
                  const isExpanded = expandedActions.has(con.id);
                  return (
                    <TableRow key={con.id}>
                      <TableCell>
                        <div>
                          {con.connectorDisplayName || con.connectorName || con.connectorId}
                          {hasAnyOverrides && (
                            <>
                              <button
                                className={styles.actionRulesToggle}
                                onClick={() => setExpandedActions((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(con.id)) next.delete(con.id);
                                  else next.add(con.id);
                                  return next;
                                })}
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                                {totalOverrides} action rule{totalOverrides === 1 ? '' : 's'}
                              </button>
                              {isExpanded && (
                                <div className={styles.actionRulesList}>
                                  {allowedActions.length > 0 && (
                                    <>
                                      <span className={styles.actionCategoryHeader}>
                                        Requested to Allow ({allowedActions.length})
                                      </span>
                                      {allowedActions.map((actionKey) => (
                                        <span key={actionKey} className={styles.actionRuleItem}>
                                          <CheckmarkCircle16Filled className={styles.actionAllowIcon} />
                                          {actionKey}
                                          <span className={styles.actionAllowBadge}>Allow</span>
                                        </span>
                                      ))}
                                    </>
                                  )}
                                  {blockedActions.length > 0 && (
                                    <>
                                      <span className={styles.actionCategoryHeader}>
                                        Requested to Block ({blockedActions.length})
                                      </span>
                                      {blockedActions.map((actionKey) => (
                                        <span key={actionKey} className={styles.actionRuleItem}>
                                          <DismissCircle16Filled className={styles.actionRuleIcon} />
                                          {actionKey}
                                          <span className={styles.actionRuleBadge}>Blocked</span>
                                        </span>
                                      ))}
                                    </>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={styles.tableActionCell}>
                        <Tooltip
                          content={con.connectorUrl ? 'Opens connector documentation page in a new tab.' : 'URL not available.'}
                          relationship="label"
                        >
                          <Link
                            href={con.connectorUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            disabled={!con.connectorUrl}
                          >
                            View Connector Documentation ↗
                          </Link>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </div>
      </Card>

      {/* ── Custom Connector Patterns ──────────────────────────────────── */}
      {detail.customConnectorPatterns && detail.customConnectorPatterns.length > 0 && (
        <Card className={styles.card}>
          <div className={styles.section}>
            <Text className={styles.sectionHeading} size={400}>
              Custom Connector Patterns ({detail.customConnectorPatterns.length})
            </Text>
            <Table aria-label="Custom connector patterns">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Order</TableHeaderCell>
                  <TableHeaderCell>Host URL Pattern</TableHeaderCell>
                  <TableHeaderCell>Data Group</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.customConnectorPatterns.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.order}</TableCell>
                    <TableCell>{p.hostUrlPattern}</TableCell>
                    <TableCell>{p.dataGroup}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ── Questionnaire answers (hidden when empty) ──────────────────── */}
      {detail.answers.length > 0 && (
      <Card className={styles.card}>
        <Accordion collapsible defaultOpenItems={[]}>
          <AccordionItem value="questionnaire">
            <AccordionHeader size="large">
              <Text className={styles.sectionHeading} size={400}>
                Questionnaire ({detail.answers.length})
              </Text>
            </AccordionHeader>
            <AccordionPanel>
                <Table aria-label="Questionnaire answers">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Question</TableHeaderCell>
                      <TableHeaderCell>Answer</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.answers.map((ans) => (
                      <TableRow key={ans.id}>
                        <TableCell>{ans.questionTextSnapshot}</TableCell>
                        <TableCell>{ans.answerValue || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Card>
      )}

      {/* ── Justification ────────────────────────────────────────────────── */}
      <Card className={styles.card}>
        <div className={styles.section}>
          <Text className={styles.sectionHeading} size={400}>
            Justification
          </Text>
          <div className={styles.justificationBlock}>
            <Text size={300}>{detail.justification}</Text>
          </div>
        </div>
      </Card>

      {/* ── Supporting document ───────────────────────────────────────────── */}
      {detail.hasSupportingDocument && detail.supportingDocumentAttachment && (
        <Card className={styles.card}>
          <div className={styles.section}>
            <Text className={styles.sectionHeading} size={400}>
              Supporting Document
            </Text>
            <AttachmentChip
              fileName={detail.supportingDocumentAttachment.fileName}
              fileSize={detail.supportingDocumentAttachment.fileSize}
              mimeType={detail.supportingDocumentAttachment.mimeType}
              annotationId={detail.supportingDocumentAttachment.id}
              onDownload={handleDownloadSupportingDoc}
            />
          </div>
        </Card>
      )}

      {/* ── Co-owners ──────────────────────────────────────────────────── */}
      <Card className={styles.card}>
        <div className={styles.section}>
          <Text className={styles.sectionHeading} size={400}>
            Co-owners ({detail.participants.length})
          </Text>
          {detail.participants.length === 0 ? (
            <Text className={styles.metaText}>No additional co-owners.</Text>
          ) : (
            <Table aria-label="Co-owners">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>User</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.participants.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.participantUpn}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      {/* ── Admin comment ─────────────────────────────────────────────────── */}
      {detail.adminComment && (
        <Card className={styles.card}>
          <div className={styles.section}>
            <Text className={styles.sectionHeading} size={400}>
              Admin Comment
            </Text>
            <div className={styles.adminCommentBlock}>
              <Text size={300}>{detail.adminComment}</Text>
            </div>
          </div>
        </Card>
      )}

    </>
  );
}
