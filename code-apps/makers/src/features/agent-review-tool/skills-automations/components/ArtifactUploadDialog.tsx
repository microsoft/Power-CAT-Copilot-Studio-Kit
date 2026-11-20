/**
 * ArtifactUploadDialog
 *
 * Collects the two inputs a review needs: the artifact file, and the runtimes
 * to judge it against.
 *
 * The runtime choice is a form field rather than something detected, because it
 * cannot be detected. A SKILL.md carries no marker naming its target platform,
 * so asking is the only honest option — inferring one would silently pick a
 * rubric on the author's behalf.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Label,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
  makeStyles,
  shorthands,
  tokens,
  useId,
  useRestoreFocusSource,
} from '@fluentui/react-components';
import {
  ArrowUploadRegular,
  DismissRegular,
  DocumentBulletListRegular,
  FolderZipRegular,
} from '@fluentui/react-icons';
import { RUNTIME_LABELS, TARGET_RUNTIMES, type TargetRuntime } from '../contracts/ArtifactReview';
import { describeRuntimeCoverage } from '../data/catalogueResolver';
import {
  describeUnsupportedUpload,
  reconcileRuntimes,
  runtimesForFile,
} from '../services/runtimeApplicability';
import { RuntimeCoverageHint } from './RuntimeCoverageHint';
import { RuntimeIcon } from './RuntimeIcon';

/** Guard against a browser tab stalling on a file nobody meant to upload. */
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['.zip', '.md', '.json'];

const useStyles = makeStyles({
  surface: { width: '560px', maxWidth: '92vw' },
  titleRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    paddingTop: tokens.spacingVerticalXS,
  },
  // MessageBarTitle renders inline, so body copy placed straight after it reads as one
  // run-on sentence. A block wrapper puts the body on its own line, matching HeroSection.
  bannerBody: { display: 'block', marginTop: tokens.spacingVerticalXXS },
  dropZone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalXXL,
    borderRadius: tokens.borderRadiusLarge,
    ...shorthands.border(tokens.strokeWidthThin, 'dashed', tokens.colorNeutralStroke2),
    backgroundColor: tokens.colorNeutralBackground2,
    cursor: 'pointer',
    textAlign: 'center',
    ':hover': {
      ...shorthands.borderColor(tokens.colorBrandStroke1),
      backgroundColor: tokens.colorNeutralBackground2Hover,
    },
  },
  dropZoneActive: {
    ...shorthands.borderColor(tokens.colorBrandStroke1),
    backgroundColor: tokens.colorBrandBackground2,
  },
  dropZoneFilled: {
    ...shorthands.borderStyle('solid'),
    ...shorthands.borderColor(tokens.colorBrandStroke1),
  },
  hiddenInput: { display: 'none' },
  fieldBlock: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  warningText: { color: tokens.colorPaletteDarkOrangeForeground1 },
  runtimeList: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  runtimeRow: { display: 'flex', flexDirection: 'column' },
  runtimeLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  runtimeHint: {
    color: tokens.colorNeutralForeground3,
    paddingLeft: tokens.spacingHorizontalXXL,
    display: 'block',
  },
  // Same position as the coverage hint, but disabled-grey to bind it to the
  // control it explains rather than reading as ordinary body copy.
  runtimeHintBlocked: {
    color: tokens.colorNeutralForegroundDisabled,
    paddingLeft: tokens.spacingHorizontalXXL,
    display: 'block',
  },
  caption: { color: tokens.colorNeutralForeground3 },
});

export interface ArtifactUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (file: File, runtimes: TargetRuntime[]) => Promise<string | null>;
}

