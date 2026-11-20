import { useMemo, useState } from 'react';
import {
  Body1,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Play16Regular } from '@fluentui/react-icons';
import type { ConversationTranscriptRow, PromptRow } from '../../contracts/types';
import { MAX_CONVERSATIONS_PER_ANALYSIS } from '../../contracts/constants';
import { usePromptsList } from '../../hooks/usePromptsList';
import { toGuid } from '../../utils/conversationBrowserQuery';
import { PromptDropdown } from '../shared/PromptDropdown';
import { PromptPreview } from '../shared/PromptPreview';
import { RetryMessageBar } from '../shared/RetryMessageBar';

const useStyles = makeStyles({
  content: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  muted: { color: tokens.colorNeutralForeground3 },
});

interface AnalyzeConversationsDialogProps<T extends ConversationTranscriptRow> {
  open: boolean;
  rows: readonly T[];
  environmentName: string;
  isRunning: boolean;
  /** True when the conversation already has a result for the prompt (CV-18). */
  hasResult: (row: T, promptId: string) => boolean;
  onStart: (prompt: PromptRow, rows: T[]) => void;
  onClose: () => void;
}

/** Prompt choice, preview and duplicate handling for analyzing the selected conversations (CV-15…CV-20). */
export function AnalyzeConversationsDialog<T extends ConversationTranscriptRow>({
  open,
  rows,
  environmentName,
  isRunning,
  hasResult,
  onStart,
  onClose,
}: AnalyzeConversationsDialogProps<T>) {
  const styles = useStyles();
  const promptsQuery = usePromptsList();
  const prompts = useMemo(() => (promptsQuery.data ?? []).filter((p) => p.state === 0), [promptsQuery.data]);
  const [promptId, setPromptId] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const prompt = prompts.find((p) => p.id === promptId);

  const agentNames = useMemo(() => [...new Set(rows.map((r) => r.agentName ?? r.agentId ?? ''))].filter(Boolean), [rows]);
  const duplicates = useMemo(() => (prompt ? rows.filter((row) => hasResult(row, prompt.id)) : []), [hasResult, prompt, rows]);
  const toRun = skipDuplicates && duplicates.length > 0 ? rows.filter((row) => !duplicates.includes(row)) : [...rows];
  const overLimit = rows.length > MAX_CONVERSATIONS_PER_ANALYSIS;
  const invalid = rows.some((row) => !toGuid(row.id) || !row.agentId || !toGuid(row.agentId));
  const canStart = !isRunning && Boolean(prompt) && toRun.length > 0 && !overLimit && !invalid;

  const agentText = agentNames.length === 1 ? agentNames[0] : `${agentNames.length} agents`;

  return (
    <Dialog open={open} onOpenChange={(_e, data) => { if (!data.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Analyze conversations</DialogTitle>
          <DialogContent className={styles.content}>
            <Body1>
              <strong>{rows.length.toLocaleString()}</strong> {rows.length === 1 ? 'conversation' : 'conversations'} from{' '}
              <strong>{agentText}</strong> in <strong>{environmentName}</strong>
            </Body1>
            {overLimit && (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>Too many conversations selected.</MessageBarTitle>
                  You can process a maximum of {MAX_CONVERSATIONS_PER_ANALYSIS} conversations at a time.
                </MessageBarBody>
              </MessageBar>
            )}
            {invalid && (
              <MessageBar intent="warning">
                <MessageBarBody>Some selected conversations have no valid agent. Deselect them or refresh the list.</MessageBarBody>
              </MessageBar>
            )}
            {promptsQuery.isError ? (
              <RetryMessageBar title="Unable to load prompts." onRetry={() => void promptsQuery.refetch()} />
            ) : (
              <Field label="Prompt" required>
                {promptsQuery.isPending ? (
                  <Spinner size="tiny" label="Loading prompts…" labelPosition="after" />
                ) : (
                  <PromptDropdown
                    prompts={prompts}
                    selectedPromptId={promptId}
                    onSelectPrompt={setPromptId}
                    placeholder="Select a prompt"
                    disabled={isRunning}
                  />
                )}
              </Field>
            )}
            {prompt && <PromptPreview prompt={prompt} maxLines={4} />}
            {prompt && duplicates.length > 0 && (
              <Field hint="They already have a result for this prompt — re-running uses credits again.">
                <Checkbox
                  checked={skipDuplicates}
                  onChange={(_e, data) => setSkipDuplicates(Boolean(data.checked))}
                  label={`Skip ${duplicates.length.toLocaleString()} ${duplicates.length === 1 ? 'conversation' : 'conversations'} already analyzed with this prompt`}
                />
              </Field>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              icon={<Play16Regular />}
              disabled={!canStart}
              onClick={() => { if (canStart && prompt) onStart(prompt, toRun); }}
            >
              Start analysis
            </Button>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
