import {
  makeStyles,
  tokens,
  Text,
  Badge,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from '@fluentui/react-components';
import type { RequestEnvironment } from '../../../models/requestEnvironment';
import type { FulfillmentStatus } from '../../../models/status';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground2,
  },
});

function getFulfillmentBadgeColor(
  status: FulfillmentStatus,
): 'success' | 'warning' | 'danger' | 'informative' {
  switch (status) {
    case 'Succeeded': return 'success';
    case 'Failed': return 'danger';
    case 'Skipped': return 'warning';
    default: return 'informative';
  }
}

interface FulfillmentTableProps {
  environments: RequestEnvironment[];
}

export function FulfillmentTable({ environments }: FulfillmentTableProps) {
  const styles = useStyles();

  if (environments.length === 0) return null;

  return (
    <div className={styles.root}>
      <Text weight="semibold">Fulfillment Status</Text>
      <Table aria-label="Fulfillment status">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Environment</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Error</TableHeaderCell>
            <TableHeaderCell>Fulfilled On</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {environments.map((env) => (
            <TableRow key={env.id}>
              <TableCell>{env.environmentName || env.environmentGuid}</TableCell>
              <TableCell>
                <Badge
                  appearance="filled"
                  color={getFulfillmentBadgeColor(env.fulfillmentStatus)}
                >
                  {env.fulfillmentStatus}
                </Badge>
              </TableCell>
              <TableCell>
                {env.fulfillmentError ? (
                  <Text className={styles.errorText}>{env.fulfillmentError}</Text>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell>
                {env.fulfilledOn
                  ? new Date(env.fulfilledOn).toLocaleDateString()
                  : '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
