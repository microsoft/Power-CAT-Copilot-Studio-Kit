/**
 * ComponentGallery — Renders the Agent Library card grid.
 *
 * Supports two modes:
 * - Two-section layout ("All" tab): templates section + components section
 * - Single grid (filtered by tab): templates-only or components-only
 */

import {
  makeStyles,
  tokens,
  Body1,
  Button,
  Subtitle2Stronger,
  Tooltip,
} from '@fluentui/react-components';
import { Info16Regular } from '@fluentui/react-icons';
import { CopilotCard } from './CopilotCard';
import type { CatalogItem } from '../contracts/types';

interface ComponentGalleryProps {
  items: CatalogItem[];
  onCardClick: (item: CatalogItem) => void;
  onClearFilters: () => void;
  /** When provided, template cards show an edit button wired to this handler. */
  onCardEdit?: (item: CatalogItem) => void;
  /** When true, show two sections (templates + components) */
  showSections?: boolean;
}

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  infoIcon: {
    color: tokens.colorNeutralForeground4,
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    alignContent: 'flex-start',
  },
  cardWrapper: {
    flex: '1 0 0',
    minWidth: '350px',
    maxWidth: 'calc((100% - 32px) / 3)',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalXXL}`,
    color: tokens.colorNeutralForeground2,
    textAlign: 'center',
  },
});

export default function ComponentGallery({
  items,
  onCardClick,
  onClearFilters,
  onCardEdit,
  showSections = false,
}: ComponentGalleryProps) {
  const styles = useStyles();

  if (items.length === 0) {
    return (
      <div className={styles.emptyState} role="status" aria-live="polite">
        <Body1>No items match your search or filter.</Body1>
        <Button appearance="secondary" onClick={onClearFilters}>
          Clear filters
        </Button>
      </div>
    );
  }

  if (showSections) {
    const templates = items.filter((i) => i.type === 'template');
    const components = items.filter((i) => i.type === 'component');
    const mcpApps = items.filter((i) => i.type === 'mcp-app');

    return (
      <div className={styles.container}>
        {templates.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Subtitle2Stronger>Start with an agent template</Subtitle2Stronger>
              <Tooltip
                content="Agent templates are pre-built agents you can deploy directly to your environment."
                relationship="description"
                withArrow
              >
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<Info16Regular className={styles.infoIcon} />}
                  aria-label="Agent templates info"
                  style={{ background: 'transparent', minWidth: 'auto' }}
                />
              </Tooltip>
            </div>
            <div className={styles.grid} role="list" aria-label="Agent templates">
              {templates.map((item) => (
                <div key={item.id} role="listitem" className={styles.cardWrapper}>
                  <CopilotCard
                    item={item}
                    onClick={() => onCardClick(item)}
                    onEdit={onCardEdit ? () => onCardEdit(item) : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {components.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Subtitle2Stronger>Build with reusable components</Subtitle2Stronger>
              <Tooltip
                content="Component collections provide reusable building blocks for your agents."
                relationship="description"
                withArrow
              >
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<Info16Regular className={styles.infoIcon} />}
                  aria-label="Reusable components info"
                  style={{ background: 'transparent', minWidth: 'auto' }}
                />
              </Tooltip>
            </div>
            <div className={styles.grid} role="list" aria-label="Reusable components">
              {components.map((item) => (
                <div key={item.id} role="listitem" className={styles.cardWrapper}>
                  <CopilotCard item={item} onClick={() => onCardClick(item)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {mcpApps.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Subtitle2Stronger>Start with an MCP app</Subtitle2Stronger>
              <Tooltip
                content="MCP apps are downloadable Model Context Protocol packages you can register with your agent."
                relationship="description"
                withArrow
              >
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<Info16Regular className={styles.infoIcon} />}
                  aria-label="MCP apps info"
                  style={{ background: 'transparent', minWidth: 'auto' }}
                />
              </Tooltip>
            </div>
            <div className={styles.grid} role="list" aria-label="MCP apps">
              {mcpApps.map((item) => (
                <div key={item.id} role="listitem" className={styles.cardWrapper}>
                  <CopilotCard item={item} onClick={() => onCardClick(item)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.grid} role="list" aria-label="Agent library gallery">
      {items.map((item) => (
        <div key={item.id} role="listitem" className={styles.cardWrapper}>
          <CopilotCard
            item={item}
            onClick={() => onCardClick(item)}
            onEdit={onCardEdit ? () => onCardEdit(item) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
