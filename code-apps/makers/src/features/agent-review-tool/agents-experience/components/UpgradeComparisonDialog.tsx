import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Badge, Body1, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle,
  Field, Link, MessageBar, MessageBarBody, Radio, RadioGroup, Spinner, Subtitle2,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, makeStyles, tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import { STALE_TIMES } from '../../contracts/Constants';
import type { BotMetadata } from '../../contracts/ReviewResult';
import { queryKeys } from '../../hooks/queryKeys';
import { useAllBots } from '../../hooks/useAllBots';
import { formatDate } from '../../utils/dateUtils';
import {
  compareUpgradePair,
  type UpgradeComparison,
  type UpgradeCopyKind,
  type UpgradeInstructionsState,
  type UpgradeItemComparison,
} from '../../utils/upgradeComparison';
import { findOriginalAgents, type OriginalAgentMatch } from '../../utils/upgradePairing';
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel';
import { loadOriginalStageA, type OriginalStageAResult } from '../services/upgradeOriginalReview';

export interface UpgradeComparisonDialogProps {
  /**
   * The name of the upgraded copy, for example "Expense helper (Upgraded)".
   * The name before "(Upgraded)" can be shorter than the original name, for example "Expense (Upgraded)".
   */
  copyName: string;
  /** The Copilot review model of the copy. */
  copy: AgentsExperienceModel;
  /** The source environment of the copy review. The dialog reads the agents and the reviews of this environment. */
  sourceEnvironment: string;
  onClose: () => void;
}

const UPGRADE_LEARN_URL = 'https://learn.microsoft.com/microsoft-copilot-studio/upgrade-to-microsoft-copilot-from-standard-harness';
const UPGRADE_LEARN_TITLE = 'Upgrade to the Microsoft Copilot harness (preview)';
/** Word for word from Microsoft Learn. Do not edit. */
const UPGRADE_LEARN_QUOTE = 'The upgrade creates a copy of the agent onto the Microsoft Copilot harness. The upgrade carries over instructions, tools, and suggested prompts. Your custom topics can be rebuilt as skills of workflows. You get a report of what was migrated, what requires attention, and what was skipped. The upgrade consumes credits.';
/** The Advanced Testing page of the Copilot Studio Kit shows the test sets. */
const TEST_SETS_PATH = '/advanced-testing';
const EMPTY_CELL = '--';
/** The upgrade can rename a topic, so a name match can fail. */
const TOPIC_RENAME_HINT = 'The upgrade can give a new name to a skill or a workflow. Compare each item that is "Missing in copy" with the items that are "New in copy".';

const COPY_KIND_LABELS: Record<UpgradeCopyKind, string> = { tool: 'Tool', workflow: 'Workflow', skill: 'Skill' };

const STATE_BADGES: Record<UpgradeInstructionsState, { label: string; color: 'success' | 'warning' | 'danger' | 'informative' }> = {
  same: { label: 'Same', color: 'success' },
  changed: { label: 'Changed', color: 'warning' },
  'missing-in-copy': { label: 'Missing in copy', color: 'danger' },
  'new-in-copy': { label: 'New in copy', color: 'informative' },
};

const useStyles = makeStyles({
  surface: { width: '760px', maxWidth: `calc(100vw - 2 * ${tokens.spacingHorizontalL})` },
  content: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL,
    minWidth: 0, overflowWrap: 'anywhere',
  },
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, minWidth: 0 },
  row: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  text: { margin: 0 },
  quote: {
    margin: 0,
    paddingLeft: tokens.spacingHorizontalM,
    borderLeft: `3px solid ${tokens.colorNeutralStroke1}`,
  },
});

/** 1 candidate: use it. 2 or more candidates: use the selection of the maker when it is a candidate. */
function resolveOriginalId(candidates: BotMetadata[], selectedId: string | undefined): string | undefined {
  if (candidates.length === 1) return candidates[0].botId;
  return candidates.some((candidate) => candidate.botId === selectedId) ? selectedId : undefined;
}

function characterCount(count: number): string {
  return count === 1 ? '1 character' : `${count} characters`;
}

function copyCell(row: UpgradeItemComparison): string {
  if (!row.copy) return EMPTY_CELL;
  return row.copyKind ? `${row.copy} (${COPY_KIND_LABELS[row.copyKind]})` : row.copy;
}

