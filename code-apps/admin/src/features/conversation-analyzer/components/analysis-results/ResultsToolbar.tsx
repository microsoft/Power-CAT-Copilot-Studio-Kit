import { Button, Tag, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowDownload20Regular, Delete20Regular } from '@fluentui/react-icons';
import type { PromptRow } from '../../contracts/types';
import { PromptDropdown } from '../shared/PromptDropdown';

const useStyles = makeStyles({
  root: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
  dropdown: { minWidth: '240px' },
  spacer: { flexGrow: 1 },
});

interface ResultsToolbarProps {
  prompts: readonly PromptRow[];
  promptId: string;
  onSelectPrompt: (promptId: string) => void;
  flagLabel?: string;
  onClearFlag?: () => void;
  selectedCount: number;
  isDeleting: boolean;
  onDelete: () => void;
  canExport: boolean;
  onExport: () => void;
}

/** Prompt filter, active flag filter, Delete and Export CSV for the results grid (AR-3, AR-4). */
export function ResultsToolbar({
  prompts,
  promptId,
  onSelectPrompt,
  flagLabel,
  onClearFlag,
  selectedCount,
  isDeleting,
  onDelete,
  canExport,
  onExport,
}: ResultsToolbarProps) {
  const styles = useStyles();
  return (
    <div className={styles.root} role="toolbar" aria-label="Results actions">
      <PromptDropdown
        className={styles.dropdown}
        prompts={prompts}
        selectedPromptId={promptId}
        onSelectPrompt={onSelectPrompt}
        allOptionLabel="All prompts"
      />
      {flagLabel && onClearFlag && (
        <Tag
          dismissible
          appearance="brand"
          dismissIcon={{ 'aria-label': `Remove filter ${flagLabel} only` }}
          onClick={onClearFlag}
        >
          {flagLabel} only
        </Tag>
      )}
      <span className={styles.spacer} />
      <Button
        icon={<Delete20Regular />}
        disabled={selectedCount === 0 || isDeleting}
        onClick={onDelete}
      >
        {isDeleting ? 'Deleting…' : `Delete${selectedCount > 0 ? ` (${selectedCount.toLocaleString()})` : ''}`}
      </Button>
      <Button icon={<ArrowDownload20Regular />} disabled={!canExport} onClick={onExport}>
        Export CSV
      </Button>
    </div>
  );
}
