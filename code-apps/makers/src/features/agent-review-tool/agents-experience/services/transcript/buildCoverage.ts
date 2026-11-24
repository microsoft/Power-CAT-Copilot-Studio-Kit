import type {
  AggregateObservation,
  CoverageItem,
  EvidenceState,
  ObservationWindow,
  ObservedToolUsage,
  ParsedTranscriptEvidence,
  ToolCoverage,
} from '../../contracts/TranscriptEvidence';

/**
 * Aggregates parsed transcripts into the configured-versus-observed comparison
 * the Cost & efficiency tab renders.
 *
 * Knowledge coverage is self-contained: the transcript carries the configured
 * catalogue *and* the searched set, so this comparison needs no input from the
 * saved review model (spec 019 FR-4a). Skill coverage needs the configured
 * list from agent metadata, because a skill call documents only the skill it
 * invoked (FR-4b).
 */

/** Observed first, then not-observed, then not-attributable; alphabetical within each. */
const STATE_ORDER: Record<CoverageItem['state'], number> = {
  observed: 0,
  'not-observed': 1,
  'not-attributable': 2,
};

function compareCoverageItems(a: CoverageItem, b: CoverageItem): number {
  const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state];
  if (byState !== 0) return byState;
  return a.name.localeCompare(b.name);
}

/** Groups items by `sourceType`, with untyped entries under a single bucket. */
const UNTYPED = '\u0000untyped';

/**
 * Decides which source types the searched set is capable of naming individually.
 *
 * The harness enumerates every uploaded file by name in the catalogue, but
 * records a search against them under a group name such as `Uploaded Files`.
 * A file name therefore never appears in the searched set, and its absence
 * carries no information. Websites behave differently: they are named
 * individually in both places.
 *
 * The test is evidential, not a guess about specific type strings: a type is
 * attributable when at least one of its members was matched by name. One match
 * proves the harness does name members of that type, so silence about the rest
 * is real. Zero matches, combined with searches recorded under names that are
 * not in the catalogue, means the class is only ever searched collectively.
 */
function attributableSourceTypes(
  configured: ReadonlyMap<string, CoverageItem>,
  observedCounts: ReadonlyMap<string, number>,
  hasAggregateObservations: boolean,
): (item: CoverageItem) => boolean {
  // Without an unattributed search there is nothing a group name could be
  // hiding, so every type keeps its plain not-observed reading.
  if (!hasAggregateObservations) return () => true;

  const matchedTypes = new Set<string>();
  for (const item of configured.values()) {
    if ((observedCounts.get(item.name) ?? 0) > 0) {
      matchedTypes.add(item.sourceType ?? UNTYPED);
    }
  }
  return (item: CoverageItem) => matchedTypes.has(item.sourceType ?? UNTYPED);
}

/**
 * Builds knowledge coverage entirely from transcript evidence.
 *
 * The configured catalogue is exactly what the `Available search sources:`
 * blocks enumerate. A search recorded under a name that is *not* in that
 * catalogue is an aggregate observation, reported separately: it is a real
 * observation, but it names a group, so it cannot be attributed to a member and
 * must not inflate the configured count.
 */
export function buildKnowledgeCoverage(
  parsed: readonly ParsedTranscriptEvidence[],
): ToolCoverage | undefined {
  const configured = new Map<string, CoverageItem>();
  const observedCounts = new Map<string, number>();

  for (const transcript of parsed) {
    for (const call of transcript.calls) {
      for (const available of call.availableSources) {
        if (!configured.has(available.name)) {
          configured.set(available.name, { ...available });
        } else if (available.sourceType && !configured.get(available.name)!.sourceType) {
          configured.get(available.name)!.sourceType = available.sourceType;
        }
      }
      for (const searched of call.searchedSources) {
        observedCounts.set(searched, (observedCounts.get(searched) ?? 0) + 1);
      }
    }
  }

  // A searched name absent from the catalogue names a group, not a member. It
  // is kept as an aggregate observation rather than being invented as a
  // configured entry, which previously inflated the denominator.
  const aggregateObservations: AggregateObservation[] = [];
  for (const [name, invocations] of observedCounts) {
    if (!configured.has(name)) aggregateObservations.push({ name, invocations });
  }
  aggregateObservations.sort(
    (a, b) => b.invocations - a.invocations || a.name.localeCompare(b.name),
  );

  if (configured.size === 0 && aggregateObservations.length === 0) return undefined;

  const isAttributable = attributableSourceTypes(
    configured,
    observedCounts,
    aggregateObservations.length > 0,
  );

  const items = [...configured.values()].map((item) => {
    const invocations = observedCounts.get(item.name) ?? 0;
    if (invocations > 0) return { ...item, invocations, state: 'observed' as const };
    return {
      ...item,
      invocations,
      state: isAttributable(item) ? ('not-observed' as const) : ('not-attributable' as const),
    };
  });
  items.sort(compareCoverageItems);

  return {
    kind: 'knowledge',
    configured: items.length,
    observed: items.filter((item) => item.state === 'observed').length,
    notAttributable: items.filter((item) => item.state === 'not-attributable').length,
    items,
    aggregateObservations,
  };
}

