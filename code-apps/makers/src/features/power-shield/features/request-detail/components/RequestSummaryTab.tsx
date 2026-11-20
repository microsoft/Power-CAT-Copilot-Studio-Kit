import { useCallback, useState } from 'react';
import {
  makeStyles,
  tokens,
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
} from '@fluentui/react-components';
import type { RequestDetail } from '../../../shared/services/dataverse/requestService';
import { downloadAttachment } from '../../../shared/services/dataverse/commentService';
import { downloadBase64File } from '../../../shared/utils/fileUtils';
import { AttachmentChip } from '../../comments/components/AttachmentChip';
import { RequestContextCapsules } from '../../../shared/components/RequestContextCapsules';
import { RequestedByCard, JustificationCard, CoOwnersCard } from '../../../shared/components/SummaryCards';
import { ChevronRight20Regular, ChevronDown20Regular, DismissCircle16Filled, CheckmarkCircle16Filled } from '@fluentui/react-icons';

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
    gap: tokens.spacingVerticalXXS,
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
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface RequestSummaryTabProps {
  detail: RequestDetail;
}

export function RequestSummaryTab({ detail }: RequestSummaryTabProps) {
  const styles = useStyles();

  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

  const handleDownloadSupportingDoc = useCallback(async () => {
    if (!detail.supportingDocumentAttachment) return;
    const { fileName, mimeType, base64 } = await downloadAttachment(detail.supportingDocumentAttachment.id);
    downloadBase64File(base64, fileName, mimeType);
  }, [detail.supportingDocumentAttachment]);

  return (
    <>
      <RequestContextCapsules
        serviceTreeId={detail.serviceTreeId}
        serviceTreeName={detail.serviceTreeName}
        environmentGroupId={detail.environmentGroupId}
        environmentGroupName={detail.environmentGroupName}
      />

      <RequestedByCard name={detail.createdByName} upn={detail.createdByUpn} />

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
                {detail.environments.map((env) => (
                    <TableRow key={env.id}>
                      <TableCell>{env.environmentName || env.environmentGuid}</TableCell>
                    </TableRow>
                ))}
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

      <JustificationCard justification={detail.justification} />

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

      <CoOwnersCard participants={detail.participants} />

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
