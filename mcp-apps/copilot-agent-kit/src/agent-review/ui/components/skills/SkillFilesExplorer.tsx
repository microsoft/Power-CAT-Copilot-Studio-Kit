import { useMemo, useState } from 'react';
import {
  Caption1,
  MessageBar,
  MessageBarBody,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import type { SkillView } from '../viewTypes.js';
import {
  buildSkillFileExplorerModel,
  resolveSelectedSkillFile,
} from './skillFileExplorerModel.js';
import { SkillFileDetail } from './SkillFileDetail.js';
import { SkillFileTree } from './SkillFileTree.js';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalM),
  },
  split: {
    display: 'grid',
    gridTemplateColumns: '264px minmax(0, 1fr)',
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke3),
    '@media (max-width: 840px)': {
      gridTemplateColumns: '1fr',
    },
  },
  rail: {
    minWidth: 0,
    maxHeight: '620px',
    overflowY: 'auto',
    ...shorthands.borderRight('1px', 'solid', tokens.colorNeutralStroke3),
    ...shorthands.padding(tokens.spacingVerticalS, 0),
    '@media (max-width: 840px)': {
      maxHeight: '260px',
      ...shorthands.borderRight('0px'),
      ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke3),
    },
  },
  railHead: {
    color: tokens.colorNeutralForeground3,
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalM),
  },
});

/** Inspect persisted skill files and sanitized resource evidence in one pane. */
export function SkillFilesExplorer({ skill }: { skill: SkillView }) {
  const styles = useStyles();
  const model = useMemo(() => buildSkillFileExplorerModel(skill), [skill]);
  const [selectedEntryId, setSelectedEntryId] = useState<string>();
  const selected = resolveSelectedSkillFile(model.entries, selectedEntryId);

  if (model.availability === 'historical') {
    return (
      <MessageBar intent="info">
        <MessageBarBody>
          This review was saved before file metadata was recorded. Run the review again
          to inspect its files.
        </MessageBarBody>
      </MessageBar>
    );
  }

  if (model.availability === 'empty') {
    return (
      <MessageBar intent="info">
        <MessageBarBody>No files were recorded for this skill.</MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <div className={styles.rail}>
          <Caption1 className={styles.railHead} block>
            {model.entries.length} {model.entries.length === 1 ? 'file' : 'files'}
          </Caption1>
          <SkillFileTree
            entries={model.entries}
            selectedEntryId={selected?.entryId}
            onSelect={setSelectedEntryId}
          />
        </div>
        {selected && <SkillFileDetail entry={selected} />}
      </div>
    </div>
  );
}
