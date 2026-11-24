import { Button, Link, MessageBar, MessageBarActions, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components';
import {
  PPAC_CAPACITY_LINK,
  type AllocateBlock,
  type ApprovalBlock,
  type ApprovalWarning,
  type ReviewSnapshot,
} from '../services/creditApprovalRules';
import { DEFAULTED_RULES_TEXT, WARNING_TEXT, allocateBlockText, needsPpacLink } from './creditApproveText';

const BLOCK_TEXT: Record<ApprovalBlock, string> = {
  NotAssigneeOrNotUnderReview: 'You can approve only requests that are assigned to you and waiting for a decision.',
  OtherOpenRequest: 'Another credits request for this environment is still open. Finish or reject that one first.',
  ReadFailed: "We couldn't load this environment's credits. Try again.",
};

export function PpacLink() {
  return (
    <Link href={PPAC_CAPACITY_LINK} target="_blank" rel="noopener noreferrer">
      Open Power Platform admin center (opens in new tab)
    </Link>
  );
}

const useStyles = makeStyles({
  region: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
});

export interface CreditApproveChecksProps {
  review: ReviewSnapshot | null;
  blocks: ApprovalBlock[];
  /** Allocate blocks shown as error bars. Empty when the PAYG choice explains them instead. */
  allocateBlocks: AllocateBlock[];
  warnings: ApprovalWarning[];
  isLoading: boolean;
  onRetry(): void;
  onOpenRequest(requestId: string): void;
}

/** Live region listing only the checks that fail (FR-011..FR-013). Nothing is shown when all pass. */
export function CreditApproveChecks({
  review,
  blocks,
  allocateBlocks,
  warnings,
  isLoading,
  onRetry,
  onOpenRequest,
}: CreditApproveChecksProps) {
  const styles = useStyles();
  const otherId = review?.otherOpenRequestId;

  return (
    <div role="status" aria-live="polite" className={styles.region}>
      {blocks.map((b) => (
        <MessageBar key={b} intent="error">
          <MessageBarBody>{BLOCK_TEXT[b]}</MessageBarBody>
          {b === 'ReadFailed' && (
            <MessageBarActions>
              <Button size="small" onClick={onRetry} disabledFocusable={isLoading}>
                Retry
              </Button>
            </MessageBarActions>
          )}
          {b === 'OtherOpenRequest' && otherId && (
            <MessageBarActions>
              <Button size="small" onClick={() => onOpenRequest(otherId)}>
                Open that request
              </Button>
            </MessageBarActions>
          )}
        </MessageBar>
      ))}
      {blocks.length === 0 &&
        review &&
        allocateBlocks.map((b) => (
          <MessageBar key={b} intent="error">
            <MessageBarBody>
              {allocateBlockText(b, review)} {needsPpacLink(b) && <PpacLink />}
            </MessageBarBody>
          </MessageBar>
        ))}
      {blocks.length === 0 &&
        warnings.map((w) => (
          <MessageBar key={w} intent="warning">
            <MessageBarBody>{WARNING_TEXT[w]}</MessageBarBody>
          </MessageBar>
        ))}
      {blocks.length === 0 && review?.rulesDefaulted && (
        <MessageBar intent="info">
          <MessageBarBody>{DEFAULTED_RULES_TEXT}</MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}
