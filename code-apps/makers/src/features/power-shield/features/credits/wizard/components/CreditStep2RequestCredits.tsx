import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Checkbox,
  Field,
  InfoLabel,
  Input,
  MessageBar,
  MessageBarBody,
  Skeleton,
  SkeletonItem,
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
import { useCreditWizard } from '../contexts/CreditWizardContext';
import {
  MIN_REQUESTED_CREDITS,
  countInvalidRows,
  getRowError,
  rowErrorText,
  sumValidAmounts,
} from '../../../../shared/utils/creditAmountRules';
import { TypeBadge } from '../../../../shared/components/EnvironmentPickerTable';
import { TenantDrawTip } from './TenantDrawTip';
import type { PpEnvironment } from '../../../../models/environment';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '980px',
  },
  amountCol: {
    width: '200px',
  },
  orCol: {
    width: '32px',
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  drawCol: {
    width: '190px',
  },
  headerLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    whiteSpace: 'nowrap',
  },
  amountField: {
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
  },
  totalRow: {
    backgroundColor: tokens.colorNeutralBackground2,
  },
  totalLabel: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

const numberFormat = new Intl.NumberFormat();

interface CreditStep2RequestCreditsProps {
  environments: PpEnvironment[];
  isLoading: boolean;
  error: string | null | undefined;
  /** Goes up by one on every blocked Next; each change moves focus to the first bad row. */
  focusRequest: number;
}

/**
 * Step 2 — Request credits.
 *
 * For each selected environment the maker asks for more credits, ticks "Draw from tenant",
 * or both (spec 031). Each row shows its error after the maker leaves the box, or once Next
 * was tried. After a blocked Next, focus moves to the first row that still has a problem.
 */
