/**
 * Manage prompts (MP-1…MP-8). Drawer state lives in the URL so screens can deep
 * link: `?view=<id>`, `?edit=<id>`, `?create=1`.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Button, SearchBox, Title2,
  Toast, ToastTitle, Toaster, makeStyles, tokens, useId, useToastController,
} from '@fluentui/react-components';
import { AnalyzerBreadcrumb } from '../shared/AnalyzerBreadcrumb';
import { Add16Regular } from '@fluentui/react-icons';
import { useSearchParams } from 'react-router-dom';
import { usePromptsTable, type PromptTableRow } from '../../hooks/usePromptsTable';
import { useDeletePrompt } from '../../hooks/useDeletePrompt';
import { getPromptLabel } from '../../utils/format';
import { RetryMessageBar } from '../shared/RetryMessageBar';
import { DeletePromptDialog } from './DeletePromptDialog';
import { PromptDrawer, type PromptDrawerMode } from './PromptDrawer';
import { PromptsListTable } from './PromptsListTable';

const DRAWER_PARAMS = ['view', 'edit', 'create'] as const;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXL}`,
    minHeight: '100%',
    maxWidth: '1280px',
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    boxSizing: 'border-box',
  },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalM },
  searchBox: { maxWidth: '360px', width: '100%' },
});

export default function ManagePromptsScreen() {
  const styles = useStyles();
  const [searchParams, setSearchParams] = useSearchParams();
  const toasterId = useId('manage-prompts-toaster');
  const { dispatchToast } = useToastController(toasterId);
  const [searchText, setSearchText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PromptTableRow | undefined>();
  const { data, isLoading, error, refetch, isFetching } = usePromptsTable();
  const deleteMutation = useDeletePrompt();

  const viewId = searchParams.get('view') ?? undefined;
  const editId = searchParams.get('edit') ?? undefined;
  const isCreate = searchParams.get('create') === '1';
  const mode: PromptDrawerMode | undefined = isCreate ? 'create' : editId ? 'edit' : viewId ? 'view' : undefined;
  const activeId = mode === 'create' ? undefined : editId ?? viewId;

  const all = useMemo(() => data ?? [], [data]);
  const activeRow = activeId ? all.find((r) => r.id.toLowerCase() === activeId.toLowerCase()) : undefined;
  const existingNames = useMemo(
    () => new Set(all.filter((r) => r.id !== activeRow?.id).map((r) => getPromptLabel(r).toLowerCase())),
    [all, activeRow?.id],
  );

  const term = searchText.trim().toLowerCase();
  const rows = useMemo(() => (term
    ? all.filter((r) => [getPromptLabel(r), r.name, r.userPrompt ?? ''].some((v) => v.toLowerCase().includes(term)))
    : all), [all, term]);

  const setDrawer = useCallback((param?: (typeof DRAWER_PARAMS)[number], value?: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      DRAWER_PARAMS.forEach((p) => next.delete(p));
      if (param && value) next.set(param, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const notify = useCallback((message: string, intent: 'success' | 'error' = 'success') => {
    dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, { intent });
  }, [dispatchToast]);

  const openView = useCallback((id: string) => setDrawer('view', id), [setDrawer]);
  const openEdit = useCallback((id: string) => setDrawer('edit', id), [setDrawer]);
  const closeDrawer = useCallback(() => setDrawer(), [setDrawer]);

  const handleDelete = () => {
    if (!deleteTarget) return;
    const name = getPromptLabel(deleteTarget);
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => notify(`Deleted “${name}”.`),
      onError: (e) => notify(`Couldn't delete “${name}”. ${e.message}`, 'error'),
    });
    setDeleteTarget(undefined);
  };

  return (
    <main className={styles.root}>
      <Toaster toasterId={toasterId} position="top-end" />
      <AnalyzerBreadcrumb
        crumbs={[
          { label: 'Conversation Analyzer', to: '/conversation-analyzer' },
          { label: 'Prompt insights', to: '/conversation-analyzer?tab=prompt-insights' },
          { label: 'Manage prompts' },
        ]}
      />
      <div className={styles.headerRow}>
        <Title2 as="h1">Manage prompts</Title2>
        <Button appearance="primary" icon={<Add16Regular />} onClick={() => setDrawer('create', '1')}>
          Create prompt
        </Button>
      </div>
      <SearchBox
        className={styles.searchBox}
        placeholder="Search by prompt name or content"
        aria-label="Search by prompt name or content"
        value={searchText}
        onChange={(_e, d) => setSearchText(d.value)}
      />
      {error && (
        <RetryMessageBar
          title="Couldn't load prompts"
          message={error.message}
          onRetry={() => void refetch()}
          retryDisabled={isFetching}
        />
      )}
      <PromptsListTable
        rows={rows}
        totalCount={all.length}
        isLoading={isLoading}
        isFiltered={Boolean(term)}
        onView={openView}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
      />
      <PromptDrawer
        mode={mode}
        prompt={activeRow}
        promptId={activeId}
        existingNames={existingNames}
        onClose={closeDrawer}
        onEdit={openEdit}
        onSaved={(name, created) => {
          notify(created ? `Created “${name}”.` : `Updated “${name}”.`);
          closeDrawer();
        }}
      />
      <DeletePromptDialog
        name={deleteTarget ? getPromptLabel(deleteTarget) : undefined}
        isDeleting={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(undefined)}
      />
    </main>
  );
}
