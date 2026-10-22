import {
  CounterBadge,
  Tree,
  TreeItem,
  TreeItemLayout,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  DocumentRegular,
  FolderRegular,
} from '@fluentui/react-icons';
import type { SkillFileExplorerEntry } from './skillFileExplorerTypes.js';

interface FolderNode {
  name: string;
  path: string;
  files: SkillFileExplorerEntry[];
  folders: Map<string, FolderNode>;
}

const useStyles = makeStyles({
  selected: {
    backgroundColor: tokens.colorBrandBackground2,
    boxShadow: `inset 3px 0 0 0 ${tokens.colorBrandForeground1}`,
  },
  fileIcon: {
    color: tokens.colorNeutralForeground3,
  },
});

function buildTree(entries: SkillFileExplorerEntry[]): FolderNode {
  const root: FolderNode = { name: '', path: '', files: [], folders: new Map() };

  for (const entry of entries) {
    const parts = entry.folder.split('/').filter(Boolean);
    let current = root;
    for (const part of parts) {
      const path = current.path ? `${current.path}/${part}` : part;
      const child = current.folders.get(part)
        ?? { name: part, path, files: [], folders: new Map() };
      current.folders.set(part, child);
      current = child;
    }
    current.files.push(entry);
  }

  return root;
}

function allFolderValues(node: FolderNode): string[] {
  return [...node.folders.values()].flatMap(folder => [
    `folder:${folder.path}`,
    ...allFolderValues(folder),
  ]);
}

function FolderContents({
  node,
  selectedEntryId,
  onSelect,
}: {
  node: FolderNode;
  selectedEntryId?: string;
  onSelect: (entryId: string) => void;
}) {
  const styles = useStyles();
  const files = [...node.files].sort((a, b) =>
    Number(b.isSkillDefinition) - Number(a.isSkillDefinition)
      || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
  const folders = [...node.folders.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  return (
    <>
      {files.map(entry => (
        <TreeItem
          key={entry.entryId}
          itemType="leaf"
          value={entry.entryId}
          aria-selected={selectedEntryId === entry.entryId}
          onClick={() => onSelect(entry.entryId)}
        >
          <TreeItemLayout
            className={mergeClasses(selectedEntryId === entry.entryId && styles.selected)}
            iconBefore={<DocumentRegular className={styles.fileIcon} aria-hidden="true" />}
            aside={entry.analysis && entry.analysis.findings.length > 0
              ? (
                  <CounterBadge
                    count={entry.analysis.findings.length}
                    appearance="ghost"
                    color="danger"
                    size="small"
                    aria-label={`${entry.analysis.findings.length} resource findings`}
                  />
                )
              : undefined}
          >
            {entry.name}
          </TreeItemLayout>
        </TreeItem>
      ))}
      {folders.map(folder => (
        <TreeItem
          key={folder.path}
          itemType="branch"
          value={`folder:${folder.path}`}
        >
          <TreeItemLayout
            iconBefore={<FolderRegular className={styles.fileIcon} aria-hidden="true" />}
          >
            {folder.name}
          </TreeItemLayout>
          <Tree>
            <FolderContents
              node={folder}
              selectedEntryId={selectedEntryId}
              onSelect={onSelect}
            />
          </Tree>
        </TreeItem>
      ))}
    </>
  );
}

/** Fluent tree for one skill bundle, with stable entry IDs and nested folders. */
export function SkillFileTree({
  entries,
  selectedEntryId,
  onSelect,
}: {
  entries: SkillFileExplorerEntry[];
  selectedEntryId?: string;
  onSelect: (entryId: string) => void;
}) {
  const tree = buildTree(entries);
  return (
    <Tree
      aria-label="Files in this skill"
      defaultOpenItems={allFolderValues(tree)}
    >
      <FolderContents
        node={tree}
        selectedEntryId={selectedEntryId}
        onSelect={onSelect}
      />
    </Tree>
  );
}
