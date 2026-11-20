/** Read-only prompt details (MP-3). System prompts can only be viewed. */

import {
  Field, Input, Spinner, Textarea, makeStyles, tokens,
} from '@fluentui/react-components';
import type { PromptRow } from '../../contracts/types';
import { usePromptText } from '../../hooks/usePromptText';
import { formatDateTime, getPromptLabel } from '../../utils/format';
import { PromptTypeBadge } from '../shared/PromptPreview';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  textarea: { minHeight: '320px' },
  meta: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: tokens.spacingVerticalM,
  },
});

export function PromptDetailsView({ prompt }: { prompt: PromptRow }) {
  const styles = useStyles();
  const { text, isLoading, isError } = usePromptText(prompt);

  return (
    <div className={styles.root}>
      <Field label="Prompt name">
        <Input readOnly appearance="filled-darker" value={getPromptLabel(prompt)} />
      </Field>
      <Field label="Prompt type">
        <span><PromptTypeBadge scope={prompt.scope} /></span>
      </Field>
      <Field
        label="Prompt"
        validationState={isError ? 'error' : 'none'}
        validationMessage={isError ? 'Unable to load the prompt text.' : undefined}
      >
        {isLoading ? (
          <Spinner size="tiny" label="Loading prompt…" labelPosition="after" />
        ) : (
          <Textarea readOnly appearance="filled-darker" className={styles.textarea} value={text ?? ''} resize="vertical" />
        )}
      </Field>
      <div className={styles.meta}>
        <Field label="Created on">
          <Input readOnly appearance="filled-darker" value={formatDateTime(prompt.createdOn) || '—'} />
        </Field>
        <Field label="Created by">
          <Input readOnly appearance="filled-darker" value={prompt.createdBy ?? '—'} />
        </Field>
        <Field label="Modified on">
          <Input readOnly appearance="filled-darker" value={formatDateTime(prompt.modifiedOn) || '—'} />
        </Field>
        <Field label="Modified by">
          <Input readOnly appearance="filled-darker" value={prompt.modifiedBy ?? '—'} />
        </Field>
      </div>
    </div>
  );
}
