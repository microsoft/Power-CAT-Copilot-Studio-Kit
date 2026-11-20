import type {
  ArtifactKind,
  TargetRuntime,
  UploadedArtifact,
} from '../contracts/ArtifactReview';
import { TARGET_RUNTIMES } from '../contracts/ArtifactReview';
import { findFile, parseFrontmatter, readString } from './artifactUtils';

const TARGET_BY_COMPATIBILITY_VALUE: Readonly<Record<string, TargetRuntime>> = {
  cowork: 'cowork',
  'copilot cowork': 'cowork',
  'microsoft copilot cowork': 'cowork',
  scout: 'scout',
  'microsoft scout': 'scout',
  'copilot studio': 'copilot-studio',
  'microsoft copilot studio': 'copilot-studio',
};

/** Resolve exact product names from the Agent Skills compatibility field. */
export function runtimeTargetsFromSkillMarkdown(markdown: string): TargetRuntime[] {
  const compatibility = readString(parseFrontmatter(markdown).data, 'compatibility');
  if (!compatibility) return [];

  const declared = new Set(
    compatibility
      .split(/[,;|]/)
      .map((value) => TARGET_BY_COMPATIBILITY_VALUE[value.trim().toLowerCase()])
      .filter((runtime): runtime is TargetRuntime => runtime !== undefined),
  );
  return TARGET_RUNTIMES.filter((runtime) => declared.has(runtime));
}

/** Read runtime-target evidence from authoritative SKILL.md package metadata. */
export function runtimeTargetsFromPackage(artifact: UploadedArtifact): TargetRuntime[] {
  return runtimeTargetsFromSkillMarkdown(findFile(artifact, 'SKILL.md')?.text ?? '');
}

/** Merge package and explicit declarations in canonical runtime order. */
export function mergeRuntimeTargets(
  ...targetSets: ReadonlyArray<readonly TargetRuntime[]>
): TargetRuntime[] {
  const declared = new Set(targetSets.flat());
  return TARGET_RUNTIMES.filter((runtime) => declared.has(runtime));
}

/** Whether evidence establishes that compatibility should be assessed. */
export function runtimeTargetIsEstablished(
  runtime: TargetRuntime,
  artifactKind: ArtifactKind | undefined,
  declaredRuntimes: readonly TargetRuntime[],
): boolean {
  if (
    runtime === 'scout' &&
    artifactKind === 'automation'
  ) {
    return true;
  }
  return declaredRuntimes.includes(runtime);
}
