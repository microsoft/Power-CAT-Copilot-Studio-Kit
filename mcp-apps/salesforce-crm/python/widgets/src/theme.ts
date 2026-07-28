import { tokens } from '@fluentui/react-components';

// ── Global row hover styles ────────────────────────────────────────────────────
export const GLOBAL_STYLES = `
.slds-row:hover { background: var(--colorBrandBackgroundHover); }
[data-theme="dark"] .slds-row:hover { background: var(--colorBrandBackgroundHover); }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;
if (typeof document !== 'undefined' && !document.getElementById('sf-row-hover-styles')) {
  const style = document.createElement('style');
  style.id = 'sf-row-hover-styles';
  style.textContent = GLOBAL_STYLES;
  document.head.appendChild(style);
}

// ── Fluent v9 token shim ────────────────────────────────────────────────────
// FluentProvider already drives light/dark via the host's theme context.
// `slds(theme)` is kept as a thin alias mapping into Fluent tokens so that
// every existing call site continues to work without further edits.
export function slds(_theme: 'light' | 'dark') {
  return {
    brand:        tokens.colorBrandBackground,
    brandHover:   tokens.colorBrandBackgroundHover,
    accent:       tokens.colorBrandForegroundLink,
    background:   tokens.colorNeutralBackground2,
    surface:      tokens.colorNeutralBackground1,
    text:         tokens.colorNeutralForeground1,
    textWeak:     tokens.colorNeutralForeground3,
    border:       tokens.colorNeutralStroke2,
    headerBg:     tokens.colorNeutralBackground3,
    success:      tokens.colorPaletteGreenForeground1,
    danger:       tokens.colorPaletteRedForeground1,
    warn:         tokens.colorPaletteDarkOrangeForeground1,
  };
}

export function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5)  return 'just now';
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

// ── Global CSS ─────────────────────────────────────────────────────────────
const _styleId = 'slds-global-style';
if (typeof document !== 'undefined' && !document.getElementById(_styleId)) {
  const s = document.createElement('style');
  s.id = _styleId;
  s.textContent = `
    @keyframes sfRowFlash { 0%{background:var(--colorPaletteGreenBackground2)}100%{background:transparent} }
    .slds-row:hover { background: var(--colorNeutralBackground2Hover); }
    .slds-edit-btn:hover { color: var(--colorBrandBackground) !important; border-color: var(--colorBrandBackground) !important; }
    .fui-Input:focus-within { box-shadow: 0 0 3px var(--colorBrandBackground); border-color: var(--colorBrandBackground); }
    select:focus { outline: none; box-shadow: 0 0 3px var(--colorBrandBackground); border-color: var(--colorBrandBackground) !important; }
  `;
  document.head.appendChild(s);
}
