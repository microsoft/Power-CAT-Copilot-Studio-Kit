/**
 * VariablesTable — Displays component input parameters in a 2-column table.
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
import type { InputParam } from '../contracts/types';

interface VariablesTableProps {
  inputs: InputParam[];
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

export default function VariablesTable({ inputs }: VariablesTableProps) {
  const styles = useStyles();

  if (inputs.length === 0) return null;

  return (
    <Table size="small" aria-label="Input variables" style={{ borderBottomWidth: 0 }}>
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
        {inputs.map((input, idx) => (
          <TableRow key={input.name} className={idx === inputs.length - 1 ? styles.lastRow : undefined}>
            <TableCell className={styles.nameCell}>
              <Caption1>{input.name}</Caption1>
            </TableCell>
            <TableCell className={styles.descCell}>
              <Caption1>
                {input.isRequired ? `(Required) ${input.description}` : input.description}
              </Caption1>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
