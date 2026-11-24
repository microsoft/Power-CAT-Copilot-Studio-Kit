import type { ReactNode } from 'react';
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
} from '@fluentui/react-components';

// ─────────────────────────────────────────────────────────────────────────────
// Card sections shared by the Connector and Copilot Credits summary tabs.
// ─────────────────────────────────────────────────────────────────────────────

const useSummaryCardStyles = makeStyles({
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
  justificationBlock: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    whiteSpace: 'pre-wrap',
  },
});

/** A titled Card section, matching the Connector summary layout. */
export function SummarySection({ title, children }: { title?: string; children: ReactNode }) {
  const styles = useSummaryCardStyles();
  return (
    <Card className={styles.card}>
      <div className={styles.section}>
        {title && <Text className={styles.sectionHeading} size={400}>{title}</Text>}
        {children}
      </div>
    </Card>
  );
}

/** Shows who created the request. */
export function RequestedByCard({ name, upn }: { name?: string; upn?: string }) {
  return (
    <SummarySection title="Requested by">
      <Text size={300}>{name || upn || '-'}</Text>
    </SummarySection>
  );
}

/** Shows the request justification in a shaded block. */
export function JustificationCard({ justification }: { justification?: string }) {
  const styles = useSummaryCardStyles();
  return (
    <SummarySection title="Justification">
      <div className={styles.justificationBlock}>
        <Text size={300}>{justification || '-'}</Text>
      </div>
    </SummarySection>
  );
}

/** Lists the request's co-owners. */
export function CoOwnersCard({ participants }: { participants: { id: string; participantUpn: string }[] }) {
  const styles = useSummaryCardStyles();
  return (
    <SummarySection title={`Co-owners (${participants.length})`}>
      {participants.length === 0 ? (
        <Text className={styles.metaText}>No additional co-owners.</Text>
      ) : (
        <Table aria-label="Co-owners">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>User</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.participantUpn}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SummarySection>
  );
}
