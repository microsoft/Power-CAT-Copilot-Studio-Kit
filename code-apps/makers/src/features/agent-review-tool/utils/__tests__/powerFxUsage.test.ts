import { describe, expect, it } from 'vitest';
import { countPowerFxExpressions } from '../powerFxUsage';

describe('countPowerFxExpressions', () => {
  it('counts a text that starts with an equals sign as 1 expression', () => {
    expect(countPowerFxExpressions('=Topic.Seats + 1')).toBe(1);
    expect(countPowerFxExpressions('  =If(Topic.Seats > 10, "Large", "Small")')).toBe(1);
  });

  it('counts each curly brace segment that holds a variable or a function call', () => {
    expect(countPowerFxExpressions('You booked {Topic.Seats} seats on {Text(Topic.Date)}.')).toBe(2);
    expect(countPowerFxExpressions('Hello {System.User.DisplayName}. Use {curly braces} for text.')).toBe(1);
  });

  it('counts the expressions in nested actions', () => {
    expect(countPowerFxExpressions({
      kind: 'OnRecognizedIntent',
      actions: [
        { kind: 'SetVariable', variable: 'Topic.Seats', value: '=Topic.minimumSeats + 1' },
        { kind: 'SendActivity', activity: ['Seats: {Topic.Seats}'] },
      ],
    })).toBe(2);
  });

  it('counts 0 for plain text and for values that are not text', () => {
    expect(countPowerFxExpressions({
      kind: 'SendActivity',
      activity: 'Booking complete.',
      retries: 2,
      enabled: true,
      note: null,
    })).toBe(0);
    expect(countPowerFxExpressions(undefined)).toBe(0);
  });

  it('counts a value that refers to itself only 1 time', () => {
    const topic: Record<string, unknown> = { kind: 'SendActivity', activity: '{Topic.Seats}' };
    topic.self = topic;
    const actions: unknown[] = ['=Topic.Seats'];
    actions.push(actions);
    expect(countPowerFxExpressions(topic)).toBe(1);
    expect(countPowerFxExpressions(actions)).toBe(1);
  });

  it('counts an object that 2 places share only 1 time', () => {
    const shared = { kind: 'SendActivity', activity: '{Topic.Seats}' };
    expect(countPowerFxExpressions({ actions: [shared, shared] })).toBe(1);
  });
});
