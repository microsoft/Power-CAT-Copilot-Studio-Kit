// Categorized, searchable metric browser for the Forecast workspace.
// Matches the Dashboards sidebar treatment: per-metric info icon, overflow menu,
// expand icons on right, footer with count.

import { useMemo, useState } from 'react';
import {
  makeStyles, tokens, SearchBox, Caption1, Tooltip, Button,
  Accordion, AccordionHeader, AccordionItem, AccordionPanel,
  Menu, MenuTrigger, MenuPopover, MenuList, MenuItem,
} from '@fluentui/react-components';
import {
  Checkmark12Regular, Info16Regular, MoreHorizontal20Regular,
} from '@fluentui/react-icons';
import type { MetricCategory, MetricDefinition } from '../../types';

interface ForecastMetricBrowserProps {
  metrics: MetricDefinition[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
  },
  search: {
    paddingBottom: tokens.spacingVerticalS,
    flexShrink: 0,
  },
  searchBox: {
    width: '100%',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    transition: 'background 0.15s',
    ':hover': { background: tokens.colorNeutralBackground3 },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: tokens.colorBrandStroke1,
      outlineOffset: '-2px',
    },
    userSelect: 'none',
  },
  itemSelected: {
    fontWeight: 600,
    borderLeft: `2px solid ${tokens.colorBrandBackground}`,
    paddingLeft: `calc(${tokens.spacingHorizontalS} - 2px)`,
    backgroundColor: tokens.colorNeutralBackground4,
  },
  itemCheck: {
    color: tokens.colorBrandForeground1,
    display: 'flex',
    alignItems: 'center',
    width: '16px',
    flexShrink: 0,
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  itemName: {
    fontSize: '13px',
    fontWeight: 500,
    color: tokens.colorNeutralForeground1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  vizType: {
    color: tokens.colorNeutralForeground3,
    fontWeight: 400,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  itemActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  categoryLabel: {
    fontWeight: 600,
  },
  noResults: {
    padding: tokens.spacingVerticalL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  footer: {
    padding: tokens.spacingVerticalS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: '11px',
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
});

export function ForecastMetricBrowser({ metrics, selectedId, onSelect }: ForecastMetricBrowserProps) {
  const s = useStyles();
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = metrics.filter(m =>
      !q || m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)
    );
    const g: Record<string, MetricDefinition[]> = {};
    for (const m of filtered) {
      (g[m.category] ||= []).push(m);
    }
    return g;
  }, [metrics, query]);

  const cats = Object.keys(grouped) as MetricCategory[];

  return (
    <div className={s.root}>
      <div className={s.search}>
        <SearchBox
          className={s.searchBox}
          value={query}
          onChange={(_, d) => setQuery(d.value)}
          placeholder="Search metrics…"
          size="small"
        />
      </div>

      <div className={s.list} role="list" aria-label="Forecast metrics">
        {cats.length === 0 ? (
          <div className={s.noResults}>
            <Caption1>No metrics match your search.</Caption1>
          </div>
        ) : (
          <Accordion multiple collapsible defaultOpenItems={cats as string[]}>
            {cats.map(cat => (
              <AccordionItem value={cat} key={cat}>
                <AccordionHeader expandIconPosition="end" size="small">
                  <span className={s.categoryLabel}>{cat}</span>
                </AccordionHeader>
                <AccordionPanel>
                  {grouped[cat].map(m => {
                    const isSelected = m.id === selectedId;
                    return (
                      <div
                        key={m.id}
                        className={`${s.item} ${isSelected ? s.itemSelected : ''}`}
                        role="listitem"
                        aria-label={`${m.name} (${m.visualizationType})${isSelected ? ', selected' : ''}`}
                        tabIndex={0}
                        onClick={() => onSelect(m.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelect(m.id);
                          }
                        }}
                      >
                        <span className={s.itemCheck}>
                          {isSelected && <Checkmark12Regular />}
                        </span>
                        <div className={s.itemBody}>
                          <span className={s.itemName}>{m.name}</span>
                          <Caption1 className={s.vizType}>{m.visualizationType}</Caption1>
                        </div>
                        <div
                          className={s.itemActions}
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => e.stopPropagation()}
                        >
                          <Tooltip
                            content={m.description ?? `${m.aggregation} of ${m.sourceField}`}
                            relationship="description"
                            positioning="after"
                          >
                            <Button
                              appearance="subtle"
                              size="small"
                              icon={<Info16Regular />}
                              aria-label={`Info for ${m.name}`}
                            />
                          </Tooltip>
                          <Menu>
                            <MenuTrigger disableButtonEnhancement>
                              <Button
                                appearance="subtle"
                                size="small"
                                icon={<MoreHorizontal20Regular />}
                                aria-label={`More actions for ${m.name}`}
                              />
                            </MenuTrigger>
                            <MenuPopover>
                              <MenuList>
                                <MenuItem onClick={() => onSelect(m.id)}>Select for forecast</MenuItem>
                              </MenuList>
                            </MenuPopover>
                          </Menu>
                        </div>
                      </div>
                    );
                  })}
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>

      <div className={s.footer}>{metrics.length} metrics available</div>
    </div>
  );
}
