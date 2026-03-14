import { describe, it, expect } from 'vitest';
import {
  ACTIVITY_TYPES,
  classifyQuestionAsActivity,
  buildActivitiesFromQuestions,
  getSessionActivities,
  getActivityIds,
} from '../../src/services/activities.js';

describe('activities service helpers', () => {
  // ---- classifyQuestionAsActivity ----

  it('classifies a null/undefined question as QUESTION', () => {
    expect(classifyQuestionAsActivity(null)).toBe(ACTIVITY_TYPES.QUESTION);
    expect(classifyQuestionAsActivity(undefined)).toBe(ACTIVITY_TYPES.QUESTION);
  });

  it('classifies a slide (type 6) as SLIDE', () => {
    expect(classifyQuestionAsActivity({ type: 6 })).toBe(ACTIVITY_TYPES.SLIDE);
  });

  it('classifies a multiple-choice question (type 0) as QUESTION', () => {
    expect(classifyQuestionAsActivity({ type: 0 })).toBe(ACTIVITY_TYPES.QUESTION);
  });

  it('classifies a short-answer question (type 2) as QUESTION', () => {
    expect(classifyQuestionAsActivity({ type: 2 })).toBe(ACTIVITY_TYPES.QUESTION);
  });

  it('classifies a numerical question (type 4) as QUESTION', () => {
    expect(classifyQuestionAsActivity({ type: 4 })).toBe(ACTIVITY_TYPES.QUESTION);
  });

  // ---- buildActivitiesFromQuestions ----

  it('builds activities from question IDs and a questions map', () => {
    const questionsMap = new Map([
      ['q1', { _id: 'q1', type: 0 }],
      ['q2', { _id: 'q2', type: 6 }],
      ['q3', { _id: 'q3', type: 2 }],
    ]);

    const result = buildActivitiesFromQuestions(['q1', 'q2', 'q3'], questionsMap);

    expect(result).toEqual([
      { activityType: 'question', activityId: 'q1' },
      { activityType: 'slide', activityId: 'q2' },
      { activityType: 'question', activityId: 'q3' },
    ]);
  });

  it('defaults to QUESTION when question doc is missing from map', () => {
    const questionsMap = new Map();
    const result = buildActivitiesFromQuestions(['unknown-id'], questionsMap);

    expect(result).toEqual([
      { activityType: 'question', activityId: 'unknown-id' },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(buildActivitiesFromQuestions([], new Map())).toEqual([]);
    expect(buildActivitiesFromQuestions(null, new Map())).toEqual([]);
    expect(buildActivitiesFromQuestions(undefined, new Map())).toEqual([]);
  });

  // ---- getSessionActivities ----

  it('returns session.activities when present and non-empty', () => {
    const activities = [
      { activityType: 'question', activityId: 'q1' },
      { activityType: 'slide', activityId: 's1' },
    ];
    const session = {
      questions: ['q1', 's1'],
      activities,
    };

    expect(getSessionActivities(session)).toBe(activities);
  });

  it('builds activities from questions for legacy sessions with empty activities', () => {
    const questionsMap = new Map([
      ['q1', { _id: 'q1', type: 0 }],
      ['q2', { _id: 'q2', type: 6 }],
    ]);
    const session = {
      questions: ['q1', 'q2'],
      activities: [],
    };

    const result = getSessionActivities(session, questionsMap);
    expect(result).toEqual([
      { activityType: 'question', activityId: 'q1' },
      { activityType: 'slide', activityId: 'q2' },
    ]);
  });

  it('builds activities from questions for legacy sessions without activities field', () => {
    const questionsMap = new Map([
      ['q1', { _id: 'q1', type: 1 }],
    ]);
    const session = {
      questions: ['q1'],
    };

    const result = getSessionActivities(session, questionsMap);
    expect(result).toEqual([
      { activityType: 'question', activityId: 'q1' },
    ]);
  });

  it('returns empty array for null/undefined session', () => {
    expect(getSessionActivities(null)).toEqual([]);
    expect(getSessionActivities(undefined)).toEqual([]);
  });

  // ---- getActivityIds ----

  it('extracts ordered IDs from activities array', () => {
    const activities = [
      { activityType: 'question', activityId: 'q1' },
      { activityType: 'slide', activityId: 's1' },
      { activityType: 'question', activityId: 'q2' },
    ];

    expect(getActivityIds(activities)).toEqual(['q1', 's1', 'q2']);
  });

  it('returns empty array for null/undefined input', () => {
    expect(getActivityIds(null)).toEqual([]);
    expect(getActivityIds(undefined)).toEqual([]);
  });

  // ---- ACTIVITY_TYPES constants ----

  it('exports expected activity type constants', () => {
    expect(ACTIVITY_TYPES.QUESTION).toBe('question');
    expect(ACTIVITY_TYPES.SLIDE).toBe('slide');
  });
});
