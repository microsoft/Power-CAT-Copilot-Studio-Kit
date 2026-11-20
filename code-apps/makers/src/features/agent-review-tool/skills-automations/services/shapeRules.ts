/**
 * Authoring-shape rules (spec 018, group D).
 *
 * Contract checks live in packagingRules. The checks here are authoring advice,
 * so they remain below blocking severity and say when guidance, rather than a
 * runtime requirement, is the source.
 */
import type {
  ArtifactFinding,
  TargetRuntime,
  UploadedArtifact,
} from '../contracts/ArtifactReview';
import { buildFinding } from './findingFactory';
import { findFile, frontmatterKeyLine, parseFrontmatter, readString, stripRoot } from './artifactUtils';
import { readSkillBody } from './packagingRules';

/** Published Cowork authoring guidance, not an upload contract. */
export const AUTHORING_GUIDANCE = {
  coworkBodyAdviceWords: 3000,
} as const;

/** Explicit activation signals recommended by the official authoring guidance. */
const TRIGGER_SIGNALS = [
  /\buse\s+(?:this\s+skill\s+)?(?:when|for|whenever|any\s+time|if)\b/i,
  /\b(?:invoke|apply|trigger)\s+(?:this\s+)?(?:skill\s+)?when\b/i,
  /\bwhen\s+(?:the\s+)?user\b/i,
  /\bfor\s+(?:any\s+)?(?:task|request|question)s?\s+(?:involving|about|that)\b/i,
  /\bactivate\s+when\b/i,
];

const NUMBERED_STEP_RE = /^(?:\s{0,3}\d+[.)]\s+\S|#{2,6}\s+Step\s+\d+\b)/im;
const PROCEDURE_HINT_RE = /\b(?:steps?|procedure|workflow|process|instructions)\b/i;

function countWords(value: string): number {
  const words = value.trim().match(/\S+/g);
  return words?.length ?? 0;
}

/** Run every shape rule against an uploaded skill. */
export function evaluateShape(
  artifact: UploadedArtifact,
  runtimes: TargetRuntime[] = [],
): ArtifactFinding[] {
  const findings: ArtifactFinding[] = [];
  const skillFile = findFile(artifact, 'SKILL.md');
  if (!skillFile?.text) return findings;

  const path = stripRoot(skillFile.path, artifact.rootFolderName);
  const frontmatter = parseFrontmatter(skillFile.text);
  const description = readString(frontmatter.data, 'description');
  const descriptionLine = frontmatterKeyLine(skillFile.text, 'description');
  const { body } = readSkillBody(artifact);

  if (description) {
    const statesTrigger = TRIGGER_SIGNALS.some((re) => re.test(description.trim()));
    if (!statesTrigger) {
      findings.push(
        buildFinding({
          ruleId: 'SHP-TRIGGER',
          resourcePath: path,
          line: descriptionLine,
          evidence:
            `The description does not state when the skill should be used or include concrete trigger phrases: ` +
            `"${description.slice(0, 100)}…".`,
        }),
      );
    }
  }

  const words = countWords(body);
  if (runtimes.includes('cowork') && words > AUTHORING_GUIDANCE.coworkBodyAdviceWords) {
    findings.push(
      buildFinding({
        ruleId: 'SHP-BODYLEN',
        resourcePath: path,
        runtimes: ['cowork'],
        evidence:
          `The body is ${words} words. Copilot Cowork authoring advice recommends moving detail ` +
          `to references when SKILL.md exceeds about ${AUTHORING_GUIDANCE.coworkBodyAdviceWords} words; ` +
          'this is guidance, not an upload contract.',
      }),
    );
  }

  // Only worth raising when the skill appears to describe a procedure at all.
  // A pure reference skill has nothing to number, and flagging it would be noise.
  if (
    runtimes.includes('cowork') &&
    PROCEDURE_HINT_RE.test(body) &&
    !NUMBERED_STEP_RE.test(body)
  ) {
    findings.push(
      buildFinding({
        ruleId: 'SHP-STEPS',
        resourcePath: path,
        runtimes: ['cowork'],
        evidence:
          'The body describes a procedure but contains no numbered steps. Copilot Cowork authoring guidance recommends structuring workflows as numbered steps.',
      }),
    );
  }

  return findings;
}
