import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  tokens,
} from '@fluentui/react-components';
import { BookRegular } from '@fluentui/react-icons';
import { useMcpBridge } from '@gtc/mcp-shared';
import { NowFooter } from '../components/NowFooter';
import { StatePill } from '../components/Pills';
import { ViewHeader } from '../components/ViewHeader';
import { useStyles } from '../styles';
import { now } from '../theme';
import type { KnowledgeArticle } from '../types';

// ── Knowledge View ──────────────────────────────────────────────────────────
export function KnowledgeView({ items, theme, cacheInfo }: { items: KnowledgeArticle[]; theme: 'light' | 'dark'; cacheInfo?: { hit: boolean; cached_at: string } | null }) {
  const styles = useStyles();
  const t = now(theme);
  const { isFullscreen } = useMcpBridge();
  const cellStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: '13px', whiteSpace: 'nowrap',
    maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis',
  };
  const headerCellStyle: React.CSSProperties = {
    fontWeight: 700, fontSize: '11px', textTransform: 'uppercase',
    letterSpacing: '0.5px', padding: '8px 12px', color: t.textWeak,
  };
  const colSpan = isFullscreen ? 7 : 4;

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}`, background: t.surface }}>
      <ViewHeader icon={<BookRegular style={{ fontSize: '18px' }} />} title="Knowledge Articles" count={items.length}
        brand={tokens.colorPaletteTealForeground2}
        cacheInfo={cacheInfo} />

      <Table aria-label="Knowledge articles" size="small" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            <TableHeaderCell style={headerCellStyle}>Number</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Title</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Category</TableHeaderCell>
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Author</TableHeaderCell>}
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Updated On</TableHeaderCell>}
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Views</TableHeaderCell>}
            <TableHeaderCell style={headerCellStyle}>State</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && (
            <TableRow><TableCell colSpan={colSpan} className={styles.empty}><Text>No knowledge articles found.</Text></TableCell></TableRow>
          )}
          {items.map((a, idx) => (
            <TableRow key={a.sys_id} className="snow-row"
              style={{ borderBottom: idx === items.length - 1 ? 'none' : `1px solid ${t.border}` }}>
              <TableCell style={cellStyle}><span style={{ fontFamily: 'monospace', fontWeight: 500, color: tokens.colorBrandForeground1 }}>{a.number}</span></TableCell>
              <TableCell style={{ ...cellStyle, maxWidth: '260px', whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'visible', textOverflow: 'clip', lineHeight: 1.35 }}>{a.short_description || '—'}</TableCell>
              <TableCell style={cellStyle}>{a.category || '—'}</TableCell>
              {isFullscreen && <TableCell style={cellStyle}>{a.author || '—'}</TableCell>}
              {isFullscreen && <TableCell style={cellStyle}>{(a as any).updated_on?.slice(0, 10) || '—'}</TableCell>}
              {isFullscreen && <TableCell style={cellStyle}>{(a as any).view_count || '—'}</TableCell>}
              <TableCell style={cellStyle}><StatePill state={a.state} theme={theme} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <NowFooter theme={theme} />
    </div>
  );
}
