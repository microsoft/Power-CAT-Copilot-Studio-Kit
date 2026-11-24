import { useRef, useState, useCallback } from 'react';
import {
  Button,
  Textarea,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Attach20Regular, Send20Regular, Dismiss12Regular } from '@fluentui/react-icons';
import { validateFile, formatFileSize, ALLOWED_EXTENSIONS } from '../../../shared/utils/fileUtils';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalM,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  fileChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
  },
  fileChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    paddingTop: '2px',
    paddingBottom: '2px',
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: '2px',
  },
});

interface CommentComposeProps {
  posting: boolean;
  onPost: (body: string, files: File[]) => Promise<void>;
}

export function CommentCompose({ posting, onPost }: CommentComposeProps) {
  const styles = useStyles();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  const handleFilesSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    // Reset the input so re-selecting the same file works
    e.target.value = '';

    for (const file of selected) {
      const error = validateFile(file);
      if (error) {
        setFileError(error);
        return;
      }
    }
    setFileError(null);
    setFiles((prev) => [...prev, ...selected]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!body.trim()) return;
    setPostError(null);
    try {
      await onPost(body.trim(), files);
      setBody('');
      setFiles([]);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to post comment.');
    }
  }, [body, files, onPost]);

  return (
    <div className={styles.root}>
      <Textarea
        placeholder="Add a comment..."
        value={body}
        onChange={(_, data) => setBody(data.value)}
        disabled={posting}
        resize="vertical"
        aria-label="Comment text"
      />

      {/* Selected file chips */}
      {files.length > 0 && (
        <div className={styles.fileChips}>
          {files.map((file, index) => (
            <span key={`${file.name}-${index}`} className={styles.fileChip}>
              <Text size={200}>{file.name}</Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                ({formatFileSize(file.size)})
              </Text>
              <Button
                appearance="subtle"
                size="small"
                icon={<Dismiss12Regular />}
                onClick={() => removeFile(index)}
                aria-label={`Remove ${file.name}`}
                disabled={posting}
              />
            </span>
          ))}
        </div>
      )}

      {/* File validation error */}
      {fileError && (
        <MessageBar intent="error">
          <MessageBarBody>{fileError}</MessageBarBody>
        </MessageBar>
      )}

      {/* Post error */}
      {postError && (
        <MessageBar intent="error">
          <MessageBarBody>{postError}</MessageBarBody>
        </MessageBar>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <Button
          appearance="subtle"
          icon={<Attach20Regular />}
          onClick={() => fileInputRef.current?.click()}
          disabled={posting}
        >
          Attach files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS}
          style={{ display: 'none' }}
          onChange={handleFilesSelected}
        />
        <Button
          appearance="primary"
          icon={posting ? <Spinner size="tiny" /> : <Send20Regular />}
          onClick={handleSubmit}
          disabled={posting || !body.trim()}
        >
          {posting ? 'Posting...' : 'Post'}
        </Button>
      </div>
    </div>
  );
}
