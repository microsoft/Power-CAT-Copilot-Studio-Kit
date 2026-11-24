import { useState, useMemo } from 'react';
import {
  Card, CardHeader, Body1Strong, Body1, Caption1, Button, Spinner,
  Menu, MenuTrigger, MenuList, MenuItem, MenuPopover,
  Dropdown, Option,
  Tooltip, Link,
  makeStyles, tokens,
} from '@fluentui/react-components';
import {
  WindowNew20Regular, ContractDownLeft20Regular,
  ArrowUp20Regular, Copy20Regular, MoreVertical20Regular,
  ChevronUp20Regular, ChevronDown20Regular,
  CheckmarkCircle20Filled,
} from '@fluentui/react-icons';
import type { PromptEvaluation, PromptGroup } from '../contracts/types';
import { AppState } from '../contracts/types';

interface ResponseCardProps {
  appState: AppState;
  promptGroups: PromptGroup[];
  selectedPrompt: PromptEvaluation | null;
  isFullScreen: boolean;
  selectPrompt: (prompt: PromptEvaluation | null) => void;
  applyAndRefine: (prompt: PromptEvaluation) => void;
  copyPrompt: (text: string) => Promise<void>;
  toggleFullScreen: () => void;
}

const GROUP_OPTIONS = ['All', 'Zero-shot Prompts', 'Few-shot Prompts', 'Chain-of-thought Prompts'];

const useStyles = makeStyles({
  card: {
    flex: 1,
    minHeight: '300px',
    display: 'flex',
    flexDirection: 'column',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  dropdown: {
    minWidth: '200px',
  },
  empty: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    padding: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground3,
  },
  grid: {
    flex: '1 1 0',
    overflowY: 'auto',
    overflowX: 'auto',
    minHeight: 0,
    padding: `0 5px 4px`,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    '& th, & td': {
      textAlign: 'left',
      padding: '4px 5px',
      borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
      verticalAlign: 'top',
    },
    '& tr:last-child td': {
      borderBottom: 'none',
    },
    '& th': {
      fontWeight: tokens.fontWeightSemibold,
      fontSize: tokens.fontSizeBase200,
      color: tokens.colorNeutralForeground3,
      position: 'sticky',
      top: 0,
      backgroundColor: tokens.colorNeutralBackground1,
      zIndex: 1,
      borderBottom: 'none',
    },
  },
  row: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  rowSelected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    cursor: 'pointer',
  },
  radioCell: {
    width: '36px',
    paddingRight: 0,
  },
  promptCell: {
    maxWidth: '350px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  responseCell: {
    maxWidth: '400px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
  },
  actionsCell: {
    width: '36px',
    textAlign: 'center',
  },
  sortableHeader: {
    cursor: 'pointer',
    userSelect: 'none',
  },
  sortIcon: {
    marginLeft: tokens.spacingHorizontalXXS,
    verticalAlign: 'middle',
  },
  confidenceHeader: {
    width: '100px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  confidenceCell: {
    textAlign: 'center',
    width: '100px',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    color: tokens.colorNeutralForeground3,
  },
});

