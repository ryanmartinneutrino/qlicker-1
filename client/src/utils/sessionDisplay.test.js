import { beforeEach, describe, expect, it } from 'vitest';
import { getSessionTimingText } from './sessionDisplay';

describe('getSessionTimingText', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('qlicker_dateFormat', 'YYYY-MM-DD');
    localStorage.setItem('qlicker_timeFormat', '24h');
  });

  it('shows the quiz start date and time for upcoming quizzes', () => {
    const text = getSessionTimingText({
      quiz: true,
      status: 'visible',
      quizStart: '2026-03-29T13:45:00.000Z',
    }, (key, values) => `${key}:${values.dateTime}`);

    expect(text).toBe('sessionTiming.quizStartsAt:2026-03-29 13:45');
  });

  it('shows the quiz end date and time for live quizzes', () => {
    const text = getSessionTimingText({
      quiz: true,
      status: 'running',
      quizEnd: '2026-03-29T15:00:00.000Z',
    }, (key, values) => `${key}:${values.dateTime}`);

    expect(text).toBe('sessionTiming.quizEndsAt:2026-03-29 15:00');
  });

  it('shows the quiz end date and time for ended quizzes', () => {
    const text = getSessionTimingText({
      quiz: true,
      status: 'done',
      quizEnd: '2026-03-29T16:15:00.000Z',
    }, (key, values) => `${key}:${values.dateTime}`);

    expect(text).toBe('sessionTiming.quizEndedAt:2026-03-29 16:15');
  });

  it('keeps non-quiz sessions on date-only formatting', () => {
    const text = getSessionTimingText({
      status: 'visible',
      date: '2026-03-29T16:15:00.000Z',
    }, (key, values) => `${key}:${values.dateTime}`);

    expect(text).toBe('2026-03-29');
  });
});
