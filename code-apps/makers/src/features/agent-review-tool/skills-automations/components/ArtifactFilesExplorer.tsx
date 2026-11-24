/**
 * ArtifactFilesExplorer
 *
 * Shows the bundle exactly as the review read it: every file in a tree, and the
 * text of each one with the finding lines marked.
 *
 * This exists because a score with no visible input is a score nobody trusts.
 * The reader's first question about an automated review is "did it actually
 * open all of this, or did it skim the first file?" — and the only convincing
 * answer is the bundle itself, with each finding landing on the line that
 * caused it.
 *
 * Two rules follow from that:
 *
 * 1. **The tree is never filtered.** Every file that was read is listed, even
 *    when its text is not stored. Hiding a file to tidy the tree would remove
 *    the very evidence the panel exists to show.
 * 2. **Absent text says why it is absent.** A file whose text was dropped shows
 *    the reason. Silence there would read as "empty file", which is a different
 *    and untrue statement.
 */
import { Fragment, useMemo, useState } from 'react';
import {
  Badge,
  Caption1,
  CounterBadge,
  MessageBar,
  MessageBarBody,
  Text,
  Tree,
  TreeItem,
  TreeItemLayout,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  DocumentRegular,
  FolderRegular,
} from '@fluentui/react-icons';
import type { ArtifactFinding, ReviewedFile, ReviewedFileOmission } from '../contracts/ArtifactReview';
import type { SkillFindingSeverity } from '../../agents-experience/contracts/Findings';
import { FileFindingsDisclosure } from './FileFindingsDisclosure';
import { describeUnplacedFindings } from './lineMarkSummary';

/** Severity ranking, worst first. Used to colour a file's badge by its worst finding. */
const SEVERITY_RANK: Record<SkillFindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const OMISSION_TEXT: Record<ReviewedFileOmission, string> = {
  binary: 'This file is binary. It was read and checked, but there is no text to show.',
  undecodable: 'This file could not be decoded as text. It was read and checked as bytes.',
  'too-large': 'This file was read and checked in full, but it is too large to store with the review.',
  budget: 'This file was read and checked in full. The review had no storage left for its text.',
};

/** File extension to the language name shown beside the path. */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  md: 'Markdown',
  markdown: 'Markdown',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  py: 'Python',
  js: 'JavaScript',
  ts: 'TypeScript',
  ps1: 'PowerShell',
  sh: 'Shell',
  html: 'HTML',
  css: 'CSS',
  txt: 'Text',
  csv: 'CSV',
  xml: 'XML',
};

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  split: {
    display: 'grid',
    gridTemplateColumns: '264px minmax(0, 1fr)',
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke3),
    '@media (max-width: 840px)': { gridTemplateColumns: '1fr' },
  },
  rail: {
    ...shorthands.borderRight('1px', 'solid', tokens.colorNeutralStroke3),
    ...shorthands.padding(tokens.spacingVerticalS, 0),
    // The viewer is the taller column; the rail scrolls rather than stretching
    // the panel to the height of the longest file.
    maxHeight: '620px',
    overflowY: 'auto',
    '@media (max-width: 840px)': {
      ...shorthands.borderRight('0px'),
      ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke3),
      maxHeight: '260px',
    },
  },
  railHead: {
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalM),
    color: tokens.colorNeutralForeground3,
  },
  selected: {
    backgroundColor: tokens.colorBrandBackground2,
    // A tint alone is easy to miss beside a hover state, so the selected row
    // also carries a bar in the brand colour.
    boxShadow: `inset 3px 0 0 0 ${tokens.colorBrandForeground1}`,
  },
  fileIcon: { color: tokens.colorNeutralForeground3 },
  viewer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    minWidth: 0,
  },
  viewerHead: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  viewerPath: { fontWeight: tokens.fontWeightSemibold },
  viewerMeta: { marginLeft: 'auto', color: tokens.colorNeutralForeground3 },
  // Without this the shading is explained only to screen readers, by the hidden
  // span in the gutter, so a sighted reader is told less than a listening one.
  legend: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    color: tokens.colorNeutralForeground3,
  },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  swatch: {
    width: '14px',
    height: '14px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  swatchHigh: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    boxShadow: `inset 3px 0 0 0 ${tokens.colorPaletteRedForeground1}`,
  },
  swatchMedium: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    boxShadow: `inset 3px 0 0 0 ${tokens.colorPaletteDarkOrangeForeground1}`,
  },
  swatchLow: {
    backgroundColor: tokens.colorNeutralBackground4,
    boxShadow: `inset 3px 0 0 0 ${tokens.colorNeutralForeground4}`,
  },
  code: {
    ...shorthands.margin('0'),
    ...shorthands.overflow('auto'),
    maxHeight: '520px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground3,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: '12px',
    lineHeight: '20px',
  },
  codeTable: { borderCollapse: 'collapse', width: '100%' },
  gutter: {
    width: '1%',
    whiteSpace: 'nowrap',
    textAlign: 'right',
    userSelect: 'none',
    verticalAlign: 'top',
    color: tokens.colorNeutralForeground4,
    ...shorthands.padding(0, tokens.spacingHorizontalS),
    ...shorthands.borderRight('1px', 'solid', tokens.colorNeutralStroke3),
  },
  line: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    verticalAlign: 'top',
    ...shorthands.padding(0, tokens.spacingHorizontalS),
  },
  hitHigh: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    boxShadow: `inset 3px 0 0 0 ${tokens.colorPaletteRedForeground1}`,
  },
  hitMedium: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    boxShadow: `inset 3px 0 0 0 ${tokens.colorPaletteDarkOrangeForeground1}`,
  },
  hitLow: {
    backgroundColor: tokens.colorNeutralBackground4,
    boxShadow: `inset 3px 0 0 0 ${tokens.colorNeutralForeground4}`,
  },
  gutterHitHigh: { color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  gutterHitMedium: { color: tokens.colorPaletteDarkOrangeForeground1, fontWeight: tokens.fontWeightSemibold },
  // The severity of a flagged line is announced from the gutter cell, which is
  // `user-select: none`, so it stays out of a copied selection.
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalS,
    ...shorthands.padding(tokens.spacingVerticalXXXL, tokens.spacingHorizontalM),
    color: tokens.colorNeutralForeground3,
  },
});

