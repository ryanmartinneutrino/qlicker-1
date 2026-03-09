import { describe, it, expect } from 'vitest';
import {
  calculateResponsePoints,
  DEFAULT_MS_SCORING_METHOD,
  MS_SCORING_METHODS,
  getSessionMsScoringMethod,
  getQuestionPoints,
} from '../../src/services/grading.js';

describe('grading service helpers', () => {
  it('uses Meteor-compatible right-minus-wrong scoring by default for multi-select', () => {
    const question = {
      type: 3,
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: true },
        { answer: 'C', correct: false },
        { answer: 'D', correct: false },
      ],
      sessionOptions: {
        points: 4,
        maxAttempts: 1,
        attempts: [{ number: 1, closed: false }],
      },
    };
    const response = {
      attempt: 1,
      answer: ['A'],
    };

    expect(DEFAULT_MS_SCORING_METHOD).toBe(MS_SCORING_METHODS.RIGHT_MINUS_WRONG);
    expect(calculateResponsePoints(question, response)).toBe(2);
  });

  it('supports all-or-nothing and correctness-ratio multi-select scoring modes', () => {
    const question = {
      type: 3,
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: true },
        { answer: 'C', correct: false },
        { answer: 'D', correct: false },
      ],
      sessionOptions: {
        points: 4,
        maxAttempts: 1,
        attempts: [{ number: 1, closed: false }],
      },
    };
    const response = {
      attempt: 1,
      answer: ['A'],
    };

    expect(
      calculateResponsePoints(question, response, { msScoringMethod: MS_SCORING_METHODS.ALL_OR_NOTHING })
    ).toBe(0);

    expect(
      calculateResponsePoints(question, response, { msScoringMethod: MS_SCORING_METHODS.CORRECTNESS_RATIO })
    ).toBe(3);
  });

  it('applies attempt weights when maxAttempts and attemptWeights are configured', () => {
    const question = {
      type: 0,
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
      sessionOptions: {
        points: 4,
        maxAttempts: 2,
        attemptWeights: [1, 0.5],
      },
    };

    const firstAttempt = { attempt: 1, answer: 'A' };
    const secondAttempt = { attempt: 2, answer: 'A' };

    expect(calculateResponsePoints(question, firstAttempt)).toBe(4);
    expect(calculateResponsePoints(question, secondAttempt)).toBe(2);
  });

  it('keeps legacy default points behavior by question type', () => {
    expect(getQuestionPoints({ type: 2, sessionOptions: {} })).toBe(0);
    expect(getQuestionPoints({ type: 0, sessionOptions: {} })).toBe(1);
    expect(getQuestionPoints({ type: 2, sessionOptions: { points: 3 } })).toBe(3);
    expect(getQuestionPoints({ type: 0, sessionOptions: { points: 0 } })).toBe(0);
  });

  it('does not award points for zero-point questions even with a correct answer', () => {
    const question = {
      type: 0,
      options: [
        { answer: 'A', correct: true },
        { answer: 'B', correct: false },
      ],
      sessionOptions: {
        points: 0,
        maxAttempts: 1,
        attempts: [{ number: 1, closed: false }],
      },
    };
    const response = {
      attempt: 1,
      answer: 'A',
    };

    expect(calculateResponsePoints(question, response)).toBe(0);
  });

  it('normalizes session multi-select scoring strategy values', () => {
    expect(getSessionMsScoringMethod({ msScoringMethod: 'ALL-OR-NOTHING' }))
      .toBe(MS_SCORING_METHODS.ALL_OR_NOTHING);
    expect(getSessionMsScoringMethod({ msScoringMethod: 'unknown-mode' }))
      .toBe(DEFAULT_MS_SCORING_METHOD);
  });
});
