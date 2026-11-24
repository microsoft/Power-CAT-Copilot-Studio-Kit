import {
  Divider,
  Field,
  Input,
  Radio,
  RadioGroup,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  validateAmount,
  type AllocateBlock,
  type ApprovalBlock,
  type ApprovalWarning,
  type ReviewSnapshot,
} from '../services/creditApprovalRules';
import { CreditApproveChecks, PpacLink } from './CreditApproveChecks';
import { CreditApproveDrawBlock, type CreditApproveDrawBlockProps } from './CreditApproveDrawBlock';
import { CreditStat } from './CreditStat';
import { allocateBlockText, needsPpacLink, spareCapHint, type ApprovalChoice } from './creditApproveText';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  stats: { display: 'flex', gap: tokens.spacingHorizontalXXL },
  hint: { color: tokens.colorNeutralForeground3, paddingLeft: tokens.spacingHorizontalXXXL },
  preview: { color: tokens.colorNeutralForeground2 },
});

interface PaygChoiceProps {
  review: ReviewSnapshot;
  allocateBlocks: AllocateBlock[];
  choice: ApprovalChoice;
  onChoiceChange(choice: ApprovalChoice): void;
}

/** FR-008: PAYG is active, so the admin may approve without allocating. Allocate blocks disable only that option. */
function PaygChoice({ review, allocateBlocks, choice, onChoiceChange }: PaygChoiceProps) {
  const styles = useStyles();
  const policy = review.paygPolicyName
    ? `the billing policy "${review.paygPolicyName}"`
    : 'the linked pay-as-you-go billing policy';
  const allocateDisabled = allocateBlocks.length > 0;
  return (
    <Field label="How do you want to approve?">
      <RadioGroup value={choice} onChange={(_, d) => onChoiceChange(d.value as ApprovalChoice)}>
        <Radio value="skip" label="Approve without adding credits" input={{ 'aria-describedby': 'credit-skip-hint' }} />
        <Text id="credit-skip-hint" size={200} className={styles.hint}>
          Credits stay as they are. This environment uses its own credits first. Extra use is billed through{' '}
          {policy}.
        </Text>
        <Radio
          value="allocate"
          label="Add credits to this environment"
          disabled={allocateDisabled}
          input={allocateDisabled ? { 'aria-describedby': 'credit-allocate-hint' } : undefined}
        />
        {allocateDisabled && (
          <Text id="credit-allocate-hint" size={200} className={styles.hint}>
            {allocateBlocks.map((b) => allocateBlockText(b, review)).join(' ')}{' '}
            {allocateBlocks.some(needsPpacLink) && <PpacLink />}
          </Text>
        )}
      </RadioGroup>
    </Field>
  );
}

export interface CreditApproveReviewStepProps {
  review: ReviewSnapshot | null;
  blocks: ApprovalBlock[];
  allocateBlocks: AllocateBlock[];
  warnings: ApprovalWarning[];
  isLoading: boolean;
  /** Spec 032: false for a draw-only request, which hides the credits parts. */
  wantsCredits: boolean;
  /** Spec 032: the tenant draw block, shown when the maker asked for it. */
  draw?: CreditApproveDrawBlockProps;
  choice: ApprovalChoice;
  onChoiceChange(choice: ApprovalChoice): void;
  amount: string;
  onAmountChange(value: string): void;
  onRetry(): void;
  onOpenRequest(requestId: string): void;
}

/** Review step: stats, failing checks only, the PAYG choice, the amount field and the tenant draw block (FR-005..FR-008). */
export function CreditApproveReviewStep({
  review,
  blocks,
  allocateBlocks,
  warnings,
  isLoading,
  wantsCredits,
  draw,
  choice,
  onChoiceChange,
  amount,
  onAmountChange,
  onRetry,
  onOpenRequest,
}: CreditApproveReviewStepProps) {
  const styles = useStyles();

  const firstLoad = isLoading && !review;
  const paygActive = review?.payg === 'active';
  const canChoose = !!review && blocks.length === 0;
  const check = review && amount !== '' ? validateAmount(amount, review.current, review.available) : undefined;
  const showAmount = wantsCredits && canChoose && choice === 'allocate' && allocateBlocks.length === 0;

  return (
    <div className={styles.root}>
      {firstLoad && <Spinner label="Checking this environment's credits…" />}
      {review && (
        <div className={styles.stats}>
          <CreditStat
            label="Maker asked for"
            value={review.requested}
            tip="Copilot Credits the maker asked for in this request."
            emptyText={wantsCredits ? undefined : '-'}
          />
          <CreditStat label="This environment has" value={review.current} tip="Copilot Credits set aside for this environment now." />
          <CreditStat
            label="Spare in your tenant"
            value={review.available}
            tip="Copilot Credits your tenant owns that aren't set aside for any environment yet."
          />
        </div>
      )}

      <CreditApproveChecks
        review={review}
        blocks={blocks}
        allocateBlocks={paygActive || !wantsCredits ? [] : allocateBlocks}
        warnings={warnings}
        isLoading={isLoading}
        onRetry={onRetry}
        onOpenRequest={onOpenRequest}
      />

      {wantsCredits && canChoose && paygActive && review && (
        <PaygChoice review={review} allocateBlocks={allocateBlocks} choice={choice} onChoiceChange={onChoiceChange} />
      )}

      {showAmount && (
        <Field
          label="Credits to add"
          required
          hint={review?.requested !== undefined ? spareCapHint(review.requested, review.available) : undefined}
          validationState={check && !check.ok ? 'error' : 'none'}
          validationMessage={check && !check.ok ? check.message : undefined}
        >
          <Input inputMode="numeric" value={amount} onChange={(_, d) => onAmountChange(d.value)} placeholder="e.g. 500" />
        </Field>
      )}
      {showAmount && check?.ok && (
        <Text className={styles.preview}>New total: {check.newTotal.toLocaleString()} credits</Text>
      )}
      {canChoose && draw && (
        <>
          {wantsCredits && <Divider />}
          <CreditApproveDrawBlock {...draw} />
        </>
      )}
    </div>
  );
}
