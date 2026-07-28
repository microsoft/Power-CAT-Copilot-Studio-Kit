import { tokens } from '@fluentui/react-components';
import {
  APPROVAL_STYLES,
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  RISK_LABELS,
  RISK_STYLES,
  STATE_STYLES,
} from '../constants';

export function PriorityPill({ priority, theme }: { priority: string; theme: 'light' | 'dark' }) {
  const key = String(priority).charAt(0);
  const style = PRIORITY_STYLES[key] || PRIORITY_STYLES['3'];
  return (
    <span style={{
      display: 'inline-block', padding: '4px 12px', borderRadius: '4px',
      fontSize: '12px', fontWeight: 600, letterSpacing: '0.2px',
      background: style.background, color: style.color, border: `1px solid ${style.border}`,
    }}>
      {PRIORITY_LABELS[key] || priority || '—'}
    </span>
  );
}

export function StatePill({ state, theme }: { state: string; theme: 'light' | 'dark' }) {
  const key = (state || '').toLowerCase();
  const style = STATE_STYLES[key] || { background: tokens.colorNeutralBackground2, color: tokens.colorNeutralForeground2, border: tokens.colorNeutralStroke2 };
  return (
    <span style={{
      display: 'inline-block', padding: '4px 12px', borderRadius: '4px',
      fontSize: '12px', fontWeight: 500,
      background: style.background, color: style.color, border: `1px solid ${style.border}`,
    }}>
      {state || '—'}
    </span>
  );
}

export function ApprovalPill({ approval, theme }: { approval: string; theme: 'light' | 'dark' }) {
  const key = (approval || '').toLowerCase();
  const style = APPROVAL_STYLES[key] || APPROVAL_STYLES['not requested'];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: '15px',
      fontSize: '11px', fontWeight: 500,
      background: style.background, color: style.color, border: `1px solid ${style.border}`,
    }}>
      {approval || '—'}
    </span>
  );
}

export function RiskPill({ risk, theme }: { risk: string; theme: 'light' | 'dark' }) {
  const key = (risk || '').toLowerCase();
  const style = RISK_STYLES[key] || RISK_STYLES['medium'];
  const label = RISK_LABELS[risk] || risk;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: '15px',
      fontSize: '11px', fontWeight: 500,
      background: style.background, color: style.color, border: `1px solid ${style.border}`,
    }}>
      {label || '—'}
    </span>
  );
}
