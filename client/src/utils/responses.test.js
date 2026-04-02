import { describe, expect, it } from 'vitest';

import { applyLiveResponseAddedDelta } from './responses';

describe('applyLiveResponseAddedDelta', () => {
  it('keeps the full short-answer stats payload when it is included in the delta', () => {
    const createdAt = '2026-04-02T00:00:00.000Z';
    const prev = {
      currentQuestion: {
        _id: 'question-1',
        sessionOptions: { stats: true },
      },
      currentAttempt: { number: 1 },
      responseCount: 0,
      session: { joinedCount: 1 },
      allResponses: [],
      responseStats: null,
    };

    const next = applyLiveResponseAddedDelta(prev, {
      questionId: 'question-1',
      attempt: 1,
      responseCount: 2,
      joinedCount: 1,
      response: {
        _id: 'response-2',
        attempt: 1,
        questionId: 'question-1',
        answer: 'Newest answer',
        answerWysiwyg: '<p>Newest answer</p>',
        createdAt,
        updatedAt: createdAt,
        studentName: 'Student One',
      },
      responseStats: {
        type: 'shortAnswer',
        total: 2,
        answers: [
          {
            answer: 'Newest answer',
            answerWysiwyg: '<p>Newest answer</p>',
            createdAt,
            updatedAt: createdAt,
          },
          {
            answer: 'Older answer',
            answerWysiwyg: '<p>Older answer</p>',
            createdAt: '2026-04-01T23:59:00.000Z',
            updatedAt: '2026-04-01T23:59:00.000Z',
          },
        ],
      },
    });

    expect(next.responseCount).toBe(2);
    expect(next.responseStats).toEqual({
      type: 'shortAnswer',
      total: 2,
      answers: [
        {
          answer: 'Newest answer',
          answerWysiwyg: '<p>Newest answer</p>',
          createdAt,
          updatedAt: createdAt,
        },
        {
          answer: 'Older answer',
          answerWysiwyg: '<p>Older answer</p>',
          createdAt: '2026-04-01T23:59:00.000Z',
          updatedAt: '2026-04-01T23:59:00.000Z',
        },
      ],
    });
    expect(next.allResponses).toHaveLength(1);
  });

  it('keeps the full numerical stats payload when it is included in the delta', () => {
    const prev = {
      currentQuestion: {
        _id: 'question-1',
        sessionOptions: { stats: true },
      },
      currentAttempt: { number: 1 },
      responseCount: 1,
      session: { joinedCount: 1 },
      allResponses: [],
      responseStats: null,
    };

    const next = applyLiveResponseAddedDelta(prev, {
      questionId: 'question-1',
      attempt: 1,
      responseCount: 2,
      joinedCount: 1,
      response: {
        _id: 'response-2',
        attempt: 1,
        questionId: 'question-1',
        answer: '7.5',
        createdAt: '2026-04-02T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
      },
      responseStats: {
        type: 'numerical',
        total: 2,
        values: [5, 7.5],
        answers: [
          {
            answer: '7.5',
            createdAt: '2026-04-02T00:00:00.000Z',
            updatedAt: '2026-04-02T00:00:00.000Z',
          },
          {
            answer: '5',
            createdAt: '2026-04-01T23:59:00.000Z',
            updatedAt: '2026-04-01T23:59:00.000Z',
          },
        ],
        mean: 6.25,
        stdev: 1.25,
        median: 7.5,
        min: 5,
        max: 7.5,
      },
    });

    expect(next.responseCount).toBe(2);
    expect(next.responseStats).toEqual({
      type: 'numerical',
      total: 2,
      values: [5, 7.5],
      answers: [
        {
          answer: '7.5',
          createdAt: '2026-04-02T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
        {
          answer: '5',
          createdAt: '2026-04-01T23:59:00.000Z',
          updatedAt: '2026-04-01T23:59:00.000Z',
        },
      ],
      mean: 6.25,
      stdev: 1.25,
      median: 7.5,
      min: 5,
      max: 7.5,
    });
    expect(next.allResponses).toHaveLength(1);
  });
});
