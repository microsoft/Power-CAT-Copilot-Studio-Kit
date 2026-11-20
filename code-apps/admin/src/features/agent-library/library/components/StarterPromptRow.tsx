/**
 * StarterPromptRow — A memoized row for a single starter prompt (title + message pair).
 *
 * Renders two side-by-side Input fields (Title + Message) and a clear button.
 * The message field is required when a title is provided; pass `textError` to
 * surface the validation message beneath the input.
 */

import React from 'react';
import { Button, Field, Input, makeStyles } from '@fluentui/react-components';
import type { InputOnChangeData } from '@fluentui/react-components';
import { Eraser20Regular } from '@fluentui/react-icons';

export interface StarterPromptRowProps {
  index: number;
  title: string;
  text: string;
  onTitleChange: (index: number, value: string) => void;
  onTextChange: (index: number, value: string) => void;
  /** Clears both title and text in a single state update */
  onClear: (index: number) => void;
  /** Validation error message shown beneath the message field. */
  textError?: string;
}

const useStyles = makeStyles({
  row: {
    display: 'flex',
    flexDirection: 'row',
    gap: '8px',
    alignItems: 'flex-start',
  },
  titleInput: {
    width: '199px',
    flexShrink: 0,
  },
  textField: {
    flex: 1,
  },
});

export const StarterPromptRow: React.FC<StarterPromptRowProps> = React.memo(
  ({ index, title, text, onTitleChange, onTextChange, onClear, textError }) => {
    const styles = useStyles();

    const handleTitleChange = React.useCallback(
      (_ev: React.ChangeEvent<HTMLInputElement>, data: InputOnChangeData) => {
        onTitleChange(index, data.value);
      },
      [index, onTitleChange],
    );

    const handleTextChange = React.useCallback(
      (_ev: React.ChangeEvent<HTMLInputElement>, data: InputOnChangeData) => {
        onTextChange(index, data.value);
      },
      [index, onTextChange],
    );

    const handleDelete = React.useCallback(() => {
      onClear(index);
    }, [index, onClear]);

    return (
      <div className={styles.row}>
        <Input
          className={styles.titleInput}
          placeholder="Title"
          value={title}
          onChange={handleTitleChange}
          maxLength={30}
        />
        <Field
          className={styles.textField}
          validationState={textError ? 'error' : undefined}
          validationMessage={textError}
        >
          <Input
            placeholder="Message text"
            value={text}
            onChange={handleTextChange}
            maxLength={4000}
          />
        </Field>
        <Button
          appearance="subtle"
          size="small"
          icon={<Eraser20Regular />}
          onClick={handleDelete}
          aria-label="Clear starter prompt"
        />
      </div>
    );
  },
);

StarterPromptRow.displayName = 'StarterPromptRow';
