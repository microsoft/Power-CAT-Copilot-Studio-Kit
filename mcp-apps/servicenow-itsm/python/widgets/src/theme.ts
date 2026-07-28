import { tokens } from '@fluentui/react-components';

// ── Global row hover styles ─────────────────────────────────────────────────
export const GLOBAL_STYLES = `
.snow-row:hover { background: var(--colorBrandBackgroundHover); }
[data-theme="dark"] .snow-row:hover { background: var(--colorBrandBackgroundHover); }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;
if (typeof document !== 'undefined' && !document.getElementById('sn-row-hover-styles')) {
  const style = document.createElement('style');
  style.id = 'sn-row-hover-styles';
  style.textContent = GLOBAL_STYLES;
  document.head.appendChild(style);
}

// ── Fluent v9 token shim ────────────────────────────────────────────────────
// FluentProvider drives light/dark via the host's theme context. `now(theme)`
// is kept as a thin alias mapping into Fluent tokens so existing call sites
// keep working with zero edits. Tokens auto-swap on theme change.
export function now(_theme: 'light' | 'dark') {
  return {
    shell:      tokens.colorBrandBackground,
    brand:      tokens.colorBrandBackground,
    bg:         tokens.colorNeutralBackground2,
    surface:    tokens.colorNeutralBackground1,
    text:       tokens.colorNeutralForeground1,
    textWeak:   tokens.colorNeutralForeground3,
    border:     tokens.colorNeutralStroke2,
    p1:         tokens.colorPaletteRedForeground1,
    p2:         tokens.colorPaletteDarkOrangeForeground1,
    p3:         tokens.colorPaletteYellowForeground1,
    p4:         tokens.colorPaletteGreenForeground1,
    success:    tokens.colorPaletteGreenForeground1,
    error:      tokens.colorPaletteRedForeground1,
    headerBg:   tokens.colorNeutralBackground3,
    expandedBg: tokens.colorSubtleBackgroundSelected,
  };
}

export function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5)  return 'just now';
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

// ── Global CSS for Now Design System ────────────────────────────────────────
export const nowStyleId = 'now-global-style';
if (typeof document !== 'undefined' && !document.getElementById(nowStyleId)) {
  const style = document.createElement('style');
  style.id = nowStyleId;
  style.textContent = `
    @keyframes snowRowFlash {
      0%   { background: var(--colorPaletteGreenBackground1); }
      100% { background: transparent; }
    }
    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .snow-edit-btn:hover {
      color: var(--colorBrandForeground1) !important;
      border-color: var(--colorBrandForeground1) !important;
    }
    .fui-Input:focus-within {
      box-shadow: 0 0 3px var(--colorBrandStroke1);
      border-color: var(--colorBrandStroke1);
    }
    select:focus {
      outline: none;
      box-shadow: 0 0 3px var(--colorBrandStroke1);
      border-color: var(--colorBrandStroke1) !important;
    }
    .skel {
      height: 14px;
      border-radius: 4px;
      background: linear-gradient(90deg, var(--colorNeutralBackground3) 25%, var(--colorNeutralBackground1) 50%, var(--colorNeutralBackground3) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }
  `;
  document.head.appendChild(style);
}
