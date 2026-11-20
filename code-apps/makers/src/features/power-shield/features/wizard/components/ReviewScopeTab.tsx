import { useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  Table,
  TableBody,
  TableRow,
  TableCell,
} from '@fluentui/react-components';
import {
  ChevronRight20Regular,
  ChevronDown20Regular,
  DismissCircle16Filled,
  CheckmarkCircle16Filled,
} from '@fluentui/react-icons';
import { useWizard } from './WizardShell';

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  sectionHeading: {
    fontWeight: tokens.fontWeightSemibold,
  },
  metaText: {
    color: tokens.colorNeutralForeground3,
  },
  card: {
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
  },
  scrollableTableBody: {
    maxHeight: '220px',
    overflowY: 'auto',
  },
  pill: {
    display: 'inline-block',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    marginRight: tokens.spacingHorizontalXS,
    marginBottom: tokens.spacingVerticalXS,
    fontSize: tokens.fontSizeBase200,
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

/** Scope tab: Environments, Connectors, Custom Connector Patterns */
export function ReviewScopeTab() {
  const styles = useStyles();
  const { state } = useWizard();
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

  return (
    <>
      {/* ── Environments ─────────────────────────────────────────────────── */}
      <Card className={styles.card}>
        <div className={styles.section}>
          <Text className={styles.sectionHeading} size={400}>
            Environments ({state.selectedEnvironments.length})
          </Text>
          {state.selectedEnvironments.length === 0 ? (
            <Text className={styles.metaText}>No environments selected.</Text>
          ) : (
            <div className={styles.scrollableTableBody}>
              <Table aria-label="Environments">
                <TableBody>
                  {state.selectedEnvironments.map((env) => (
                    <TableRow key={env.environmentId}>
                      <TableCell>{env.displayName}</TableCell>
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
            Connectors ({state.selectedConnectors.length})
          </Text>
          {state.selectedConnectors.length === 0 ? (
            <Text className={styles.metaText}>No connectors selected.</Text>
          ) : (
            <div className={styles.scrollableTableBody}>
              <Table aria-label="Connectors">
                <TableBody>
                  {state.selectedConnectors.map((c) => {
                    const overrides = state.connectorActionOverrides[c.connectorId];
                    const blockedActions = overrides
                      ? Object.entries(overrides).filter(([, b]) => b === 'Block').map(([k]) => k)
                      : [];
                    const allowedActions = overrides
                      ? Object.entries(overrides).filter(([, b]) => b === 'Allow').map(([k]) => k)
                      : [];
                    const totalOverrides = allowedActions.length + blockedActions.length;
                    const hasAnyOverrides = totalOverrides > 0;
                    const isExpanded = expandedActions.has(c.connectorId);
                    return (
                      <TableRow key={c.connectorId}>
                        <TableCell>
                          <div>
                            {c.displayName}
                            {hasAnyOverrides && (
                              <>
                                <button
                                  className={styles.actionRulesToggle}
                                  onClick={() => setExpandedActions((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(c.connectorId)) next.delete(c.connectorId);
                                    else next.add(c.connectorId);
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

      {/* ── Custom Connector Patterns ─────────────────────────────────────── */}
      {state.customConnectorPatterns.length > 0 && (
        <div className={styles.section}>
          <Text className={styles.sectionTitle}>
            Custom Connector Patterns ({state.customConnectorPatterns.length})
          </Text>
          <div>
            {state.customConnectorPatterns.map((p) => (
              <span key={p.tempId} className={styles.pill}>
                {p.hostUrlPattern} ({p.dataGroup === 1 ? 'Non-business' : p.dataGroup === 2 ? 'Business' : 'Blocked'})
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
