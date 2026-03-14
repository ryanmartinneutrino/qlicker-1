import { describe, expect, it } from 'vitest';
import {
  findActivityIndex,
  getActivityIds,
  getSessionActivities,
} from './activities';

describe('client activity helpers', () => {
  it('rebuilds activities from questions when stored activities are incomplete', () => {
    const session = {
      questions: ['q1', 's1'],
      activities: [{ activityType: 'question', activityId: 'q1' }],
    };
    const questions = [
      { _id: 'q1', type: 0 },
      { _id: 's1', type: 6 },
    ];

    const activities = getSessionActivities(session, questions);

    expect(activities).toEqual([
      { activityType: 'question', activityId: 'q1' },
      { activityType: 'slide', activityId: 's1' },
    ]);
    expect(getActivityIds(activities)).toEqual(['q1', 's1']);
    expect(findActivityIndex(activities, 's1')).toBe(1);
  });

  it('normalizes activity ids when locating the current item', () => {
    const activities = [{ activityType: 'question', activityId: 42 }];

    expect(findActivityIndex(activities, '42')).toBe(0);
    expect(getActivityIds(activities)).toEqual(['42']);
  });
});
