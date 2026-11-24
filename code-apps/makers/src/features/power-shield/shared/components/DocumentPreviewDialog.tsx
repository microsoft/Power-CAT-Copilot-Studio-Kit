import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowDownload20Regular,
  Dismiss20Regular,
  Document20Regular,
  Image20Regular,
  TableSimple20Regular,
} from '@fluentui/react-icons';
import { fileToBase64, downloadBase64File } from '../utils/fileUtils';
import { downloadAttachment } from '../services/dataverse/commentService';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getFileIcon(mimeType: string) {
  if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
    return <Image20Regular />;
  }
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return <TableSimple20Regular />;
  }
  return <Document20Regular />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  surface: {
    width: '85vw',
    maxWidth: '85vw',
    height: '85vh',
    display: 'flex',
    flexDirection: 'column',
  },
  body: {
    flex: '1',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    overflow: 'hidden',
  },
  titleText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  titleActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexShrink: 0,
  },
  content: {
    flex: '1',
    overflow: 'hidden',
    padding: '0',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  centerBox: {
    flex: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalL,
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
  },
  imageWrapper: {
    flex: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground3,
    minHeight: 0,
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    display: 'block',
  },
  unavailableBox: {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXL,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  mimeType: string;
  /** Local File object (Wizard Step 4, before upload). */
  file?: File;
  /** Dataverse annotation ID (after upload). */
  annotationId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DocumentPreviewDialog({
  open,
  onOpenChange,
  fileName,
  mimeType,
  file,
  annotationId,
}: DocumentPreviewDialogProps) {
  const styles = useStyles();
  const [base64, setBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load content when dialog opens; clear on close.
  useEffect(() => {
    if (!open) {
      setBase64(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setBase64(null);

    async function load() {
      try {
        let b64: string;
        if (file) {
          b64 = await fileToBase64(file);
        } else if (annotationId) {
          const result = await downloadAttachment(annotationId);
          b64 = result.base64;
        } else {
          throw new Error('No file source provided.');
        }
        if (!cancelled) setBase64(b64);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load preview.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleDownload() {
    if (base64) {
      downloadBase64File(base64, fileName, mimeType);
    }
  }

  function renderContent() {
    if (loading) {
      return (
        <div className={styles.centerBox}>
          <Spinner label="Loading preview..." />
        </div>
      );
    }
    if (error) {
      return (
        <div className={styles.centerBox}>
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        </div>
      );
    }
    if (!base64) return null;

    const dataUri = `data:${mimeType};base64,${base64}`;

    if (mimeType === 'application/pdf') {
      return (
        <iframe
          className={styles.iframe}
          src={dataUri}
          title={fileName}
        />
      );
    }

    if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
      return (
        <div className={styles.imageWrapper}>
          <img className={styles.image} src={dataUri} alt={fileName} />
        </div>
      );
    }

    // DOCX / XLSX — no in-browser preview
    return (
      <div className={styles.unavailableBox}>
        <Text size={400}>Preview not available for Word/Excel files.</Text>
        <Button
          appearance="primary"
          icon={<ArrowDownload20Regular />}
          onClick={handleDownload}
        >
          Download to view
        </Button>
      </div>
    );
  }

  const showDownload =
    base64 != null &&
    (mimeType === 'application/pdf' ||
      mimeType === 'image/png' ||
      mimeType === 'image/jpeg');

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface className={styles.surface}>
        <DialogBody className={styles.body}>
          <DialogTitle
            action={
              <span className={styles.titleActions}>
                {showDownload && (
                  <Button
                    appearance="subtle"
                    icon={<ArrowDownload20Regular />}
                    onClick={handleDownload}
                    aria-label={`Download ${fileName}`}
                    title="Download"
                  />
                )}
                <Button
                  appearance="subtle"
                  icon={<Dismiss20Regular />}
                  onClick={() => onOpenChange(false)}
                  aria-label="Close preview"
                  title="Close"
                />
              </span>
            }
          >
            <span className={styles.titleRow}>
              {getFileIcon(mimeType)}
              <span className={styles.titleText}>{fileName}</span>
            </span>
          </DialogTitle>
          <DialogContent className={styles.content}>
            {renderContent()}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
