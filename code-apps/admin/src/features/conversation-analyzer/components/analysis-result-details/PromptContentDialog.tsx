import {
  Body1,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Spinner,
} from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { ConversationAnalyzerPromptService } from '../../services/ConversationAnalyzerPromptService';

interface PromptContentDialogProps {
  promptId?: string;
  promptName: string;
  open: boolean;
  onClose: () => void;
}

/** Shows the full text of the custom prompt used for a result; fetched only when opened (RD-1). */
export function PromptContentDialog({ promptId, promptName, open, onClose }: PromptContentDialogProps) {
  const promptQuery = useQuery({
    queryKey: ['conversation-analyzer', 'prompt-detail', promptId],
    queryFn: () => ConversationAnalyzerPromptService.getById(promptId ?? ''),
    enabled: Boolean(promptId) && open,
    staleTime: Infinity,
  });

  return (
    <Dialog open={open} onOpenChange={(_e, data) => { if (!data.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{promptQuery.data?.displayName ?? promptName}</DialogTitle>
          <DialogContent>
            {promptQuery.isLoading ? (
              <Spinner size="small" label="Loading prompt…" />
            ) : (
              <Body1 style={{ whiteSpace: 'pre-wrap' }}>
                {promptQuery.data?.userPrompt ?? 'No prompt content available.'}
              </Body1>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Close</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
