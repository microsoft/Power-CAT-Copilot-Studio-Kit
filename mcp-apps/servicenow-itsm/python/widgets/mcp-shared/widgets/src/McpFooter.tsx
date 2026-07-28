import React from 'react';
import { Text } from '@fluentui/react-components';
import { useMcpBridge } from './McpBridge';

export function McpFooter({ label, openInUrl, openInLabel }: { label: string; openInUrl?: string; openInLabel?: string }) {
  const { openExternal } = useMcpBridge();

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', marginTop: '12px', borderTop: '1px solid var(--colorNeutralStroke2)',
      fontSize: '11px', opacity: 0.7
    }}>
      <Text size={100}>MCP Widget · {label}</Text>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {openInUrl && (
          <Text size={100}
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => openExternal(openInUrl)}
          >
            {openInLabel || 'Open in portal'} ↗
          </Text>
        )}
        <Text size={100}>GTC</Text>
      </div>
    </div>
  );
}