export function CreditStep2RequestCredits({
  environments,
  isLoading,
  error,
  focusRequest,
}: CreditStep2RequestCreditsProps) {
  const styles = useStyles();
  const { state, dispatch } = useCreditWizard();
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [drawHeader, setDrawHeader] = useState<HTMLElement | null>(null);

  const ids = useMemo(
    () => state.selectedEnvironments.map((e) => e.environmentId),
    [state.selectedEnvironments],
  );
  const envById = useMemo(
    () => new Map(environments.map((e) => [e.name.toLowerCase(), e])),
    [environments],
  );

  const attemptedNext = state.attemptedNextSteps.includes(2);
  const invalidCount = countInvalidRows(ids, state.requestedAmounts, state.requestTenantDraw);
  const total = sumValidAmounts(ids, state.requestedAmounts);

  useEffect(() => {
    if (focusRequest === 0) return;
    const firstBad = ids.find(
      (id) => getRowError(state.requestedAmounts[id], state.requestTenantDraw[id] === true) !== null,
    );
    if (firstBad) inputRefs.current[firstBad]?.focus();
    // Only react to a new blocked Next, not to every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  function markTouched(environmentId: string) {
    setTouched((t) => (t[environmentId] ? t : { ...t, [environmentId]: true }));
  }

  function renderMeta(environmentId: string, field: 'type' | 'location') {
    if (isLoading) {
      return (
        <Skeleton aria-label="Loading">
          <SkeletonItem size={16} />
        </Skeleton>
      );
    }
    const env = envById.get(environmentId.toLowerCase());
    if (error || !env) return <Text>-</Text>;
    return field === 'type' ? <TypeBadge type={env.environmentSku} /> : <Text>{env.location}</Text>;
  }

  return (
    <div className={styles.root}>
      <Text>
        For each environment, ask for more Copilot credits, ask to draw from your
        organization&apos;s spare credits, or both. An admin reviews your request and decides
        what to give.
      </Text>

      {attemptedNext && invalidCount > 0 && (
        <MessageBar intent="error">
          <MessageBarBody>
            {invalidCount === 1
              ? '1 environment needs credits, tenant draw, or both.'
              : `${invalidCount} environments need credits, tenant draw, or both.`}
          </MessageBarBody>
        </MessageBar>
      )}

      <Table aria-label="What you're asking for, per environment" size="small">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Display Name</TableHeaderCell>
            <TableHeaderCell>Type</TableHeaderCell>
            <TableHeaderCell>Location</TableHeaderCell>
            <TableHeaderCell className={styles.amountCol}>
              <InfoLabel
                info={
                  <>
                    Optional if you ask for tenant draw.
                    <br />
                    Enter a whole number (no decimals).
                    <br />
                    If you enter an amount, the minimum is{' '}
                    {numberFormat.format(MIN_REQUESTED_CREDITS)}.
                  </>
                }
              >
                Credits requested
              </InfoLabel>
            </TableHeaderCell>
            <TableHeaderCell className={styles.orCol} aria-hidden="true" />
            <TableHeaderCell className={styles.drawCol}>
              <span className={styles.headerLabel} ref={setDrawHeader}>
                <InfoLabel
                  info={
                    <>
                      When this environment runs out of its own credits, or has none, it uses
                      your organization&apos;s unassigned credits.
                      <br />
                      <br />
                      This works only while your organization has unassigned credits left. If
                      it&apos;s already on for this environment, the admin sees that and nothing
                      changes.
                    </>
                  }
                >
                  Tenant draw
                </InfoLabel>
              </span>
            </TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {state.selectedEnvironments.map((env) => {
            const raw = state.requestedAmounts[env.environmentId] ?? '';
            const ticked = state.requestTenantDraw[env.environmentId] === true;
            const rowError = getRowError(raw, ticked);
            const showError = rowError !== null && (attemptedNext || touched[env.environmentId]);
            const errorId = `credit-row-error-${env.environmentId}`;
            return (
              <TableRow key={env.environmentId}>
                <TableCell>{env.displayName}</TableCell>
                <TableCell>{renderMeta(env.environmentId, 'type')}</TableCell>
                <TableCell>{renderMeta(env.environmentId, 'location')}</TableCell>
                <TableCell className={styles.amountCol}>
                  <Field
                    className={styles.amountField}
                    validationState={showError ? 'error' : 'none'}
                    validationMessage={
                      showError && rowError ? { id: errorId, children: rowErrorText(rowError) } : undefined
                    }
                  >
                    <Input
                      ref={(el) => {
                        inputRefs.current[env.environmentId] = el;
                      }}
                      inputMode="numeric"
                      placeholder="e.g. 1,000"
                      aria-label={`Credits requested for ${env.displayName}`}
                      value={raw}
                      onChange={(_, d) =>
                        dispatch({
                          type: 'SET_REQUESTED_AMOUNT',
                          payload: { environmentId: env.environmentId, raw: d.value },
                        })
                      }
                      onBlur={() => markTouched(env.environmentId)}
                    />
                  </Field>
                </TableCell>
                <TableCell className={styles.orCol} aria-hidden="true">
                  or
                </TableCell>
                <TableCell className={styles.drawCol}>
                  <Checkbox
                    label="Draw from tenant"
                    aria-label={`Draw from tenant for ${env.displayName}`}
                    aria-describedby={showError && rowError === 'needsOne' ? errorId : undefined}
                    aria-invalid={showError && rowError === 'needsOne' ? true : undefined}
                    checked={ticked}
                    onChange={(_, d) => {
                      dispatch({
                        type: 'SET_TENANT_DRAW',
                        payload: { environmentId: env.environmentId, value: d.checked === true },
                      });
                      markTouched(env.environmentId);
                    }}
                  />
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className={styles.totalRow}>
            <TableCell className={styles.totalLabel}>Total</TableCell>
            <TableCell />
            <TableCell />
            <TableCell className={styles.totalLabel} aria-live="polite">
              {numberFormat.format(total)}
            </TableCell>
            <TableCell aria-hidden="true" />
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>

      <TenantDrawTip target={drawHeader} ready={!isLoading} />

      <MessageBar intent="info">
        <MessageBarBody>
          Each environment becomes its own request. You can&apos;t change it after you submit. Use
          the request&apos;s comments to discuss it with the admin.
        </MessageBarBody>
      </MessageBar>
    </div>
  );
}
