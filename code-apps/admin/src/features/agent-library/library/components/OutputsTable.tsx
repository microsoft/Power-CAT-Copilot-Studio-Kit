/**
 * OutputsTable — Displays component output parameters in a 2-column table.
 *
 * Figma: Caption 1 (12px) for cell content, regular weight headers.
 */

import {
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Body1,
  Caption1,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { OutputParam } from '../contracts/types';

interface OutputsTableProps {
  outputs: OutputParam[];
}

const useStyles = makeStyles({
  nameCell: {
    whiteSpace: 'nowrap',
    minWidth: '120px',
    color: tokens.colorNeutralForeground2,
  },
  descCell: {
    color: tokens.colorNeutralForeground2,
  },
  lastRow: {
    borderBottomWidth: '0',
    '& td': {
      borderBottomWidth: '0',
    },
  },
});

export default function OutputsTable({ outputs }: OutputsTableProps) {
  const styles = useStyles();

  if (outputs.length === 0) return null;

  return (
    <Table size="small" aria-label="Output parameters" style={{ borderBottomWidth: 0 }}>
      <TableHeader>
        <TableRow>
          <TableHeaderCell className={styles.nameCell}>
            <Body1>Name</Body1>
          </TableHeaderCell>
          <TableHeaderCell>
            <Body1>Description</Body1>
          </TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {outputs.map((output, idx) => (
          <TableRow key={output.name} className={idx === outputs.length - 1 ? styles.lastRow : undefined}>
            <TableCell className={styles.nameCell}>
              <Caption1>{output.name}</Caption1>
            </TableCell>
            <TableCell className={styles.descCell}>
              <Caption1>{output.description}</Caption1>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
