import {
  makeStyles,
  tokens,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { CheckmarkRegular } from '@fluentui/react-icons';
import {
  SummarySection,
  RequestedByCard,
  JustificationCard,
} from '../../../shared/components/SummaryCards';
import type { CreditRequestDetail } from '../../../models/creditRequest';

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
  metaText: {
    color: tokens.colorNeutralForeground3,
  },
  amountCol: {
    width: '160px',
  },
  approvedNote: {
    display: 'block',
    color: tokens.colorNeutralForeground3,
  },
  yes: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorPaletteGreenForeground1,
  },
});

function formatCredits(amount: number | undefined): string {
  return amount !== undefined ? amount.toLocaleString() : '-';
}

interface CreditSummaryTabProps {
  detail: CreditRequestDetail;
}

/**
 * Summary cards for a credit request. The environment table adds Credits approved
 * only once an amount is approved. There's no per-row status: a request has one
 * environment, so the header badge already says where it stands.
 */
export function CreditSummaryTab({ detail }: CreditSummaryTabProps) {
  const styles = useStyles();
  const envs = detail.environments;
  const showApproved = envs.some((e) => e.approvedAmount !== undefined);

  return (
    <>
      <RequestedByCard name={detail.createdByName} upn={detail.createdByUpn} />

      <SummarySection>
        {envs.length === 0 ? (
          <Text className={styles.metaText}>No environments captured.</Text>
        ) : (
          <Table aria-label="Environment and what was requested" size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Environment</TableHeaderCell>
                <TableHeaderCell className={styles.amountCol}>Credits requested</TableHeaderCell>
                <TableHeaderCell className={styles.amountCol}>Tenant draw</TableHeaderCell>
                {showApproved && (
                  <TableHeaderCell className={styles.amountCol}>Credits approved</TableHeaderCell>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {envs.map((env) => (
                <TableRow key={env.id}>
                  <TableCell>{env.environmentName || env.environmentGuid}</TableCell>
                  <TableCell className={styles.amountCol}>{formatCredits(env.requestedAmount)}</TableCell>
                  <TableCell className={styles.amountCol}>
                    {env.requestTenantDraw ? (
                      <span className={styles.yes}>
                        <CheckmarkRegular aria-hidden="true" />
                        Requested
                      </span>
                    ) : (
                      <Text className={styles.metaText}>
                        <span aria-hidden="true">-</span>
                        <span className={styles.visuallyHidden}>Not requested</span>
                      </Text>
                    )}
                  </TableCell>
                  {showApproved && (
                    <TableCell className={styles.amountCol}>
                      {formatCredits(env.approvedAmount)}
                      {env.approvedAmount !== undefined &&
                        env.requestedAmount !== undefined &&
                        env.approvedAmount < env.requestedAmount && (
                          <Text size={200} className={styles.approvedNote}>
                            Less than you asked for. See the comments.
                          </Text>
                        )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SummarySection>

      <JustificationCard justification={detail.justification} />
    </>
  );
}
