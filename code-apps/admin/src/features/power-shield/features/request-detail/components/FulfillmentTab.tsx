import { useCallback, useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  Spinner,
  Button,
  Tooltip,
  Link,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';
import { Copy16Regular, CheckmarkCircle16Filled } from '@fluentui/react-icons';
import type { RequestDetail } from '../../../shared/services/dataverse/requestService';
import { FulfillmentTable } from './FulfillmentTable';
import { useLayoutStyles } from '../../../shared/styles';

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

  // DLP Policy key-value grid
  kvGrid: {
    display: 'grid',
    gridTemplateColumns: '140px 1fr',
    gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    alignItems: 'start',
  },

  kvLabel: {
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    paddingTop: '2px',
  },

  kvValue: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    wordBreak: 'break-all',
  },

  monoValue: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },

  copyButton: {
    flexShrink: 0,
    minWidth: 'auto',
    padding: '2px',
  },

  copiedIcon: {
    color: tokens.colorPaletteGreenForeground1,
  },

  errorBlock: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    whiteSpace: 'pre-wrap',
    borderLeft: `4px solid ${tokens.colorPaletteRedBorderActive}`,
    paddingLeft: tokens.spacingHorizontalM,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function useCopyToClipboard() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Clipboard API not available — silently ignore
    }
  }, []);

  return { copiedKey, copy };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface FulfillmentTabProps {
  detail: RequestDetail;
}

export function FulfillmentTab({ detail }: FulfillmentTabProps) {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const { copiedKey, copy } = useCopyToClipboard();

  const environments = detail.environments;
  const totalCount = environments.length;

  const showDlpPolicy = !!detail.dlpPolicyName;
  const showImplementing = detail.status === 'Implementing';
  const showFulfillment = ['Approved', 'Implementing', 'Implemented', 'ImplementedWithErrors'].includes(detail.status);
  const showErrorSummary = !!detail.lastErrorSummary;

  return (
    <div className={layoutStyles.contentStack}>
      {/* ── Implementing spinner + guidance ─────────────────────────────── */}
      {showImplementing && (
        <>
          <Card className={styles.card}>
            <div className={styles.section}>
              <Spinner
                label={
                  detail.dlpPolicyId
                    ? 'Connector configuration in progress...'
                    : 'DLP policy creation in progress...'
                }
                labelPosition="after"
                size="small"
              />
            </div>
          </Card>
          <MessageBar intent="info">
            <MessageBarBody>
              <MessageBarTitle>
                {detail.dlpPolicyId
                  ? 'Background process running'
                  : 'Policy creation in progress'}
              </MessageBarTitle>
              {detail.dlpPolicyId
                ? 'A background process is applying custom connector URL patterns and action configurations to the DLP policy. This typically completes within a few minutes. Use the Refresh button above to check for updates.'
                : 'DLP policy creation is in progress. This typically completes within a few seconds. Use the Refresh button above to check for updates.'}
            </MessageBarBody>
          </MessageBar>
        </>
      )}

      {/* ── DLP Policy info ──────────────────────────────────────────────── */}
      {showDlpPolicy && (
        <Card className={styles.card}>
          <div className={styles.section}>
            <Text className={styles.sectionHeading} size={400}>
              DLP Policy
            </Text>
            <div className={styles.kvGrid}>
              <Text className={styles.kvLabel}>Service Tree</Text>
              <div className={styles.kvValue}>
                <Text size={300}>{detail.serviceTreeName ?? detail.serviceTreeId}</Text>
              </div>

              <Text className={styles.kvLabel}>Request</Text>
              <div className={styles.kvValue}>
                {detail.dlpPolicyId ? (
                  <Tooltip
                    content="Opens DLP Policy in Power Platform Admin Center"
                    relationship="label"
                  >
                    <Link
                      href={`https://admin.powerplatform.microsoft.com/security/dataprotection/dlp/policy/${detail.dlpPolicyId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {detail.requestNumber} ↗
                    </Link>
                  </Tooltip>
                ) : (
                  <Text size={300}>{detail.requestNumber}</Text>
                )}
              </div>

              <Text className={styles.kvLabel}>Policy Name</Text>
              <div className={styles.kvValue}>
                <Text size={300}>{detail.dlpPolicyName}</Text>
                <Tooltip
                  content={copiedKey === 'policyName' ? 'Copied!' : 'Copy policy name'}
                  relationship="label"
                >
                  <Button
                    className={styles.copyButton}
                    appearance="subtle"
                    size="small"
                    icon={
                      copiedKey === 'policyName'
                        ? <CheckmarkCircle16Filled className={styles.copiedIcon} />
                        : <Copy16Regular />
                    }
                    onClick={() => copy('policyName', detail.dlpPolicyName!)}
                    aria-label="Copy policy name"
                  />
                </Tooltip>
              </div>

              {detail.dlpPolicyId && (
                <>
                  <Text className={styles.kvLabel}>Policy ID</Text>
                  <div className={styles.kvValue}>
                    <Text size={200} className={styles.monoValue}>
                      {detail.dlpPolicyId}
                    </Text>
                    <Tooltip
                      content={copiedKey === 'policyId' ? 'Copied!' : 'Copy policy ID'}
                      relationship="label"
                    >
                      <Button
                        className={styles.copyButton}
                        appearance="subtle"
                        size="small"
                        icon={
                          copiedKey === 'policyId'
                            ? <CheckmarkCircle16Filled className={styles.copiedIcon} />
                            : <Copy16Regular />
                        }
                        onClick={() => copy('policyId', detail.dlpPolicyId!)}
                        aria-label="Copy policy ID"
                      />
                    </Tooltip>
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Error Summary ────────────────────────────────────────────────── */}
      {showErrorSummary && (
        <Card className={styles.card}>
          <div className={styles.section}>
            <Text className={styles.sectionHeading} size={400}>
              Error Summary
            </Text>
            <div className={styles.errorBlock}>
              <Text size={300}>{detail.lastErrorSummary}</Text>
            </div>
          </div>
        </Card>
      )}

      {/* ── Fulfillment table ─────────────────────────────────────────────── */}
      {showFulfillment && totalCount > 0 && (
        <Card className={styles.card}>
          <FulfillmentTable environments={environments} />
        </Card>
      )}
    </div>
  );
}
