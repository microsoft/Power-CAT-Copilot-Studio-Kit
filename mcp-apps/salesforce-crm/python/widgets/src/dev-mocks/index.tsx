// Dev-mode replacement for `@gtc/mcp-shared`.
// When vite.config.ts is in serve mode, the alias maps `@gtc/mcp-shared` to this file.
// In production builds (vite build) the alias is OFF and the real package is used.

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { FluentProvider, webLightTheme, webDarkTheme, Text, Button } from '@fluentui/react-components';
import { ArrowMaximizeRegular, ArrowMinimizeRegular } from '@fluentui/react-icons';
import { mockCallTool } from './mock-call-tool';

// Pass-through ONLY components that do NOT use bridge hooks internally.
// FluentWrapper / ExpandButton / McpFooter from the real package each call
// useMcpBridge or useTheme — those hooks read the REAL McpBridgeContext,
// not the mock Ctx defined below — so importing them here would crash with
// "useMcpBridge must be inside McpBridgeProvider". We re-implement them
// in this file instead so they bind to the mock context.
export { ToastContainer, useToast } from '@gtc/mcp-shared/widgets/src/Toast';
export { ErrorBoundary } from '@gtc/mcp-shared/widgets/src/ErrorBoundary';
export { FkHint } from '@gtc/mcp-shared/widgets/src/FkHint';

// ── Mock McpBridge ─────────────────────────────────────────────────────────
interface BridgeCtx {
  toolData: any;
  theme: 'light' | 'dark';
  callTool: (name: string, args?: Record<string, any>) => Promise<any>;
  notifyHeight: () => void;
  openExternal: (url: string) => void;
  requestFullscreen: () => void;
  exitFullscreen: () => void;
  isFullscreen: boolean;
  canExpand: boolean;
  isConnected: boolean;
  isLoading: boolean;
}

const Ctx = createContext<BridgeCtx | null>(null);

export function McpBridgeProvider({ children }: { appName?: string; children: React.ReactNode }) {
  const [toolData, setToolData] = useState<any>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const u = new URL(window.location.href);
    return u.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Honor ?tool=sf__get_accounts&arg.name=Florida to deep-link a starting view.
  // Default landing view: leads.
  useEffect(() => {
    const u = new URL(window.location.href);
    const tool = u.searchParams.get('tool') || 'sf__get_leads';
    const args: Record<string, string> = {};
    for (const [k, v] of u.searchParams.entries()) {
      if (k.startsWith('arg.')) args[k.slice(4)] = v;
    }
    mockCallTool(tool, args).then(setToolData);
  }, []);

  const callTool = useCallback(async (name: string, args?: Record<string, any>) => {
    const result = await mockCallTool(name, args);
    setToolData(result);
    return result;
  }, []);

  const ctxValue: BridgeCtx = {
    toolData,
    theme,
    callTool,
    notifyHeight: () => {},
    openExternal: (url) => window.open(url, '_blank'),
    requestFullscreen: () => setIsFullscreen(true),
    exitFullscreen: () => setIsFullscreen(false),
    isFullscreen,
    canExpand: true,
    isConnected: true,
    isLoading: false,
  };

  return (
    <Ctx.Provider value={ctxValue}>
      <DevToolbar theme={theme} setTheme={setTheme} callTool={callTool} />
      {children}
    </Ctx.Provider>
  );
}

export function useMcpBridge() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useMcpBridge must be inside McpBridgeProvider');
  return c;
}

export function useToolData<T = any>(): T | null {
  return useMcpBridge().toolData as T | null;
}

export function useTheme(): 'light' | 'dark' {
  return useMcpBridge().theme;
}

// ── Mock FluentWrapper (uses the mock useTheme above) ──────────────────────
export function FluentWrapper({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <FluentProvider theme={theme === 'dark' ? webDarkTheme : webLightTheme} style={{ background: 'transparent' }}>
      {children}
    </FluentProvider>
  );
}

// ── Mock ExpandButton (uses the mock useMcpBridge above) ───────────────────
export function ExpandButton() {
  const { canExpand, isFullscreen, requestFullscreen, exitFullscreen } = useMcpBridge();
  if (!canExpand) return null;
  return (
    <Button
      appearance="subtle"
      size="small"
      icon={isFullscreen ? <ArrowMinimizeRegular /> : <ArrowMaximizeRegular />}
      onClick={isFullscreen ? exitFullscreen : requestFullscreen}
      aria-label={isFullscreen ? 'Exit expanded view' : 'Expand'}
      title={isFullscreen ? 'Exit expanded view' : 'Expand'}
    />
  );
}

// ── Mock McpFooter (uses the mock useMcpBridge above) ──────────────────────
export function McpFooter({ label, openInUrl, openInLabel }: { label: string; openInUrl?: string; openInLabel?: string }) {
  const { openExternal } = useMcpBridge();
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', marginTop: '12px', borderTop: '1px solid var(--colorNeutralStroke2)',
      fontSize: '11px', opacity: 0.7,
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

// ── Dev toolbar (not part of @gtc/mcp-shared surface) ──────────────────────
function DevToolbar({ theme, setTheme, callTool }: {
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  callTool: (name: string, args?: any) => Promise<any>;
}) {
  const views: { label: string; tool: string }[] = [
    { label: 'Leads',         tool: 'sf__get_leads' },
    { label: 'Accounts',      tool: 'sf__get_accounts' },
    { label: 'Contacts',      tool: 'sf__get_contacts' },
    { label: 'Opportunities', tool: 'sf__get_opportunities' },
    { label: 'Cases',         tool: 'sf__get_cases' },
    { label: 'Tasks',         tool: 'sf__get_tasks' },
    { label: 'Campaigns',     tool: 'sf__get_campaigns' },
    { label: 'Approvals',     tool: 'sf__get_pending_approvals' },
    { label: 'Pipeline',      tool: 'sf__get_pipeline_dashboard' },
  ];
  return (
    <div style={{
      position: 'sticky', top: 0, left: 0, right: 0, zIndex: 9999,
      display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '6px 10px',
      background: theme === 'dark' ? '#1f1f1f' : '#f4f4f4',
      borderBottom: '1px solid ' + (theme === 'dark' ? '#3a3a3a' : '#d0d0d0'),
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '12px',
    }}>
      <span style={{ fontWeight: 600, marginRight: '4px', color: theme === 'dark' ? '#eee' : '#222' }}>DEV</span>
      {views.map(v => (
        <button
          key={v.tool}
          onClick={() => callTool(v.tool)}
          style={{
            padding: '3px 8px', border: '1px solid ' + (theme === 'dark' ? '#555' : '#bbb'),
            background: theme === 'dark' ? '#2b2b2b' : '#fff', color: theme === 'dark' ? '#eee' : '#222',
            borderRadius: '3px', cursor: 'pointer', fontSize: '11px',
          }}
        >{v.label}</button>
      ))}
      <button
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        style={{
          marginLeft: 'auto', padding: '3px 8px',
          border: '1px solid ' + (theme === 'dark' ? '#555' : '#bbb'),
          background: theme === 'dark' ? '#2b2b2b' : '#fff', color: theme === 'dark' ? '#eee' : '#222',
          borderRadius: '3px', cursor: 'pointer', fontSize: '11px',
        }}
      >{theme === 'light' ? 'Dark' : 'Light'}</button>
    </div>
  );
}