function Notice({ intent, children }: { intent: 'error' | 'warning'; children: string }) {
  return (
    <MessageBar intent={intent}>
      <MessageBarBody>{children}</MessageBarBody>
    </MessageBar>
  );
}

function StateBadge({ state }: { state: UpgradeInstructionsState }) {
  const badge = STATE_BADGES[state];
  return <Badge appearance="tint" color={badge.color}>{badge.label}</Badge>;
}

function ComparisonTable({ label, rows }: { label: string; rows: UpgradeItemComparison[] }) {
  return (
    <Table size="small" aria-label={label}>
      <TableHeader>
        <TableRow>
          <TableHeaderCell>Original</TableHeaderCell>
          <TableHeaderCell>Copy</TableHeaderCell>
          <TableHeaderCell>Result</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={`${index}-${row.original ?? ''}-${row.copy ?? ''}`}>
            <TableCell>{row.original ?? EMPTY_CELL}</TableCell>
            <TableCell>{copyCell(row)}</TableCell>
            <TableCell><StateBadge state={row.state} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface ItemSectionProps {
  title: string;
  rows: UpgradeItemComparison[];
  emptyText: string;
  /** Shows above the table when the section has rows. */
  note?: string;
  /** Shows below the table when the section has rows. */
  hint?: string;
  /** Shows below the table or the empty text. */
  footer?: string;
}

function ItemSection({ title, rows, emptyText, note, hint, footer }: ItemSectionProps) {
  const styles = useStyles();
  return (
    <section className={styles.section}>
      <Subtitle2 as="h3">{title}</Subtitle2>
      {rows.length > 0 && note && <Body1 as="p" className={styles.text}>{note}</Body1>}
      {rows.length > 0
        ? <ComparisonTable label={title} rows={rows} />
        : <Body1 as="p" className={styles.text}>{emptyText}</Body1>}
      {rows.length > 0 && hint && <Body1 as="p" className={styles.text}>{hint}</Body1>}
      {footer && <Body1 as="p" className={styles.text}>{footer}</Body1>}
    </section>
  );
}

function ComparisonView({ comparison }: { comparison: UpgradeComparison }) {
  const styles = useStyles();
  const { instructions } = comparison;
  return (
    <>
      <section className={styles.section}>
        <Subtitle2 as="h3">Instructions</Subtitle2>
        {instructions.originalLength === 0 && instructions.copyLength === 0 ? (
          <Body1 as="p" className={styles.text}>The two agents have no instructions.</Body1>
        ) : (
          <div className={styles.row}>
            <StateBadge state={instructions.state} />
            <Body1>{`The original has ${characterCount(instructions.originalLength)} and the copy has ${characterCount(instructions.copyLength)}.`}</Body1>
          </div>
        )}
      </section>
      <ItemSection title="Tools" rows={comparison.tools} emptyText="The two agents have no tools." />
      <ItemSection
        title="Knowledge sources"
        rows={comparison.knowledge}
        emptyText="The two agents have no knowledge sources."
        note="The upgrade does not migrate knowledge sources."
      />
      <ItemSection
        title="Topics, skills, and workflows"
        rows={comparison.topics}
        emptyText="The two agents have no custom topics, skills, or workflows."
        hint={TOPIC_RENAME_HINT}
        footer={comparison.systemTopics.length > 0
          ? `System topics that are not compared: ${comparison.systemTopics.join(', ')}.`
          : undefined}
      />
    </>
  );
}

interface OriginalAgentPickerProps {
  candidates: BotMetadata[];
  match: OriginalAgentMatch['match'];
  selectedId: string | undefined;
  onSelect: (botId: string) => void;
}

function OriginalAgentPicker({ candidates, match, selectedId, onSelect }: OriginalAgentPickerProps) {
  const styles = useStyles();
  if (candidates.length === 0) {
    return <Notice intent="warning">No original agent found. The copy or the original possibly has a new name.</Notice>;
  }
  if (candidates.length === 1) {
    const note = match === 'prefix' ? ' The copy has a shorter name. Make sure that this is the correct agent.' : '';
    return <Body1 as="p" className={styles.text}>{`Original agent: ${candidates[0].name.trim()}.${note}`}</Body1>;
  }
  const hint = match === 'prefix'
    ? 'The names of these standard agents start with the name of the copy.'
    : 'Two or more standard agents have this name.';
  return (
    <Field label="Select the original agent" hint={hint}>
      <RadioGroup value={selectedId ?? ''} onChange={(_, data) => onSelect(data.value)}>
        {candidates.map((candidate) => (
          <Radio
            key={candidate.botId}
            value={candidate.botId}
            label={`${candidate.name.trim()} (last modified ${formatDate(candidate.modifiedOn)})`}
          />
        ))}
      </RadioGroup>
    </Field>
  );
}

interface OriginalReviewStateProps {
  result: OriginalStageAResult | undefined;
  isError: boolean;
  copy: AgentsExperienceModel;
}

function OriginalReviewState({ result, isError, copy }: OriginalReviewStateProps) {
  const styles = useStyles();
  if (result?.status === 'found') {
    return (
      <>
        <Body1 as="p" className={styles.text}>{`The comparison uses the saved review of ${formatDate(result.reviewedOn)}.`}</Body1>
        <ComparisonView comparison={compareUpgradePair(result.stageA, copy)} />
      </>
    );
  }
  if (result?.status === 'not-reviewed') {
    return <Notice intent="warning">The original agent has no saved standard review. Review the original agent first.</Notice>;
  }
  if (isError) return <Notice intent="error">The saved review of the original agent could not be loaded.</Notice>;
  return <Spinner size="tiny" label="Loading the saved review of the original agent..." />;
}

/**
 * Compare an upgraded copy with the newest saved standard review of its original agent.
 * The dialog reads only and starts no review. Mount it only when the maker opens it.
 */
export function UpgradeComparisonDialog({ copyName, copy, sourceEnvironment, onClose }: UpgradeComparisonDialogProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const agents = useAllBots(sourceEnvironment || null);
  const [selectedId, setSelectedId] = useState<string>();
  const { candidates, match } = findOriginalAgents(copyName, agents.data ?? []);
  const originalId = resolveOriginalId(candidates, selectedId);
  const review = useQuery({
    queryKey: [...queryKeys.all, 'upgrade-original-review', sourceEnvironment, originalId ?? ''],
    queryFn: () => loadOriginalStageA(originalId ?? '', sourceEnvironment),
    enabled: Boolean(originalId),
    staleTime: STALE_TIMES.REVIEWS,
  });

  return (
    <Dialog open onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" aria-label="Close the comparison" icon={<Dismiss24Regular />} onClick={onClose} />}>
            Compare with original
          </DialogTitle>
          <DialogContent>
            <div className={styles.content}>
              <Body1 as="p" className={styles.text}>{`Copy: ${copyName.trim()}.`}</Body1>
              <Body1 as="p" className={styles.text}>This comparison uses only saved data. It does not start a review.</Body1>
              {agents.data ? (
                <OriginalAgentPicker candidates={candidates} match={match} selectedId={selectedId} onSelect={setSelectedId} />
              ) : agents.isError ? (
                <Notice intent="error">The agent list could not be loaded.</Notice>
              ) : (
                <Spinner size="tiny" label="Loading the agent list..." />
              )}
              {originalId && <OriginalReviewState result={review.data} isError={review.isError} copy={copy} />}
              <section className={styles.section}>
                <Subtitle2 as="h3">Test the copy</Subtitle2>
                <Body1 as="p" className={styles.text}>Use the test sets of the original agent to test the copy.</Body1>
                <Body1 as="p" className={styles.text}>
                  <Link onClick={() => { onClose(); navigate(TEST_SETS_PATH); }}>Open Test sets in the Copilot Studio Kit</Link>
                </Body1>
              </section>
              <section className={styles.section}>
                <Subtitle2 as="h3">About the upgrade</Subtitle2>
                <blockquote cite={UPGRADE_LEARN_URL} className={styles.quote}>
                  <Body1 as="p" className={styles.text}>{UPGRADE_LEARN_QUOTE}</Body1>
                </blockquote>
                <Body1 as="p" className={styles.text}>
                  Source:{' '}
                  <Link
                    href={UPGRADE_LEARN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${UPGRADE_LEARN_TITLE}, opens in a new tab`}
                  >
                    {UPGRADE_LEARN_TITLE}
                  </Link>
                </Body1>
              </section>
            </div>
          </DialogContent>
          <DialogActions><Button appearance="primary" onClick={onClose}>Close</Button></DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
