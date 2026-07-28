import { makeStyles, tokens } from '@fluentui/react-components';

// ── Styles ─────────────────────────────────────────────────────────────────
export const useStyles = makeStyles({
  shell: {
    margin: '0 auto',
    padding: '16px',
    fontFamily: tokens.fontFamilyBase,
    fontSize: '13px',
    color: tokens.colorNeutralForeground1,
  },
  card: {
    borderRadius: '6px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    overflowX: 'auto' as const,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  headerBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    color: '#fff',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerCell: {
    fontWeight: 700 as any,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    padding: '8px 12px',
    color: tokens.colorNeutralForeground3,
  },
  cell: {
    padding: '8px 12px',
    verticalAlign: 'middle',
    fontSize: '13px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    maxWidth: '180px',
    color: tokens.colorNeutralForeground1,
  },
  formPanel: {
    padding: '16px',
    borderLeft: `4px solid ${tokens.colorBrandBackground}`,
  },
  formTitle: {
    fontSize: '15px',
    fontWeight: 700 as any,
    marginBottom: '12px',
    color: tokens.colorNeutralForeground1,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px 12px',
    marginBottom: '12px',
  },
  formActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  empty: {
    padding: '16px',
    textAlign: 'center' as const,
    fontSize: '13px',
  },
  mcpFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    fontSize: '12px',
  },
  subTableWrap: {
    padding: '12px 16px',
  },
});
