import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Card,
  Link,
  makeStyles,
  mergeClasses,
  Subtitle2,
  tokens,
} from '@fluentui/react-components';
import {
  Beaker24Regular,
  Bot24Regular,
  BotSparkle24Regular,
  Braces24Regular,
  BrainCircuit24Regular,
  Copy20Regular,
  DataUsage24Regular,
  Document24Regular,
  Globe24Regular,
  PlugConnected24Regular,
  Timer24Regular,
  Wrench24Regular,
} from '@fluentui/react-icons';
import { useEffect, useRef, useState } from 'react';
import type { AgentComponentSection, AgentComponentSectionKey } from '../../contracts/types';
import { useAgentInventorySurfaceStyles } from '../../styles/surfaceStyles';

type CopyStatus = {
  id: number;
  sectionKey: AgentComponentSectionKey;
  intent: 'success' | 'error';
  message: string;
};

function assertNever(value: never): never {
  throw new Error(`Unhandled agent component section: ${String(value)}`);
}

const useStyles = makeStyles({
  root: {
    width: '100%',
  },
  groups: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  section: {
    width: '100%',
    boxSizing: 'border-box',
    padding: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  accordionItem: {
    width: '100%',
  },
  header: {
    backgroundColor: tokens.colorNeutralBackground2,
    '& button': {
      minHeight: '72px',
      padding: tokens.spacingVerticalM,
    },
  },
  headerCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  sectionIcon: {
    width: '40px',
    height: '40px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.borderRadiusLarge,
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
  },
  panel: {
    padding: 0,
    margin: 0,
  },
  list: {
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
    minHeight: '56px',
    boxSizing: 'border-box',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  itemIcon: {
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorBrandForeground1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  itemTitle: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemDescription: {
    color: tokens.colorNeutralForeground2,
    display: '-webkit-box',
    overflow: 'hidden',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflowWrap: 'anywhere',
  },
  rawContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    minWidth: 0,
    padding: `0 ${tokens.spacingHorizontalL} ${tokens.spacingVerticalM}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
  },
  rawToolbar: {
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalM,
  },
  copyStatus: {
    flex: '1 1 0',
    minWidth: 0,
    color: tokens.colorNeutralForeground2,
  },
  copyStatusError: {
    color: tokens.colorPaletteRedForeground1,
  },
  copyButton: {
    flex: '0 0 auto',
    minWidth: '44px',
    minHeight: '44px',
  },
  rawSurface: {
    boxSizing: 'border-box',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    margin: 0,
    padding: tokens.spacingVerticalS,
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    color: tokens.colorNeutralForeground3,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
  },
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
});

function sectionIcon(key: AgentComponentSectionKey) {
  switch (key) {
    case 'knowledge': return <Document24Regular />;
    case 'prompts': return <BrainCircuit24Regular />;
    case 'triggers': return <Timer24Regular />;
    case 'classic': return <DataUsage24Regular />;
    case 'http': return <Braces24Regular />;
    case 'connections': return <PlugConnected24Regular />;
    case 'skills': return <BotSparkle24Regular />;
    case 'evaluations': return <Beaker24Regular />;
    case 'mcp': return <Wrench24Regular />;
    case 'connectedAgents': return <Bot24Regular />;
    default: return assertNever(key);
  }
}

function ComponentCard({
  section,
  raw,
  copyStatus,
  onCopy,
}: {
  section: AgentComponentSection;
  raw: boolean;
  copyStatus?: CopyStatus;
  onCopy: (section: AgentComponentSection) => Promise<void>;
}) {
  const styles = useStyles();
  const surfaceStyles = useAgentInventorySurfaceStyles();
  const sectionStatus = copyStatus?.sectionKey === section.key ? copyStatus : undefined;
  return (
    <Card className={mergeClasses(surfaceStyles.section, styles.section)}>
      <AccordionItem value={section.key} className={styles.accordionItem}>
        <AccordionHeader
          className={styles.header}
          as="h2"
          expandIconPosition="end"
          size="large"
          icon={<span className={styles.sectionIcon} aria-hidden="true">{sectionIcon(section.key)}</span>}
        >
          <span className={styles.headerCopy}>
            <Subtitle2>{section.title}</Subtitle2>
            <Caption1>{section.description}</Caption1>
          </span>
        </AccordionHeader>
        <AccordionPanel className={styles.panel}>
          {raw && section.rawJson ? (
            <div className={styles.rawContent}>
              <div className={styles.rawToolbar}>
                {sectionStatus && (
                  <Body1
                    aria-hidden="true"
                    className={mergeClasses(
                      styles.copyStatus,
                      sectionStatus.intent === 'error' && styles.copyStatusError,
                    )}
                  >
                    {sectionStatus.message}
                  </Body1>
                )}
                <Button
                  className={styles.copyButton}
                  appearance="subtle"
                  icon={<Copy20Regular />}
                  aria-label={`Copy ${section.title} JSON`}
                  onClick={() => void onCopy(section)}
                >
                  Copy
                </Button>
              </div>
              <pre className={styles.rawSurface}><code>{section.rawJson}</code></pre>
            </div>
          ) : (
            <ul className={styles.list}>
              {section.items.map((item) => {
                const summary = [item.description, item.detail !== item.description ? item.detail : undefined]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={item.id} className={styles.item}>
                    <span className={styles.itemIcon} aria-hidden="true">
                      {item.url ? <Globe24Regular /> : sectionIcon(section.key)}
                    </span>
                    <span className={styles.itemCopy}>
                      {item.url ? (
                        <Link className={styles.itemTitle} href={item.url} target="_blank" rel="noreferrer">
                          <Body1Strong>{item.name}</Body1Strong>
                        </Link>
                      ) : <Body1Strong className={styles.itemTitle}>{item.name}</Body1Strong>}
                      {summary && <Caption1 className={styles.itemDescription}>{summary}</Caption1>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </AccordionPanel>
      </AccordionItem>
    </Card>
  );
}

export function AgentComponentsTab({
  sections,
  raw,
}: {
  sections: AgentComponentSection[];
  raw: boolean;
}) {
  const styles = useStyles();
  const [openItems, setOpenItems] = useState<unknown>(
    sections.find((section) => section.items.length > 0)?.key,
  );
  const [copyStatus, setCopyStatus] = useState<CopyStatus>();
  const statusTimerRef = useRef<number | undefined>(undefined);
  const statusIdRef = useRef(0);
  const displaySections = sections.filter((section) =>
    raw ? section.rawJson !== undefined : section.items.length > 0
  );

  useEffect(() => () => {
    if (statusTimerRef.current !== undefined) window.clearTimeout(statusTimerRef.current);
  }, []);

  const handleCopy = async (section: AgentComponentSection) => {
    if (!section.rawJson) return;
    if (statusTimerRef.current !== undefined) window.clearTimeout(statusTimerRef.current);
    setCopyStatus(undefined);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable');
      await navigator.clipboard.writeText(section.rawJson);
      setCopyStatus({
        id: ++statusIdRef.current,
        sectionKey: section.key,
        intent: 'success',
        message: `${section.title} JSON copied`,
      });
    } catch {
      setCopyStatus({
        id: ++statusIdRef.current,
        sectionKey: section.key,
        intent: 'error',
        message: `Couldn't copy ${section.title} JSON`,
      });
    }
    statusTimerRef.current = window.setTimeout(() => setCopyStatus(undefined), 4000);
  };

  return (
    <div className={styles.root}>
      <Accordion
        collapsible
        openItems={openItems}
        onToggle={(_, data) => setOpenItems(data.openItems)}
        aria-label="Component groups"
      >
        <div className={styles.groups}>
          {displaySections.map((section) => (
            <ComponentCard
              key={section.key}
              section={section}
              raw={raw}
              copyStatus={copyStatus}
              onCopy={handleCopy}
            />
          ))}
        </div>
      </Accordion>
      <span
        key={copyStatus?.id}
        className={styles.visuallyHidden}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {copyStatus?.message}
      </span>
    </div>
  );
}
