import { useMemo } from 'react';
import {
  Body1,
  MessageBar,
  MessageBarBody,
  Subtitle2,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { CheckmarkRegular } from '@fluentui/react-icons';
import { useCreditWizard } from '../contexts/CreditWizardContext';
import { parseRequestedAmount, sumValidAmounts } from '../../../../shared/utils/creditAmountRules';
import { TypeBadge } from '../../../../shared/components/EnvironmentPickerTable';
import type { PpEnvironment } from '../../../../models/environment';

const useStyles = makeStyles({
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '900px',
  },
  details: {
    display: 'grid',
    gridTemplateColumns: '180px 1fr',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalS,
    margin: 0,
  },
  term: {
    color: tokens.colorNeutralForeground3,
  },
  value: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  amountCol: {
    width: '180px',
  },
  drawCol: {
    width: '160px',
  },
  yes: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorPaletteGreenForeground1,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  totalRow: {
    backgroundColor: tokens.colorNeutralBackground2,
  },
  totalLabel: {
    fontWeight: tokens.fontWeightSemibold,
  },
  changed: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
});

const numberFormat = new Intl.NumberFormat();

/**
 * Step 4 — Review & Submit.
 *
 * Shows the justification, then one row per environment with
 * the credits the maker asked for and the total. Each environment becomes its own
 * request, so the footer says how many requests submitting creates.
 */
export function CreditStep4Review({ environments }: { environments: PpEnvironment[] }) {
  const styles = useStyles();
  const { state } = useCreditWizard();

  const envById = useMemo(
    () => new Map(environments.map((e) => [e.name.toLowerCase(), e])),
    [environments],
  );
  const ids = state.selectedEnvironments.map((e) => e.environmentId);
  const total = sumValidAmounts(ids, state.requestedAmounts);
  const count = state.selectedEnvironments.length;
  const supportingDocName =
    state.supportingDocument?.name ?? state.existingSupportingDocumentName;
  const showDiff = state.envDiff !== null && state.envDiff.removed.length > 0;

  const detailRows: Array<[string, string]> = [
    ['Justification', state.justification.trim() || '-'],
  ];
  if (supportingDocName) detailRows.push(['Supporting document', supportingDocName]);

  return (
    <div className={styles.root}>
      <dl className={styles.details}>
        {detailRows.map(([term, value]) => (
          <div key={term} style={{ display: 'contents' }}>
            <dt className={styles.term}>
              <Body1>{term}</Body1>
            </dt>
            <dd className={styles.value}>
              <Body1>{value}</Body1>
            </dd>
          </div>
        ))}
      </dl>

      <Subtitle2 as="h3">Environments</Subtitle2>
      <Table aria-label="Environments and what you're requesting" size="small">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Display Name</TableHeaderCell>
            <TableHeaderCell>Type</TableHeaderCell>
            <TableHeaderCell className={styles.amountCol}>Credits requested</TableHeaderCell>
            <TableHeaderCell className={styles.drawCol}>Tenant draw</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {state.selectedEnvironments.map((env) => {
            const parsed = parseRequestedAmount(state.requestedAmounts[env.environmentId]);
            const meta = envById.get(env.environmentId.toLowerCase());
            const ticked = state.requestTenantDraw[env.environmentId] === true;
            return (
              <TableRow key={env.environmentId}>
                <TableCell>{env.displayName}</TableCell>
                <TableCell>{meta ? <TypeBadge type={meta.environmentSku} /> : <Text>-</Text>}</TableCell>
                <TableCell className={styles.amountCol}>
                  {parsed.ok ? (
                    numberFormat.format(parsed.value)
                  ) : (
                    <Text className={styles.muted}>
                      <span aria-hidden="true">-</span>
                      <span className={styles.visuallyHidden}>None</span>
                    </Text>
                  )}
                </TableCell>
                <TableCell className={styles.drawCol}>
                  {ticked ? (
                    <span className={styles.yes}>
                      <CheckmarkRegular aria-hidden="true" />
                      Requested
                    </span>
                  ) : (
                    <Text className={styles.muted}>
                      <span aria-hidden="true">-</span>
                      <span className={styles.visuallyHidden}>Not requested</span>
                    </Text>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className={styles.totalRow}>
            <TableCell className={styles.totalLabel}>Total requested</TableCell>
            <TableCell />
            <TableCell className={`${styles.amountCol} ${styles.totalLabel}`}>
              {numberFormat.format(total)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>

      {showDiff && (
        <MessageBar intent="warning">
          <MessageBarBody>
            <div className={styles.changed}>
              {state.envDiff!.removed.length > 0 && (
                <span>
                  No longer available: {state.envDiff!.removed.map((e) => e.displayName).join(', ')}.
                </span>
              )}
            </div>
          </MessageBarBody>
        </MessageBar>
      )}

      <MessageBar intent="info">
        <MessageBarBody>
          This creates <strong>{count === 1 ? '1 request' : `${count} requests`}</strong>, one per
          environment.
        </MessageBarBody>
      </MessageBar>
    </div>
  );
}