import {
  Card,
  CardHeader,
  Field,
  Link,
  Spinner,
  Subtitle2,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useNavigate } from 'react-router-dom';
import type { PromptRow } from '../../contracts/types';
import { PromptDropdown } from '../shared/PromptDropdown';
import { PromptPreview } from '../shared/PromptPreview';
import { RetryMessageBar } from '../shared/RetryMessageBar';
import { SelectionLimitMeter } from '../shared/SelectionLimitMeter';

const useStyles = makeStyles({
  body: { display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(260px, 1fr)', gap: tokens.spacingHorizontalXXL },
  column: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, minWidth: 0 },
  promptRow: { display: 'flex', alignItems: 'flex-end', gap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
  field: { flex: '1 1 260px' },
  link: { paddingBottom: tokens.spacingVerticalSNudge },
});

interface AnalysisSetupCardProps {
  prompts: PromptRow[];
  promptId: string;
  onSelectPrompt: (id: string) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedCount: number;
  disabled?: boolean;
}

/** Prompt choice, preview and selection meter for a single-agent analysis (NA-1, NA-2). */
export function AnalysisSetupCard({
  prompts,
  promptId,
  onSelectPrompt,
  isLoading,
  isError,
  onRetry,
  selectedCount,
  disabled,
}: AnalysisSetupCardProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const prompt = prompts.find((p) => p.id === promptId);

  return (
    <Card>
      <CardHeader header={<Subtitle2 as="h2">Analysis setup</Subtitle2>} />
      <div className={styles.body}>
        <div className={styles.column}>
          {isError ? (
            <RetryMessageBar title="Unable to load prompts." onRetry={onRetry} />
          ) : (
            <div className={styles.promptRow}>
              <Field label="Prompt" required className={styles.field}>
                {isLoading ? (
                  <Spinner size="tiny" label="Loading prompts…" labelPosition="after" />
                ) : (
                  <PromptDropdown
                    prompts={prompts}
                    selectedPromptId={promptId}
                    onSelectPrompt={onSelectPrompt}
                    placeholder="Select a prompt"
                    disabled={disabled}
                  />
                )}
              </Field>
              <Link className={styles.link} onClick={() => navigate('/conversation-analyzer/prompts')}>Manage prompts</Link>
            </div>
          )}
          {prompt && <PromptPreview prompt={prompt} maxLines={2} />}
        </div>
        <div className={styles.column}>
          <Text weight="semibold">Selected conversations</Text>
          <SelectionLimitMeter count={selectedCount} />
        </div>
      </div>
    </Card>
  );
}