interface FolderNode {
  name: string;
  path: string;
  folders: FolderNode[];
  files: ReviewedFile[];
}

/** Group flat forward-slashed paths into a folder hierarchy. */
function buildTree(files: readonly ReviewedFile[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: [], files: [] };

  for (const file of files) {
    const segments = file.path.split('/');
    segments.pop();
    let node = root;

    for (const segment of segments) {
      const childPath = node.path ? `${node.path}/${segment}` : segment;
      let child = node.folders.find((f) => f.name === segment);
      if (!child) {
        child = { name: segment, path: childPath, folders: [], files: [] };
        node.folders.push(child);
      }
      node = child;
    }

    node.files.push(file);
  }

  return root;
}

/** Leaf label for a path. */
function baseName(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

function languageOf(path: string): string | undefined {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return undefined;
  return LANGUAGE_BY_EXTENSION[path.slice(dot + 1).toLowerCase()];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 2 : 1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * CounterBadge has no `warning`, so medium takes `important` — still visibly
 * raised above the neutral `informative` used for low and info.
 */
function counterColour(severity: SkillFindingSeverity): 'danger' | 'important' | 'informative' {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'important';
  return 'informative';
}

export interface ArtifactFilesExplorerProps {
  files?: readonly ReviewedFile[];
  findings: readonly ArtifactFinding[];
  onSelectFinding: (finding: ArtifactFinding) => void;
}

export function ArtifactFilesExplorer({
  files,
  findings,
  onSelectFinding,
}: ArtifactFilesExplorerProps) {
  const styles = useStyles();

  const findingsByPath = useMemo(() => {
    const map = new Map<string, ArtifactFinding[]>();
    for (const finding of findings) {
      if (!finding.resourcePath) continue;
      const list = map.get(finding.resourcePath);
      if (list) list.push(finding);
      else map.set(finding.resourcePath, [finding]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    }
    return map;
  }, [findings]);

  // The file the reader most likely wants first is the one with the worst
  // problem. Defaulting to the first file in the archive would open an empty
  // one as often as not.
  const defaultPath = useMemo(() => {
    if (!files || files.length === 0) return '';
    let best = files[0].path;
    let bestRank = Number.POSITIVE_INFINITY;
    for (const file of files) {
      const worst = findingsByPath.get(file.path)?.reduce(
        (rank, finding) => Math.min(rank, SEVERITY_RANK[finding.severity]),
        Number.POSITIVE_INFINITY,
      );
      if (worst !== undefined && worst < bestRank) {
        bestRank = worst;
        best = file.path;
      }
    }
    return best;
  }, [files, findingsByPath]);

  const [selectedPath, setSelectedPath] = useState<string>('');
  const activePath = selectedPath || defaultPath;

  const tree = useMemo(() => buildTree(files ?? []), [files]);
  const openFolders = useMemo(() => collectFolderPaths(tree), [tree]);

  const selected = files?.find((file) => file.path === activePath);
  const selectedFindings = selected ? (findingsByPath.get(selected.path) ?? []) : [];

  if (!files || files.length === 0) {
    return (
      <MessageBar intent="info">
        <MessageBarBody>
          This review was saved before file contents were kept with the result, so its bundle cannot be
          shown. Re-run the review to see the files it read.
        </MessageBarBody>
      </MessageBar>
    );
  }

  const omittedCount = files.filter((file) => file.omitted).length;

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <div className={styles.rail}>
          <Caption1 className={styles.railHead} block>
            {files.length} {files.length === 1 ? 'file' : 'files'}
            {omittedCount > 0 ? ` · ${omittedCount} without stored text` : ''}
          </Caption1>
          <Tree aria-label="Files in this bundle" defaultOpenItems={openFolders}>
            <FolderContents
              node={tree}
              activePath={activePath}
              findingsByPath={findingsByPath}
              onSelect={setSelectedPath}
            />
          </Tree>
        </div>

        <div className={styles.viewer}>
          {selected ? (
            <>
              <div className={styles.viewerHead}>
                <Text className={styles.viewerPath}>{selected.path}</Text>
                {languageOf(selected.path) && (
                  <Badge appearance="outline" color="informative">
                    {languageOf(selected.path)}
                  </Badge>
                )}
                <Caption1 className={styles.viewerMeta}>
                  {formatBytes(selected.bytes)}
                  {selected.text ? ` · ${selected.text.split('\n').length} lines` : ''}
                  {selectedFindings.length > 0
                    ? ` · ${selectedFindings.length} ${selectedFindings.length === 1 ? 'finding' : 'findings'}`
                    : ' · no findings'}
                </Caption1>
              </div>

              <FileFindingsDisclosure
                findings={selectedFindings}
                onSelectFinding={onSelectFinding}
              />

              {selected.text ? (
                <>
                  <FileText
                    text={selected.text}
                    findings={selectedFindings}
                    ariaLabel={`Contents of ${selected.path}`}
                  />
                  <LineMarkLegend findings={selectedFindings} />
                </>
              ) : (
                <MessageBar intent="info">
                  <MessageBarBody>{OMISSION_TEXT[selected.omitted ?? 'undecodable']}</MessageBarBody>
                </MessageBar>
              )}
            </>
          ) : (
            <div className={styles.placeholder}>
              <DocumentRegular fontSize={32} />
              <Caption1>Select a file to see what the review read.</Caption1>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Every folder path, so the tree opens fully rather than hiding the evidence. */
function collectFolderPaths(node: FolderNode): string[] {
  return node.folders.flatMap((folder) => [folder.path, ...collectFolderPaths(folder)]);
}

function FolderContents({
  node,
  activePath,
  findingsByPath,
  onSelect,
}: {
  node: FolderNode;
  activePath: string;
  findingsByPath: Map<string, ArtifactFinding[]>;
  onSelect: (path: string) => void;
}) {
  const styles = useStyles();

  // Files before folders. A skill's entry file sits at the root of its bundle,
  // so this puts the file the reader came for at the top of the tree.
  const files = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
  const folders = [...node.folders].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Fragment>
      {files.map((file) => {
        const fileFindings = findingsByPath.get(file.path) ?? [];
        const worst = fileFindings.reduce<SkillFindingSeverity | null>(
          (current, finding) =>
            current === null || SEVERITY_RANK[finding.severity] < SEVERITY_RANK[current]
              ? finding.severity
              : current,
          null,
        );

        return (
          // `onClick` belongs on TreeItem, not on TreeItemLayout. Fluent's
          // Enter handler calls `click()` on the element carrying
          // `role="treeitem"` — this one. A click dispatched there does not
          // travel down to the layout child, so a handler on the layout would
          // work with a mouse and do nothing from the keyboard.
          <TreeItem
            key={file.path}
            itemType="leaf"
            value={file.path}
            aria-selected={activePath === file.path}
            onClick={() => onSelect(file.path)}
          >
            <TreeItemLayout
              className={mergeClasses(activePath === file.path && styles.selected)}
              iconBefore={<DocumentRegular className={styles.fileIcon} />}
              aside={
                fileFindings.length > 0 ? (
                  <CounterBadge
                    count={fileFindings.length}
                    appearance="ghost"
                    color={worst ? counterColour(worst) : 'informative'}
                    size="small"
                  />
                ) : undefined
              }
            >
              {baseName(file.path)}
            </TreeItemLayout>
          </TreeItem>
        );
      })}

      {folders.map((folder) => (
        <TreeItem key={folder.path} itemType="branch" value={folder.path}>
          <TreeItemLayout iconBefore={<FolderRegular className={styles.fileIcon} />}>
            {folder.name}
          </TreeItemLayout>
          <Tree>
            <FolderContents
              node={folder}
              activePath={activePath}
              findingsByPath={findingsByPath}
              onSelect={onSelect}
            />
          </Tree>
        </TreeItem>
      ))}
    </Fragment>
  );
}

/**
 * Explains the line shading, and says plainly how many findings could not be
 * placed on a line.
 *
 * Both halves matter. Without the key the shading is explained only to screen
 * readers, by the hidden span in the gutter, so a sighted reader is told less
 * than a listening one. Without the count the header can read "25 findings"
 * beside a file with two marks in it, and the reader is left to guess whether
 * the other twenty-three were missed, hidden, or simply not about a line.
 */
function LineMarkLegend({ findings }: { findings: readonly ArtifactFinding[] }) {
  const styles = useStyles();
  if (findings.length === 0) return null;

  const placed = new Set(findings.filter((f) => f.line).map((f) => f.line)).size;
  const unplaced = findings.filter((f) => !f.line).length;

  return (
    <Caption1 className={styles.legend} block>
      {placed > 0 && (
        <>
          <span>Shaded lines:</span>
          <span className={styles.legendItem}>
            <span className={mergeClasses(styles.swatch, styles.swatchHigh)} aria-hidden="true" />
            critical or high
          </span>
          <span className={styles.legendItem}>
            <span className={mergeClasses(styles.swatch, styles.swatchMedium)} aria-hidden="true" />
            medium
          </span>
          <span className={styles.legendItem}>
            <span className={mergeClasses(styles.swatch, styles.swatchLow)} aria-hidden="true" />
            low or info
          </span>
        </>
      )}
      {unplaced > 0 && (
        <span>
          {placed > 0 ? '· ' : ''}
          {describeUnplacedFindings(findings.length, unplaced)}
        </span>
      )}
    </Caption1>
  );
}

/**
 * The file's text with line numbers, and the finding lines marked.
 *
 * Rendered as a table so a copied selection keeps the code and leaves the line
 * numbers behind, which a two-column flex layout does not do.
 */
function FileText({
  text,
  findings,
  ariaLabel,
}: {
  text: string;
  findings: readonly ArtifactFinding[];
  ariaLabel: string;
}) {
  const styles = useStyles();
  const lines = text.split('\n');

  const worstByLine = useMemo(() => {
    const map = new Map<number, SkillFindingSeverity>();
    for (const finding of findings) {
      if (!finding.line) continue;
      const current = map.get(finding.line);
      if (!current || SEVERITY_RANK[finding.severity] < SEVERITY_RANK[current]) {
        map.set(finding.line, finding.severity);
      }
    }
    return map;
  }, [findings]);

  return (
    <div className={styles.code} tabIndex={0} aria-label={ariaLabel}>
      {/*
        A layout table, not a data table: it exists only so a copied selection
        keeps the code and leaves the line numbers behind. `presentation` strips
        the row and cell semantics that would otherwise make a 500-line file
        announce as a 500-row table.
      */}
      <table className={styles.codeTable} role="presentation">
        <tbody>
          {lines.map((line, index) => {
            const number = index + 1;
            const severity = worstByLine.get(number);
            const high = severity === 'critical' || severity === 'high';
            const medium = severity === 'medium';
            const low = severity !== undefined && !high && !medium;

            return (
              <tr key={number}>
                <td
                  className={mergeClasses(
                    styles.gutter,
                    high && styles.gutterHitHigh,
                    medium && styles.gutterHitMedium,
                  )}
                >
                  {number}
                  {severity && (
                    <span className={styles.visuallyHidden}>{`, ${severity} finding on this line`}</span>
                  )}
                </td>
                <td
                  className={mergeClasses(
                    styles.line,
                    high && styles.hitHigh,
                    medium && styles.hitMedium,
                    low && styles.hitLow,
                  )}
                >
                  {line === '' ? '\u00A0' : line}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
