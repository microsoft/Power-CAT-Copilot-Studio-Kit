/**
 * Prompt drawer for Manage prompts (MP-3…MP-6): read-only details, edit and
 * create modes. The mode is driven by the screen's URL params.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle,
  MessageBar, MessageBarBody, MessageBarTitle, Spinner, makeStyles, tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular, Edit16Regular } from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { ConversationAnalyzerPromptService } from '../../services/ConversationAnalyzerPromptService';
import type { PromptRow } from '../../contracts/types';
import { useUpsertPrompt } from '../../hooks/useUpsertPrompt';
import { queryKeys } from '../../hooks/queryKeys';
import { PromptDetailsView } from './PromptDetailsView';
import { PromptEditForm } from './PromptEditForm';

export type PromptDrawerMode = 'view' | 'edit' | 'create';

interface PromptDrawerProps {
  mode?: PromptDrawerMode;
  /** Row already loaded by the table; the full record is fetched for view/edit. */
  prompt?: PromptRow;
  promptId?: string;
  /** Lower-cased names of other prompts, for the duplicate-name check. */
  existingNames: Set<string>;
  onClose: () => void;
  onEdit: (id: string) => void;
  onSaved: (name: string, created: boolean) => void;
}

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, paddingTop: tokens.spacingVerticalS },
  loadingRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, color: tokens.colorNeutralForeground2 },
  footer: { justifyContent: 'flex-end' },
});

export function PromptDrawer({ mode, prompt, promptId, existingNames, onClose, onEdit, onSaved }: PromptDrawerProps) {
  const styles = useStyles();
  const open = Boolean(mode);
  const id = promptId ?? prompt?.id;
  const [displayName, setDisplayName] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const upsert = useUpsertPrompt();

  // Fetch the full record so a failure shows here instead of the route-level error boundary.
  const detailQ = useQuery<PromptRow | undefined>({
    queryKey: [...queryKeys.all, 'prompt-detail', id ?? ''],
    enabled: open && mode !== 'create' && Boolean(id),
    queryFn: () => ConversationAnalyzerPromptService.getById(id!),
    staleTime: 30_000,
  });
  const record = detailQ.data ?? prompt;
  // `?edit=` on a system prompt falls back to read-only.
  const effectiveMode: PromptDrawerMode | undefined = mode === 'edit' && record?.scope === 'system' ? 'view' : mode;
  const isForm = effectiveMode === 'edit' || effectiveMode === 'create';

  // Seed from the fetched detail only once per open session so refetches don't overwrite edits.
  const seededFromDetail = useRef(false);

  useEffect(() => {
    if (!open) {
      seededFromDetail.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayName(mode === 'create' ? '' : prompt?.displayName ?? '');
    setUserPrompt(mode === 'create' ? '' : prompt?.userPrompt ?? '');
    upsert.reset();
    // `upsert` omitted: reset() returns a new object and would loop. Re-seed only on open/target/mode change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id, mode]);

  useEffect(() => {
    if (!open || mode === 'create' || !detailQ.data || seededFromDetail.current) return;
    seededFromDetail.current = true;
    setDisplayName(detailQ.data.displayName ?? '');
    setUserPrompt(detailQ.data.userPrompt ?? '');
  }, [open, mode, detailQ.data]);

  const loadingDetail = mode !== 'create' && detailQ.isLoading;
  const trimmedName = displayName.trim();
  const nameError = trimmedName && existingNames.has(trimmedName.toLowerCase())
    ? 'A prompt with this name already exists.'
    : undefined;
  const canSave = isForm && trimmedName.length > 0 && userPrompt.trim().length > 0
    && !nameError && !upsert.isPending && !loadingDetail;

  const handleSave = () => {
    const created = effectiveMode === 'create';
    upsert.mutate(
      { id: created ? undefined : id, name: 'Custom Prompt Analysis', displayName: trimmedName, userPrompt: userPrompt.trim() },
      { onSuccess: () => onSaved(trimmedName, created) },
    );
  };

  const title = effectiveMode === 'create' ? 'New custom prompt' : effectiveMode === 'edit' ? 'Edit prompt' : 'Prompt details';

  return (
    <Drawer open={open} position="end" modalType="modal" size="medium" onOpenChange={(_e, d) => { if (!d.open) onClose(); }}>
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Close" icon={<Dismiss24Regular />} onClick={onClose} />}>
          {title}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <div className={styles.body}>
          {detailQ.isError && (
            <MessageBar intent="warning">
              <MessageBarBody>
                <MessageBarTitle>Couldn&apos;t load the full prompt.</MessageBarTitle>
                {detailQ.error instanceof Error ? detailQ.error.message : 'Some details may be missing.'}
              </MessageBarBody>
            </MessageBar>
          )}
          {loadingDetail && (
            <div className={styles.loadingRow}>
              <Spinner size="tiny" />
              <span>Loading prompt…</span>
            </div>
          )}
          {!loadingDetail && effectiveMode === 'view' && !record && (
            <MessageBar intent="warning">
              <MessageBarBody>This prompt doesn&apos;t exist or was deleted.</MessageBarBody>
            </MessageBar>
          )}
          {effectiveMode === 'view' && record && <PromptDetailsView prompt={record} />}
          {isForm && (
            <PromptEditForm
              displayName={displayName}
              userPrompt={userPrompt}
              onDisplayNameChange={setDisplayName}
              onUserPromptChange={setUserPrompt}
              nameError={nameError}
              disabled={loadingDetail}
            />
          )}
          {upsert.isError && (
            <MessageBar intent="error">
              <MessageBarBody>{upsert.error?.message ?? 'Save failed.'}</MessageBarBody>
            </MessageBar>
          )}
        </div>
      </DrawerBody>
      <DrawerFooter className={styles.footer}>
        {isForm ? (
          <>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
            <Button appearance="primary" onClick={handleSave} disabled={!canSave}>
              {upsert.isPending ? <Spinner size="tiny" aria-label="Saving" /> : 'Save'}
            </Button>
          </>
        ) : (
          <>
            <Button appearance="secondary" onClick={onClose}>Close</Button>
            {record?.scope === 'custom' && id && (
              <Button appearance="primary" icon={<Edit16Regular />} onClick={() => onEdit(id)}>Edit</Button>
            )}
          </>
        )}
      </DrawerFooter>
    </Drawer>
  );
}
