/**
 * Runtime gating in the upload dialog.
 *
 * The review already refuses to invent a verdict for a runtime that cannot
 * install the artifact — `runtimeApplicability.test.ts` covers that. This suite
 * covers the *earlier* guard: not offering the impossible choice in the first
 * place, so a reader never spends an AI review to be told two of their three
 * answers do not apply.
 *
 * The rule is tested through the two exported helpers rather than the DOM. Both
 * are pure, and the failure that matters — a state with nothing selectable and
 * a dead Review button — is a property of the fold, not of the markup.
 */
import { describe, expect, it } from 'vitest';
import {
  describeUnsupportedUpload,
  reconcileRuntimes,
  runtimesForFile,
} from '../services/runtimeApplicability';
import { TARGET_RUNTIMES, type TargetRuntime } from '../contracts/ArtifactReview';

describe('runtimesForFile', () => {
  it('narrows an automation .json to Scout alone', () => {
    expect(runtimesForFile({ name: 'awaiting-reply.json' })).toEqual(['scout']);
  });

  it('ignores the case of the extension', () => {
    expect(runtimesForFile({ name: 'AWAITING-REPLY.JSON' })).toEqual(['scout']);
  });

  it('leaves every runtime open for a bundle or a bare SKILL.md', () => {
    // A .zip must be inspected before the app can determine whether it is a
    // supported skill bundle.
    expect(runtimesForFile({ name: 'test-planner.zip' })).toEqual([...TARGET_RUNTIMES]);
    expect(runtimesForFile({ name: 'SKILL.md' })).toEqual([...TARGET_RUNTIMES]);
  });

  it('leaves every runtime open before a file is chosen', () => {
    expect(runtimesForFile(null)).toEqual([...TARGET_RUNTIMES]);
  });

  it('does not treat a .json inside a longer name as an extension', () => {
    expect(runtimesForFile({ name: 'automation.json.zip' })).toEqual([...TARGET_RUNTIMES]);
  });
});

describe('reconcileRuntimes', () => {
  it('drops a tick the chosen file cannot support', () => {
    const next = reconcileRuntimes(['cowork', 'scout'], ['scout']);

    expect(next).toEqual(['scout']);
  });

  /*
    The dead-end. The dialog opens with Cowork alone ticked, so this is the
    ordinary path, not an edge case: choose runtimes first, drop a .json second.
    Clearing without replacing would leave a disabled group, an unsatisfiable
    "choose at least one runtime" and a Review button that never enables.
  */
  it('never empties the choice, even when nothing ticked survives', () => {
    const next = reconcileRuntimes(['cowork'], ['scout']);

    expect(next).toEqual(['scout']);
    expect(next.length).toBeGreaterThan(0);
  });

  it('leaves a choice the file supports exactly as it was', () => {
    const all: TargetRuntime[] = [...TARGET_RUNTIMES];

    expect(reconcileRuntimes(all, all)).toEqual(all);
  });

  it('reaches the same answer whichever order the two choices were made in', () => {
    // Runtimes first, then the file.
    const runtimesFirst = reconcileRuntimes(['cowork'], runtimesForFile({ name: 'a.json' }));
    // File first: the fold runs on selection, so the state is already narrowed
    // and a second pass must not move it.
    const fileFirst = reconcileRuntimes(runtimesFirst, runtimesForFile({ name: 'a.json' }));

    expect(runtimesFirst).toEqual(fileFirst);
  });
});

describe('the reason shown beside a disabled runtime', () => {
  it('names the runtime and the format, so the control does not read as broken', () => {
    const reason = describeUnsupportedUpload('cowork', 'automation');

    expect(reason).toContain('Copilot Cowork');
    expect(reason).toContain('automation');
  });

  it('stays to one sentence, unlike the long form used in the result', () => {
    // The result explains "then what should I have uploaded?". A checkbox only
    // has room for the fact.
    const reason = describeUnsupportedUpload('copilot-studio', 'automation');

    expect(reason.split('.').filter((part) => part.trim().length > 0)).toHaveLength(1);
  });
});
