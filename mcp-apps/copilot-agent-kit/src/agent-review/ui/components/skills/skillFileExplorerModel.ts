import type {
  SkillFileExplorerEntry,
  SkillFilesExplorerModel,
} from './skillFileExplorerTypes.js';
import type {
  SkillResourceAnalysisView,
  SkillResourceManifestView,
  SkillView,
} from '../viewTypes.js';
import { normalizeSkillResourcePath } from '../../../core/index.js';

interface PathIdentity {
  displayPath: string;
  pathKey?: string;
}

function pathIdentity(path: string): PathIdentity {
  try {
    const displayPath = normalizeSkillResourcePath(path);
    if (!displayPath) {
      return { displayPath: path };
    }
    return {
      displayPath,
      pathKey: displayPath.toLocaleLowerCase('en-US'),
    };
  } catch {
    return { displayPath: path };
  }
}

function groupByPathKey<T extends { path: string }>(
  items: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = pathIdentity(item.path).pathKey;
    if (!key) continue;
    const values = grouped.get(key) ?? [];
    values.push(item);
    grouped.set(key, values);
  }
  return grouped;
}

function selectAnalysis(
  key: string,
  analyses: SkillResourceAnalysisView[],
): { analysis?: SkillResourceAnalysisView; ambiguous: boolean } {
  const standard = analyses.filter(item =>
    item.source !== 'deep' && pathIdentity(item.path).pathKey === key
  );
  if (standard.length > 1) return { ambiguous: true };
  if (standard.length === 1) return { analysis: standard[0], ambiguous: false };

  const deep = analyses.filter(item =>
    item.source === 'deep' && pathIdentity(item.path).pathKey === key
  );
  if (deep.length > 1) return { ambiguous: true };
  return { analysis: deep[0], ambiguous: false };
}

function compareEntries(a: SkillFileExplorerEntry, b: SkillFileExplorerEntry): number {
  if (a.isSkillDefinition !== b.isSkillDefinition) {
    return a.isSkillDefinition ? -1 : 1;
  }
  return a.displayPath.localeCompare(b.displayPath, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Build the display-only file model from redacted persisted review data.
 */
export function buildSkillFileExplorerModel(
  skill: SkillView,
): SkillFilesExplorerModel {
  if (skill.sourceFiles === undefined && skill.files === undefined) {
    return { availability: 'historical', entries: [] };
  }

  const files = skill.sourceFiles ?? skill.files ?? [];
  if (files.length === 0) {
    return { availability: 'empty', entries: [] };
  }

  const manifest = skill.resourceManifest ?? [];
  const analyses = skill.resourceAnalyses ?? [];
  const sourceGroups = groupByPathKey(files);
  const manifestGroups = groupByPathKey(manifest);
  const identityCounts = new Map<string, number>();

  const entries = files.map(file => {
    const identity = pathIdentity(file.path);
    const identityBase = identity.pathKey ?? `legacy:${identity.displayPath}`;
    const occurrence = identityCounts.get(identityBase) ?? 0;
    identityCounts.set(identityBase, occurrence + 1);

    const fileNameParts = identity.displayPath.replace(/\\/g, '/').split('/');
    const name = fileNameParts.pop() || identity.displayPath;
    const folder = fileNameParts.join('/');
    const sourceCollision = identity.pathKey
      ? (sourceGroups.get(identity.pathKey)?.length ?? 0) > 1
      : false;
    const manifestMatches = identity.pathKey
      ? manifestGroups.get(identity.pathKey) ?? []
      : [];
    const selectedAnalysis = identity.pathKey
      ? selectAnalysis(identity.pathKey, analyses)
      : { ambiguous: false };
    const ambiguous = sourceCollision
      || manifestMatches.length > 1
      || selectedAnalysis.ambiguous;
    const manifestEntry: SkillResourceManifestView | undefined =
      !ambiguous && manifestMatches.length === 1 ? manifestMatches[0] : undefined;
    const analysis = !ambiguous ? selectedAnalysis.analysis : undefined;

    let joinIssue: string | undefined;
    if (!identity.pathKey) {
      joinIssue = 'Analysis was not linked because this review contains an unsafe legacy path.';
    } else if (ambiguous) {
      joinIssue = 'Analysis was not linked because this review contains duplicate file paths.';
    }

    return {
      entryId: `${skill.id}:${identityBase}:${occurrence}:${identity.displayPath}`,
      displayPath: identity.displayPath,
      pathKey: identity.pathKey,
      name,
      folder,
      sizeBytes: file.sizeBytes,
      language: file.language,
      kind: file.kind,
      isSkillDefinition: file.isSkillDefinition === true,
      sourceText: file.isSkillDefinition ? skill.skillDefinitionSource : undefined,
      sourceOmission: file.isSkillDefinition
        ? skill.skillDefinitionSourceOmission
        : undefined,
      analysisStatus: manifestEntry?.analysisStatus,
      riskLevel: analysis?.riskLevel ?? manifestEntry?.riskLevel,
      readiness: analysis?.readiness ?? manifestEntry?.readiness,
      referencedBy: manifestEntry?.referencedBy ?? [],
      analysis,
      joinIssue,
    } satisfies SkillFileExplorerEntry;
  });

  return { availability: 'available', entries: entries.sort(compareEntries) };
}

/**
 * Resolve selection against the current entries and clamp stale rerun state.
 */
export function resolveSelectedSkillFile(
  entries: SkillFileExplorerEntry[],
  selectedEntryId: string | undefined,
): SkillFileExplorerEntry | undefined {
  return entries.find(entry => entry.entryId === selectedEntryId) ?? entries[0];
}