export function ArtifactUploadDialog({ open, onOpenChange, onSubmit }: ArtifactUploadDialogProps) {
  const styles = useStyles();
  const inputRef = useRef<HTMLInputElement>(null);
  const artifactLabelId = useId('artifact-label-');
  const artifactHintId = useId('artifact-hint-');
  const runtimeLabelId = useId('runtime-label-');
  const runtimeHintId = useId('runtime-hint-');
  // The dialog opens from a plain Button rather than a DialogTrigger, so Tabster
  // has nothing to restore focus to on close. Without this, dismissing drops
  // focus to <body>.
  const restoreFocus = useRestoreFocusSource();
  const [file, setFile] = useState<File | null>(null);
  const [runtimes, setRuntimes] = useState<TargetRuntime[]>(['cowork']);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setFile(null);
    setRuntimes(['cowork']);
    setDragActive(false);
    setError(null);
    setSubmitting(false);
  }, []);

  const acceptFile = useCallback((candidate: File) => {
    const name = candidate.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      setError(`${candidate.name} is not a supported file. Upload a .zip bundle, a SKILL.md or an automation .json.`);
      return;
    }
    if (candidate.size > MAX_UPLOAD_BYTES) {
      setError(
        `${candidate.name} is ${(candidate.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      );
      return;
    }
    setError(null);
    setFile(candidate);

    /*
      Reconcile the runtime choice against the file just chosen, so the order of
      the two decisions does not matter. The rule itself lives in
      `reconcileRuntimes`, beside the reasoning for it.
    */
    setRuntimes((current) => reconcileRuntimes(current, runtimesForFile(candidate)));
  }, []);

  const toggleRuntime = useCallback((runtime: TargetRuntime, checked: boolean) => {
    setRuntimes((current) =>
      checked ? [...current, runtime].filter((r, i, a) => a.indexOf(r) === i) : current.filter((r) => r !== runtime),
    );
  }, []);

  const canSubmit = file !== null && runtimes.length > 0 && !submitting;

  /* Recomputed for the render so the checkboxes disable the moment a file
     lands, and re-enable if it is replaced by a .zip or .md. */
  const allowedRuntimes = useMemo(() => runtimesForFile(file), [file]);

  /* What ticking each runtime covers. Wording and rationale live with the
     catalogue, in `describeRuntimeCoverage`. */
  const runtimeHints = useMemo(
    () =>
      Object.fromEntries(
        TARGET_RUNTIMES.map((runtime) => [runtime, describeRuntimeCoverage(runtime)]),
      ) as Record<TargetRuntime, string>,
    [],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting && !nextOpen) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => handleOpenChange(data.open)}>
      <DialogSurface className={styles.surface} {...restoreFocus}>
        <DialogBody>
          <DialogTitle
            action={
              <Button
                appearance="subtle"
                aria-label="Close"
                icon={<DismissRegular />}
                disabled={submitting}
                onClick={() => handleOpenChange(false)}
              />
            }
          >
            <span className={styles.titleRow}>
              <DocumentBulletListRegular />
              Review a skill or automation
            </span>
          </DialogTitle>

          <DialogContent className={styles.content} aria-busy={submitting}>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>That file cannot be reviewed</MessageBarTitle>
                  <div className={styles.bannerBody}>{error}</div>
                </MessageBarBody>
              </MessageBar>
            )}

            {/*
              A `Field` is wrong here on both counts: it renders a `<label for>`
              that a div cannot receive, and around the runtime checkboxes it
              stamps its one id onto all three. Labelling is wired by hand so the
              group is named once and each control keeps its own accessible name.
            */}
            <div className={styles.fieldBlock}>
              <Label id={artifactLabelId} weight="semibold">
                Artifact
              </Label>
              <div
                className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ''} ${file ? styles.dropZoneFilled : ''}`}
                role="button"
                tabIndex={0}
                aria-labelledby={artifactLabelId}
                aria-describedby={artifactHintId}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  const dropped = event.dataTransfer.files?.[0];
                  if (dropped) acceptFile(dropped);
                }}
              >
                {file ? <FolderZipRegular fontSize={32} /> : <ArrowUploadRegular fontSize={32} />}
                <Text weight="semibold">{file ? file.name : 'Drop a file here, or select one'}</Text>
                <Text size={200} className={styles.caption}>
                  {file
                    ? `${(file.size / 1024).toFixed(0)} KB — select again to replace`
                    : 'ZIP, Markdown or JSON, up to 30 MB'}
                </Text>
              </div>
              <input
                ref={inputRef}
                className={styles.hiddenInput}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(',')}
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  if (chosen) acceptFile(chosen);
                  event.target.value = '';
                }}
              />
              <Text id={artifactHintId} size={200} className={styles.caption}>
                A .zip skill bundle, a single SKILL.md, or an automation .json.
              </Text>
            </div>

            <div
              className={styles.fieldBlock}
              role="group"
              aria-labelledby={runtimeLabelId}
              aria-describedby={runtimeHintId}
            >
              <Label id={runtimeLabelId} weight="semibold">
                Target runtimes
              </Label>
              <div className={styles.runtimeList}>
                {TARGET_RUNTIMES.map((runtime) => {
                  const supported = allowedRuntimes.includes(runtime);
                  return (
                    <div key={runtime} className={styles.runtimeRow}>
                      <Checkbox
                        checked={runtimes.includes(runtime)}
                        disabled={!supported}
                        label={
                          <span className={styles.runtimeLabel}>
                            <RuntimeIcon runtime={runtime} size={16} />
                            {RUNTIME_LABELS[runtime]}
                          </span>
                        }
                        onChange={(_, data) => toggleRuntime(runtime, data.checked === true)}
                      />
                      {/*
                        A disabled control that gives no reason reads as a bug.
                        The coverage hint is replaced rather than added to,
                        because what the runtime *would* cover is not the
                        reader's question once it cannot take the file at all.
                      */}
                      <Text size={200} className={supported ? styles.runtimeHint : styles.runtimeHintBlocked}>
                        {supported ? (
                          <RuntimeCoverageHint runtime={runtime} description={runtimeHints[runtime]} />
                        ) : (
                          describeUnsupportedUpload(runtime, 'automation')
                        )}
                      </Text>
                    </div>
                  );
                })}
              </div>
              <Text id={runtimeHintId} size={200} className={styles.caption}>
                {allowedRuntimes.length < TARGET_RUNTIMES.length
                  ? 'An automation file names its own platform, so the runtimes that cannot install it are turned off.'
                  : 'A skill file does not record which platform it was written for, so choose the runtimes to judge it against. Choosing more than one shows where the skill is portable.'}
              </Text>
              {runtimes.length === 0 && (
                <Text size={200} className={styles.warningText} role="status">
                  Choose at least one runtime.
                </Text>
              )}
            </div>

          </DialogContent>

          <DialogActions>
            <Button appearance="secondary" disabled={submitting} onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              disabled={!canSubmit}
              icon={<DocumentBulletListRegular />}
              onClick={() => {
                if (!file) return;
                setSubmitting(true);
                setError(null);
                void onSubmit(file, runtimes)
                  .then((submitError) => {
                    if (submitError) {
                      setError(submitError);
                      return;
                    }
                    reset();
                    onOpenChange(false);
                  })
                  .catch((caught: unknown) => {
                    setError(
                      caught instanceof Error && caught.message
                        ? caught.message
                        : 'The file could not be checked.',
                    );
                  })
                  .finally(() => setSubmitting(false));
              }}
            >
              {submitting ? 'Checking file...' : 'Review'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
