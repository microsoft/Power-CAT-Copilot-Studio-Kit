import { makeStyles, tokens } from '@fluentui/react-components';
import { formatMessageText } from '../../utils/formatMessageText';

const useStyles = makeStyles({
  root: {
    '& a': { color: 'inherit', textDecorationLine: 'underline' },
    '& code': {
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
      padding: '2px 6px',
      borderRadius: '3px',
      fontFamily: 'Consolas, Monaco, monospace',
      fontSize: '13px',
    },
    '& pre': {
      backgroundColor: tokens.colorNeutralBackground6,
      color: tokens.colorNeutralForeground4,
      padding: tokens.spacingVerticalM,
      borderRadius: tokens.borderRadiusLarge,
      maxWidth: '100%',
      overflowX: 'auto',
      margin: `${tokens.spacingVerticalS} 0`,
    },
    '& pre code': { backgroundColor: 'transparent', padding: 0 },
    '& h1, & h2, & h3': {
      margin: `${tokens.spacingVerticalS} 0 ${tokens.spacingVerticalXS}`,
      fontWeight: tokens.fontWeightSemibold,
      lineHeight: 1.3,
    },
    '& h1': { fontSize: tokens.fontSizeBase500 },
    '& h2': { fontSize: tokens.fontSizeBase400 },
    '& h3': { fontSize: tokens.fontSizeBase300 },
    '& ul, & ol': { margin: `${tokens.spacingVerticalXS} 0`, paddingLeft: tokens.spacingHorizontalXL },
    '& li': { marginBottom: tokens.spacingVerticalXXS },
    '& blockquote': {
      margin: `${tokens.spacingVerticalSNudge} 0`,
      padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalMNudge}`,
      borderLeft: `3px solid ${tokens.colorBrandForeground1}`,
      color: tokens.colorNeutralForeground2,
      fontStyle: 'italic',
    },
    '& hr': {
      border: 'none',
      borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
      margin: `${tokens.spacingVerticalS} 0`,
    },
    '& table': {
      display: 'block',
      borderCollapse: 'collapse',
      width: '100%',
      maxWidth: '100%',
      overflowX: 'auto',
      margin: `${tokens.spacingVerticalS} 0`,
      fontSize: '13px',
    },
    '& th, & td': {
      border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
      padding: '5px 10px',
      textAlign: 'left',
    },
    '& th': { backgroundColor: tokens.colorNeutralBackground3, fontWeight: tokens.fontWeightSemibold },
    '& tr:nth-child(even) td': { backgroundColor: tokens.colorNeutralBackground2 },
    '& > :first-child': { marginTop: 0 },
    '& > :last-child': { marginBottom: 0 },
  },
});

/** Render transcript Markdown using Analyzer-owned formatting and scoped styles. */
export function MarkdownContent({ text }: { text: string }) {
  const styles = useStyles();
  if (!text) return null;
  return <div className={styles.root} dangerouslySetInnerHTML={{ __html: formatMessageText(text) }} />;
}
