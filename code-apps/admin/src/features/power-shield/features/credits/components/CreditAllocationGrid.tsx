import {
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import {
  CREDIT_CHILD_STATE_LABELS,
  CREDIT_CHILD_STATE_TO_COLOR_KEY,
} from '../../../models/status';
import type { CreditEnvironmentView } from '../../../models/creditRequest';

// ─────────────────────────────────────────────────────────────────────────────
// Live per-environment allocation grid (FR-024, data-model.md §4).
//
// Shows only what an admin needs per environment: credits actually added, the
// confirmed new total, and the status. Amounts appear only once Power Platform
// confirmed them (or the environment was skipped unchanged); anything else shows
// an em dash — NEVER 0 or the planned amount — so an unfinished allocation can
// never be read as complete. Internal IDs live in the failure details panel.
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  table: { width: '100%' },
  headerCell: { fontWeight: tokens.fontWeightSemibold },
  num: { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  muted: { color: tokens.colorNeutralForeground3 },
  envCell: { whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '180px' },
});

const DASH = '\u2014';

/** Formats a whole-number amount; an undefined (hidden/unwritten) value shows a dash, never 0. */
function fmtAmount(value: number | undefined): string {
  return value === undefined ? DASH : value.toLocaleString();
}

/** The verified total exists only once Power Platform confirmed it (Succeeded) or the env was skipped unchanged. */
function hasVerifiedTotal(env: CreditEnvironmentView): boolean {
  return env.creditChildState === 'Succeeded' || env.creditChildState === 'Skipped';
}

/**
 * Credits actually added: confirmed total minus the starting total. Skipped adds 0.
 * Any other state has no confirmed result, so it shows a dash rather than the planned amount.
 */
function fmtAdded(env: CreditEnvironmentView): string {
  if (env.creditChildState === 'Skipped') return '0';
  if (env.creditChildState !== 'Succeeded') return DASH;
  if (env.lastVerifiedAllocation === undefined || env.observedAllocation === undefined) return DASH;
  const added = env.lastVerifiedAllocation - env.observedAllocation;
  return added > 0 ? `+${added.toLocaleString()}` : added.toLocaleString();
}

function fmtNewTotal(env: CreditEnvironmentView): string {
  return hasVerifiedTotal(env) ? fmtAmount(env.lastVerifiedAllocation) : DASH;
}

interface CreditAllocationGridProps {
  environments: CreditEnvironmentView[];
}

export function CreditAllocationGrid({ environments }: CreditAllocationGridProps) {
  const styles = useStyles();

  if (environments.length === 0) {
    return <Text className={styles.muted}>No environments on this request.</Text>;
  }

  return (
    <Table className={styles.table} size="small" aria-label="Credits by environment">
      <TableHeader>
        <TableRow>
          <TableHeaderCell className={styles.headerCell}>Environment</TableHeaderCell>
          <TableHeaderCell className={styles.headerCell}>Credits added</TableHeaderCell>
          <TableHeaderCell className={styles.headerCell}>New total</TableHeaderCell>
          <TableHeaderCell className={styles.headerCell}>Status</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {environments.map((env) => (
          <TableRow key={env.id}>
            <TableCell className={styles.envCell}>{env.environmentName || env.environmentGuid || DASH}</TableCell>
            <TableCell className={styles.num}>{fmtAdded(env)}</TableCell>
            <TableCell className={styles.num}>{fmtNewTotal(env)}</TableCell>
            <TableCell>
              {env.creditChildState ? (
                <StatusBadge
                  label={CREDIT_CHILD_STATE_LABELS[env.creditChildState]}
                  colorKey={CREDIT_CHILD_STATE_TO_COLOR_KEY[env.creditChildState]}
                />
              ) : (
                <Text className={styles.muted}>{DASH}</Text>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default CreditAllocationGrid;
