import { useState, useEffect } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from '@fluentui/react-components';
import {
  Add20Regular,
  Delete20Regular,
} from '@fluentui/react-icons';
import type { WizardCustomConnectorPattern } from '../contexts/wizardTypes';

const MAX_PATTERNS = 5;

/** Data group value for "Business" — all custom connector patterns default to this. */
const DEFAULT_DATA_GROUP = 2;

/** Validates host URL pattern: must start with http:// or https:// */
function isValidUrlPattern(pattern: string): boolean {
  return /^https?:\/\/.+/.test(pattern.trim());
}

interface CustomConnectorPatternsDialogProps {
  open: boolean;
  onClose: () => void;
  patterns: WizardCustomConnectorPattern[];
  onSave: (patterns: WizardCustomConnectorPattern[]) => void;
}

const useStyles = makeStyles({
  surface: {
    width: '800px',
    maxWidth: '95vw',
  },
  dialogContent: {
    overflowY: 'visible',
  },
  subtitle: {
    display: 'block',
    marginBottom: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground3,
  },
  addRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalS,
  },
  urlInput: {
    width: '100%',
  },
  orderCell: {
    width: '50px',
    textAlign: 'center',
  },
  actionsCell: {
    width: '40px',
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase200,
    display: 'block',
    marginTop: '2px',
  },
  hint: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    display: 'block',
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalS,
  },
  emptyMsg: {
    padding: `${tokens.spacingVerticalL} 0`,
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
  },
});

export function CustomConnectorPatternsDialog({
  open,
  onClose,
  patterns,
  onSave,
}: CustomConnectorPatternsDialogProps) {
  const styles = useStyles();

  const [localPatterns, setLocalPatterns] = useState<WizardCustomConnectorPattern[]>([]);
  const [errorTempId, setErrorTempId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Reset local state when dialog opens
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalPatterns([...patterns]);
      setErrorTempId(null);
      setErrorMsg('');
    }
  }, [open, patterns]);

  function addPattern() {
    const nextOrder = localPatterns.length + 1;
    setLocalPatterns([
      ...localPatterns,
      {
        tempId: crypto.randomUUID(),
        hostUrlPattern: '',
        dataGroup: DEFAULT_DATA_GROUP,
        order: nextOrder,
      },
    ]);
    clearError();
  }

  function updatePatternUrl(tempId: string, value: string) {
    setLocalPatterns(
      localPatterns.map((p) =>
        p.tempId === tempId ? { ...p, hostUrlPattern: value } : p,
      ),
    );
    clearError();
  }

  function deletePattern(tempId: string) {
    const remaining = localPatterns.filter((p) => p.tempId !== tempId);
    setLocalPatterns(remaining.map((p, i) => ({ ...p, order: i + 1 })));
    if (errorTempId === tempId) clearError();
  }

  function clearError() {
    setErrorTempId(null);
    setErrorMsg('');
  }

  function handleSave() {
    // Validate all rows
    for (const p of localPatterns) {
      const trimmed = p.hostUrlPattern.trim();
      if (!trimmed) {
        setErrorTempId(p.tempId);
        setErrorMsg('Host URL pattern is required.');
        return;
      }
      if (!isValidUrlPattern(trimmed)) {
        setErrorTempId(p.tempId);
        setErrorMsg('Pattern must start with http:// or https://');
        return;
      }
      // Check duplicates
      const isDuplicate = localPatterns.some(
        (other) => other.tempId !== p.tempId && other.hostUrlPattern.trim() === trimmed,
      );
      if (isDuplicate) {
        setErrorTempId(p.tempId);
        setErrorMsg('Duplicate pattern.');
        return;
      }
    }

    // Trim and renumber before saving
    const cleaned = localPatterns.map((p, i) => ({
      ...p,
      hostUrlPattern: p.hostUrlPattern.trim(),
      order: i + 1,
    }));
    onSave(cleaned);
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DialogSurface className={styles.surface}>
        <DialogTitle>Custom Connector Patterns</DialogTitle>
        <DialogBody>
          <DialogContent className={styles.dialogContent}>
            <Text className={styles.subtitle} size={200}>
              Define URL patterns for custom connectors to include in the DLP policy.
              Pattern matching with &quot;*&quot; wildcard is supported.
              Maximum {MAX_PATTERNS} patterns per request.
            </Text>

            <div className={styles.addRow}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {localPatterns.length} of {MAX_PATTERNS} patterns
              </Text>
              <Button
                appearance="outline"
                size="small"
                icon={<Add20Regular />}
                disabled={localPatterns.length >= MAX_PATTERNS}
                onClick={addPattern}
              >
                Add Pattern
              </Button>
            </div>

            {localPatterns.length === 0 ? (
              <Text className={styles.emptyMsg}>
                No custom connector patterns defined. Click &quot;Add Pattern&quot; to get started.
              </Text>
            ) : (
              <>
                <Table aria-label="Custom connector patterns">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell className={styles.orderCell}>Order</TableHeaderCell>
                      <TableHeaderCell>Host URL Pattern</TableHeaderCell>
                      <TableHeaderCell className={styles.actionsCell} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {localPatterns.map((p, idx) => (
                      <TableRow key={p.tempId}>
                        <TableCell className={styles.orderCell}>
                          <Text>{idx + 1}</Text>
                        </TableCell>
                        <TableCell>
                          <Input
                            className={styles.urlInput}
                            placeholder="http://api.contoso.com"
                            value={p.hostUrlPattern}
                            onChange={(_, data) => updatePatternUrl(p.tempId, data.value)}
                            aria-label={`Host URL pattern for row ${idx + 1}`}
                          />
                          {errorTempId === p.tempId && errorMsg && (
                            <Text className={styles.errorText}>{errorMsg}</Text>
                          )}
                        </TableCell>
                        <TableCell className={styles.actionsCell}>
                          <Button
                            appearance="subtle"
                            size="small"
                            icon={<Delete20Regular />}
                            aria-label={`Delete pattern row ${idx + 1}`}
                            onClick={() => deletePattern(p.tempId)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Text className={styles.hint}>
                  e.g., http://api.contoso.com — pattern matching with * is supported
                </Text>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={handleSave}>
              Save
            </Button>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
