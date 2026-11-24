/**
 * RadialGauge Component
 *
 * SVG-based circular gauge displaying score 0-100% with color coding.
 * All colors meet WCAG AA contrast (≥4.5:1 on white).
 *
 * Colors:
 * - Pass (≥80): #107C10 (Green, 5.9:1)
 * - Warning (60-79): #B7580A (Amber, 4.76:1) — Fluent colorStatusWarningForeground1
 * - Fail (<60): #C50F1F (Red, 5.9:1)
 */

import React from 'react';
import { makeStyles } from '@fluentui/react-components';

export interface RadialGaugeProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  svg: {
    transform: 'rotate(-90deg)',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
  },
});

function getScoreColor(score: number): string {
  if (score >= 80) return '#107c10'; // Green — Pass  (5.4:1 on white, WCAG AA)
  if (score >= 60) return '#b7580a'; // Amber — Warning (4.76:1, colorStatusWarningForeground1)
  return '#c50f1f';                  // Red — Fail (6.1:1, colorStatusDangerForeground1)
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Pass';
  if (score >= 60) return 'Warning';
  return 'Fail';
}

export function RadialGauge({ score, size = 160, strokeWidth = 16 }: RadialGaugeProps) {
  const styles = useStyles();
  const clampedScore = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedScore / 100) * circumference;
  const color = getScoreColor(clampedScore);
  const label = getScoreLabel(clampedScore);
  const centerFontSize = size * 0.22;

  return (
    <div className={styles.root}>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={`Score: ${Math.round(clampedScore)} out of 100 — ${label}`}
        className={styles.svg}
      >
        <title>{`Score: ${Math.round(clampedScore)} out of 100 — ${label}`}</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#edebe9"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease-in-out, stroke 0.3s ease' }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          style={{
            fontSize: `${centerFontSize}px`,
            fontWeight: 600,
            transform: 'rotate(90deg)',
            transformOrigin: 'center',
            transition: 'fill 0.3s ease',
          }}
        >
          {Math.round(clampedScore)}%
        </text>
      </svg>
      <div aria-hidden="true" className={styles.label} style={{ color }}>
        {label}
      </div>
    </div>
  );
}