export function ResponseCard({
  appState, promptGroups, selectedPrompt, isFullScreen,
  selectPrompt, applyAndRefine, copyPrompt, toggleFullScreen,
}: ResponseCardProps) {
  const styles = useStyles();
  const [selectedGroup, setSelectedGroup] = useState('All');
  const [sortCol, setSortCol] = useState<'confidence_score_value' | 'prompt' | 'response'>('confidence_score_value');
  const [sortAsc, setSortAsc] = useState(false);

  const toggleSort = (col: 'confidence_score_value' | 'prompt' | 'response') => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(col !== 'confidence_score_value');
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return null;
    return (
      <span className={styles.sortIcon} aria-hidden>
        {sortAsc ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
      </span>
    );
  };

  const filteredPrompts = useMemo(() => {
    const list: (PromptEvaluation & { _group: string })[] = promptGroups
      .filter((g) => selectedGroup === 'All' || g.group_label === selectedGroup)
      .flatMap((group) => group.prompts.map((p) => ({ ...p, _group: group.group_label })));

    return list.sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortAsc ? aVal - bVal : bVal - aVal;
      }
      return sortAsc
        ? String(aVal ?? '').localeCompare(String(bVal ?? ''))
        : String(bVal ?? '').localeCompare(String(aVal ?? ''));
    });
  }, [promptGroups, selectedGroup, sortCol, sortAsc]);

  const selectedIdx = selectedPrompt
    ? filteredPrompts.findIndex((p) => p.prompt === selectedPrompt.prompt)
    : -1;

  return (
    <Card className={styles.card} size="large">
      <CardHeader
        header={<Body1Strong>Refined prompts</Body1Strong>}
        action={
          <div className={styles.headerActions}>
            {selectedPrompt && appState === AppState.LOADED && (
              <>
                <Button appearance="subtle" icon={<ArrowUp20Regular />} size="small" onClick={() => applyAndRefine(selectedPrompt)}>
                  Apply and refine
                </Button>
                <Button appearance="subtle" icon={<Copy20Regular />} size="small" onClick={() => void copyPrompt(selectedPrompt.prompt)}>
                  Copy prompt
                </Button>
              </>
            )}
            {appState === AppState.LOADED && (
              <Dropdown
                className={styles.dropdown}
                value={selectedGroup}
                selectedOptions={[selectedGroup]}
                onOptionSelect={(_, data) => setSelectedGroup(data.optionValue ?? 'All')}
                size="small"
              >
                {GROUP_OPTIONS.map((opt) => (
                  <Option key={opt} value={opt}>{opt}</Option>
                ))}
              </Dropdown>
            )}
            <Button
              appearance="transparent"
              icon={isFullScreen ? <ContractDownLeft20Regular /> : <WindowNew20Regular />}
              onClick={toggleFullScreen}
              aria-label={isFullScreen ? 'Exit fullscreen' : 'Expand'}
              size="small"
            />
          </div>
        }
      />

      {appState === AppState.NOT_LOADED && (
        <div className={styles.empty}>
          <Body1>Analyze a prompt to see results</Body1>
        </div>
      )}

      {appState === AppState.LOADING && (
        <div className={styles.empty}>
          <Spinner size="medium" label="Evaluating your prompt..." labelPosition="below" />
        </div>
      )}

      {appState === AppState.LOADED && filteredPrompts.length > 0 && (
        <>
          <div className={styles.grid}>
            <table className={styles.table} aria-label="Refined prompts">
              <thead>
                <tr>
                  <th className={styles.radioCell}></th>
                  <th className={styles.sortableHeader} aria-sort={sortCol === 'prompt' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => toggleSort('prompt')} style={{ all: 'inherit', cursor: 'pointer' }}>
                      Prompt<SortIcon col="prompt" />
                    </button>
                  </th>
                  <th className={styles.confidenceHeader} aria-sort={sortCol === 'confidence_score_value' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => toggleSort('confidence_score_value')} style={{ all: 'inherit', cursor: 'pointer' }}>
                      Confidence<SortIcon col="confidence_score_value" />
                    </button>
                  </th>
                  <th className={styles.sortableHeader} aria-sort={sortCol === 'response' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => toggleSort('response')} style={{ all: 'inherit', cursor: 'pointer' }}>
                      Response<SortIcon col="response" />
                    </button>
                  </th>
                  <th className={styles.actionsCell}></th>
                </tr>
              </thead>
              <tbody>
                {filteredPrompts.map((prompt, idx) => {
                  const isSelected = selectedIdx === idx;
                  return (
                    <tr
                      key={`${prompt._group}-${idx}`}
                      className={isSelected ? styles.rowSelected : styles.row}
                      onClick={() => selectPrompt(isSelected ? null : prompt)}
                      aria-selected={isSelected}
                    >
                      <td className={styles.radioCell}>
                        {isSelected && (
                          <CheckmarkCircle20Filled style={{ color: tokens.colorBrandForeground1 }} aria-hidden />
                        )}
                      </td>
                      <td className={styles.promptCell}>
                        <Tooltip content={prompt.prompt} relationship="description">
                          <Body1>{prompt.prompt}</Body1>
                        </Tooltip>
                      </td>
                      <td style={{ textAlign: 'center', width: '100px' }}>
                        <Body1Strong>{prompt.confidence_score}</Body1Strong>
                      </td>
                      <td className={styles.responseCell}>
                        <Tooltip content={prompt.response} relationship="description">
                          <Caption1>{prompt.response}</Caption1>
                        </Tooltip>
                      </td>
                      <td className={styles.actionsCell}>
                        <Menu>
                          <MenuTrigger>
                            <Button
                              appearance="transparent"
                              icon={<MoreVertical20Regular />}
                              size="small"
                              aria-label="Actions"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </MenuTrigger>
                          <MenuPopover>
                            <MenuList>
                              <MenuItem icon={<ArrowUp20Regular />} onClick={(e) => { e.stopPropagation(); applyAndRefine(prompt); }}>
                                Apply and refine
                              </MenuItem>
                              <MenuItem icon={<Copy20Regular />} onClick={(e) => { e.stopPropagation(); void copyPrompt(prompt.prompt); }}>
                                Copy prompt
                              </MenuItem>
                            </MenuList>
                          </MenuPopover>
                        </Menu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.footer}>
            <Link href="https://go.microsoft.com/fwlink/?linkid=2225491" target="_blank">
              <Caption1>Read terms</Caption1>
            </Link>
            <Caption1>AI-generated content may be incorrect.</Caption1>
          </div>
        </>
      )}
    </Card>
  );
}