/**
 * Builds skill coverage by joining observed skill invocations against the
 * configured skill list from agent metadata.
 *
 * Returns `undefined` when no skills are configured, so the UI renders nothing
 * rather than an empty section.
 */
export function buildSkillCoverage(
  parsed: readonly ParsedTranscriptEvidence[],
  configuredSkills: readonly string[],
): ToolCoverage | undefined {
  if (configuredSkills.length === 0) return undefined;

  const observedCounts = new Map<string, number>();
  for (const transcript of parsed) {
    for (const call of transcript.calls) {
      if (call.toolKind !== 'skill') continue;
      const name = call.skill ?? call.displayName;
      if (!name) continue;
      observedCounts.set(name, (observedCounts.get(name) ?? 0) + 1);
    }
  }

  const items: CoverageItem[] = configuredSkills.map((name) => {
    const invocations = observedCounts.get(name) ?? 0;
    return {
      name,
      state: invocations > 0 ? 'observed' : 'not-observed',
      invocations,
    };
  });
  items.sort(compareCoverageItems);

  // A skill call names the skill it invoked, so the two vocabularies always
  // agree here and nothing is unattributable.
  return {
    kind: 'skill',
    configured: items.length,
    observed: items.filter((item) => item.state === 'observed').length,
    notAttributable: 0,
    items,
    aggregateObservations: [],
  };
}

/** Aggregates retained calls into a per-tool census, busiest first. */
export function buildObservedTools(
  parsed: readonly ParsedTranscriptEvidence[],
): ObservedToolUsage[] {
  const byName = new Map<string, ObservedToolUsage>();

  for (const transcript of parsed) {
    for (const call of transcript.calls) {
      const existing = byName.get(call.toolName);
      if (existing) {
        existing.invocations += 1;
        continue;
      }
      byName.set(call.toolName, {
        toolName: call.toolName,
        displayName: call.displayName || call.toolName,
        toolKind: call.toolKind,
        invocations: 1,
      });
    }
  }

  return [...byName.values()].sort(
    (a, b) => b.invocations - a.invocations || a.displayName.localeCompare(b.displayName),
  );
}

/**
 * Resolves parsed transcripts into the single state the evidence card renders.
 *
 * `no-signal` deliberately carries no counts. Reporting "0 of N observed" when
 * nothing ran would read as a finding, when it only means the window was
 * quiet.
 */
export function buildEvidenceState(options: {
  parsed: readonly ParsedTranscriptEvidence[];
  window: ObservationWindow;
  configuredSkills: readonly string[];
}): EvidenceState {
  const { parsed, window, configuredSkills } = options;

  if (parsed.length === 0) {
    return { status: 'no-transcripts', window };
  }

  const blockedConversations = parsed.filter((entry) => entry.blocked).length;
  const usable = parsed.filter((entry) => !entry.blocked);

  const coverage = [
    buildKnowledgeCoverage(usable),
    buildSkillCoverage(usable, configuredSkills),
  ].filter((entry): entry is ToolCoverage => entry !== undefined);

  const observedTools = buildObservedTools(usable);

  if (coverage.length === 0 && observedTools.length === 0) {
    return { status: 'no-signal', window, blockedConversations };
  }

  return {
    status: 'ready',
    window,
    coverage,
    observedTools,
    blockedConversations,
  };
}
