import { useMemo, type ReactNode } from 'react';
import { mergeClasses } from '@fluentui/react-components';
import {
  Database20Regular,
  Info16Regular,
  Info20Regular,
  Sparkle20Regular,
  Warning20Filled,
} from '@fluentui/react-icons';

import type { ProcessedTranscript } from '../../contracts/transcript';
import type { OrchestrationEngine } from '../../utils/transcript/detect-orchestration-engine';
import { deriveUsageInsights, type Confidence } from '../../utils/usage-insights';
import {
  badgeToneClass,
  type BadgeTone,
  useSurfaceStyles,
} from '../../styles/useSurfaceStyles';

const CONFIDENCE_TONE: Record<Confidence, BadgeTone> = {
  High: 'ok',
  Medium: 'warn',
  Low: 'err',
  None: 'neutral',
};

export interface UsageCreditsTabProps {
  transcript: ProcessedTranscript;
  engine: OrchestrationEngine;
  totalTokensUsed?: number;
}

function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  const surface = useSurfaceStyles();
  return (
    <span className={mergeClasses(surface.badge, badgeToneClass(surface, tone), 'w-badge')}>
      {children}
    </span>
  );
}

function Card({
  className,
  icon,
  title,
  actions,
  children,
}: {
  className?: string;
  icon?: ReactNode;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={mergeClasses('w-card', className)}>
      <header>
        <h2>
          {icon}
          {title}
        </h2>
        {actions ?? null}
      </header>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  note = '',
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return (
    <div className="w-ustat">
      <div className="v">{value}</div>
      <div className="k">{label}</div>
      {note ? <div className="n">{note}</div> : null}
    </div>
  );
}

/**
 * Tab 5 — Usage & credits.
 *
 * Mirrors the prototype's `renderUsageQuality()` DOM and uses the matching
 * `deriveUsageInsights()` calculation port.
 */
export function UsageCreditsTab({ transcript, engine, totalTokensUsed }: UsageCreditsTabProps) {
  const usage = useMemo(
    () => deriveUsageInsights(transcript, engine, totalTokensUsed ?? 0),
    [transcript, engine, totalTokensUsed],
  );

  const fmt = (value: number) =>
    Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div>
      <div className="w-note w-usage-note" role="note">
        <Info20Regular className="w-ic" aria-hidden="true" />
        <span>
          <b>Use this as a diagnostic estimate, not a billing statement.</b> Reported credits come
          directly from transcript payloads. Estimated credits apply published rates only where
          runtime evidence is available; unavailable meters and billing conditions are excluded
          rather than assumed.
        </span>
      </div>

      <div className={usage.directRecords ? 'w-insight-grid' : 'w-insight-grid single'}>
        <Card
          title="Estimated Copilot Credits"
          icon={<Sparkle20Regular className="w-ic" aria-hidden="true" />}
          actions={
            <Badge tone={CONFIDENCE_TONE[usage.estimateConfidence]}>
              {usage.estimateConfidence} confidence
            </Badge>
          }
        >
          <div className="body">
            <div className="w-credit-total">
              <span className="v">{fmt(usage.estimated)}</span>
              <span>credits</span>
            </div>
            <div className="w-credit-lines">
              {usage.groups.length ? (
                usage.groups.map((group) => (
                  <div key={group.kind} className="w-credit-line">
                    <span className="nm">
                      {group.label}
                      <small>
                        <Badge tone={CONFIDENCE_TONE[group.confidence]}>
                          {group.confidence}
                        </Badge>
                        {group.evidence}
                      </small>
                    </span>
                    <span className="calc">
                      {group.count} × {group.rate}
                    </span>
                    <b>{fmt(group.credits)}</b>
                  </div>
                ))
              ) : (
                <div className="w-muted">No estimable runtime events were detected.</div>
              )}
            </div>
            {!usage.directRecords ? (
              <div className="w-report-empty">
                <Info16Regular className="w-ic" aria-hidden="true" />
                <span>
                  <b>No reported usage data.</b> This transcript does not contain direct credit
                  values.
                </span>
              </div>
            ) : null}
          </div>
        </Card>

        {usage.directRecords ? (
          <Card
            title="Transcript-reported usage"
            icon={<Database20Regular className="w-ic" aria-hidden="true" />}
            actions={<Badge tone="ok">Reported</Badge>}
          >
            <div className="body">
              <div className="w-credit-total">
                <span className="v">{fmt(usage.actualCredits)}</span>
                <span>credits</span>
              </div>
              <p className="w-usage-copy">
                {usage.directRecords} direct usage payload
                {usage.directRecords === 1 ? '' : 's'} found. These values are shown separately
                and are not replaced by the estimate.
              </p>
            </div>
            <div className="w-ustats">
              <Stat
                label="Usage records"
                value={usage.directRecords}
                note={usage.directRecords ? 'Direct payload values' : 'Not emitted'}
              />
              <Stat
                label="Tokens"
                value={usage.tokens ? usage.tokens.toLocaleString() : '—'}
                note={usage.tokens ? 'Direct transcript count' : 'Not emitted'}
              />
              <Stat label="Model" value={usage.modelName ?? '—'} />
              <Stat
                label="Designer"
                value={engine === 'classic' ? 'Old / classic' : 'New / generative'}
              />
            </div>
            <div className="body">
              <dl className="w-kv compact">
                <dt>Copilot credits</dt>
                <dd>{usage.directCopilot || 'not present'}</dd>
                <dt>AI Builder credits</dt>
                <dd>{usage.directAiBuilder || 'not present'}</dd>
                <dt>Prompt tokens</dt>
                <dd>{usage.promptTokens || 'not present'}</dd>
                <dt>Completion tokens</dt>
                <dd>{usage.completionTokens || 'not present'}</dd>
              </dl>
            </div>
          </Card>
        ) : null}
      </div>

      <Card
        className="w-unknown-card"
        title="Not calculated from transcript"
        icon={<Warning20Filled className="w-ic" aria-hidden="true" />}
        actions={<Badge tone="neutral">Excluded from estimate</Badge>}
      >
        <div className="w-unknown-list">
          {usage.unknowns.map((unknown) => (
            <div key={unknown.kind} className="w-unknown-row">
              <span className="nm">
                {unknown.label}
                <small>{unknown.detail}</small>
              </span>
              <Badge tone="neutral">{unknown.status}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default UsageCreditsTab;
