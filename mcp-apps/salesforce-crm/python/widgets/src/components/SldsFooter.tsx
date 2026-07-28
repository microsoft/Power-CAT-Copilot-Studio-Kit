import React from 'react';
import { Button, tokens } from '@fluentui/react-components';
import { OpenRegular } from '@fluentui/react-icons';
import { useMcpBridge } from '@gtc/mcp-shared';
import { useStyles } from '../styles';
import { slds } from '../theme';

// ── SldsFooter ─────────────────────────────────────────────────────────────
export function SldsFooter({ theme }: { theme: 'light' | 'dark' }) {
  const styles = useStyles();
  const t = slds(theme);
  const { openExternal } = useMcpBridge();
  return (
    <div className={styles.mcpFooter} style={{ background: tokens.colorNeutralBackground3, borderTop: `1px solid ${t.border}`, color: t.textWeak }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontWeight: 600 }}>MCP</span>
        <span style={{ color: tokens.colorNeutralStroke1 }}>·</span>
        <span>Salesforce CRM</span>
      </span>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <Button appearance="transparent" size="small" icon={<OpenRegular />} onClick={() => openExternal('https://login.salesforce.com')}>
          Open in Salesforce
        </Button>
      </div>
    </div>
  );
}

