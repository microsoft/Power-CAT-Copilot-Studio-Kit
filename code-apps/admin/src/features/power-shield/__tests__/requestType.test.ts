import { describe, it, expect } from 'vitest';
import {
  REQUEST_TYPE_CONNECTOR,
  REQUEST_TYPE_CREDITS,
  normalizeRequestType,
  classifyRequestTypeStrict,
  assertRequestType,
  andRequestType,
} from '../shared/services/dataverse/requestType';

// ─────────────────────────────────────────────────────────────────────────────
// T010 — isolation seam regression (FR-034/035, SC-002).
//
// Pure unit test of the discriminator seam. It proves:
//  - andRequestType wraps the WHOLE existing filter (no OData and/or precedence
//    leak) and uses a null-inclusive Connector predicate but a strict Credits one;
//  - assertRequestType rejects the opposite type in BOTH directions and treats a
//    legacy null as Connector.
// This must be green before any credit surface is built (Phase 3 gate).
// ─────────────────────────────────────────────────────────────────────────────

const CONNECTOR = REQUEST_TYPE_CONNECTOR; // 335350000
const CREDITS = REQUEST_TYPE_CREDITS;     // 335350001

describe('andRequestType — filter composition', () => {
  it('Connector predicate is null-inclusive', () => {
    const f = andRequestType(undefined, 'Connector');
    expect(f).toBe(`(cat_requesttype eq ${CONNECTOR} or cat_requesttype eq null)`);
    expect(f).toContain('or cat_requesttype eq null');
  });

  it('Credits predicate is strict (null never matches)', () => {
    const f = andRequestType(undefined, 'Credits');
    expect(f).toBe(`cat_requesttype eq ${CREDITS}`);
    expect(f).not.toContain('null');
    expect(f).not.toContain(String(CONNECTOR));
  });

  it('wraps the ENTIRE existing filter in parentheses before ANDing (no precedence leak)', () => {
    // A filter that mixes OR at the top level is the classic leak case.
    const existing = "cat_createdbyaadobjectid eq 'u1' or cat_policyrequestid eq g2";
    const f = andRequestType(existing, 'Connector');
    // The whole existing filter must be parenthesised, then ANDed with the predicate.
    expect(f).toBe(
      `(${existing}) and (cat_requesttype eq ${CONNECTOR} or cat_requesttype eq null)`,
    );
    // The predicate is ANDed at the top level, so the OR inside cannot escape it.
    expect(f.startsWith(`(${existing}) and `)).toBe(true);
  });

  it('Credits list filter never contains the Connector value', () => {
    const f = andRequestType('cat_status eq 2', 'Credits');
    expect(f).toContain(`cat_requesttype eq ${CREDITS}`);
    expect(f).not.toContain(String(CONNECTOR));
    expect(f).not.toContain('null');
  });

  it('treats an empty/whitespace filter as no filter', () => {
    expect(andRequestType('', 'Credits')).toBe(`cat_requesttype eq ${CREDITS}`);
    expect(andRequestType('   ', 'Connector')).toBe(
      `(cat_requesttype eq ${CONNECTOR} or cat_requesttype eq null)`,
    );
  });
});

describe('classifyRequestTypeStrict — write-path classifier', () => {
  it('maps the two known integers', () => {
    expect(classifyRequestTypeStrict(CONNECTOR)).toBe('Connector');
    expect(classifyRequestTypeStrict(CREDITS)).toBe('Credits');
  });

  it('treats legacy null/undefined/empty as Connector', () => {
    expect(classifyRequestTypeStrict(null)).toBe('Connector');
    expect(classifyRequestTypeStrict(undefined)).toBe('Connector');
    expect(classifyRequestTypeStrict('')).toBe('Connector');
  });

  it('throws on an unrecognized discriminator (fail-safe)', () => {
    expect(() => classifyRequestTypeStrict(999)).toThrow();
  });
});

describe('normalizeRequestType — read-path classifier (lenient)', () => {
  it('only the explicit Credits integer is Credits; everything else is Connector', () => {
    expect(normalizeRequestType(CREDITS)).toBe('Credits');
    expect(normalizeRequestType(CONNECTOR)).toBe('Connector');
    expect(normalizeRequestType(null)).toBe('Connector');
    expect(normalizeRequestType(999)).toBe('Connector'); // never breaks a list load
  });
});

describe('assertRequestType — reject-on-mismatch, both directions', () => {
  it('a Connector expectation rejects a Credits row', () => {
    expect(() => assertRequestType(CREDITS, 'Connector')).toThrow(/Connector experience/);
  });

  it('a Credits expectation rejects a Connector row', () => {
    expect(() => assertRequestType(CONNECTOR, 'Credits')).toThrow(/Credits experience/);
  });

  it('a Credits expectation rejects a legacy null (treated as Connector)', () => {
    expect(() => assertRequestType(null, 'Credits')).toThrow(/Credits experience/);
  });

  it('a Connector expectation accepts a legacy null row', () => {
    expect(() => assertRequestType(null, 'Connector')).not.toThrow();
  });

  it('accepts a matching type in each direction', () => {
    expect(() => assertRequestType(CONNECTOR, 'Connector')).not.toThrow();
    expect(() => assertRequestType(CREDITS, 'Credits')).not.toThrow();
  });
});
