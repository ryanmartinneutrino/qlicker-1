import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CourseGradesPanel from './CourseGradesPanel';
import apiClient from '../../api/client';

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

function buildGradesPayload() {
  return {
    sessions: [
      {
        _id: 'session-1',
        name: 'Week 1',
        marksNeedingGrading: 5,
      },
    ],
    rows: [
      {
        student: {
          studentId: 'student-1',
          firstname: 'Ada',
          lastname: 'Lovelace',
          email: 'ada@example.edu',
        },
        avgParticipation: 92.5,
        grades: [
          {
            _id: 'grade-1',
            sessionId: 'session-1',
            value: 87.5,
            participation: 95,
            needsGrading: true,
            joined: true,
            points: 7,
            outOf: 8,
            marks: [],
          },
        ],
      },
    ],
  };
}

describe('CourseGradesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: buildGradesPayload() });
  });

  it('uses student-mode grading labels without numeric ungraded counts', async () => {
    render(<CourseGradesPanel courseId="course-1" instructorView={false} />);

    await screen.findByText(/week 1 mark/i);
    expect(screen.queryByLabelText(/search students/i)).not.toBeInTheDocument();
    expect(screen.getByText('Ungraded')).toBeInTheDocument();
    expect(screen.queryByText(/5 ungraded/i)).not.toBeInTheDocument();
  });

  it('keeps instructor search and numeric ungraded counts', async () => {
    render(<CourseGradesPanel courseId="course-1" instructorView />);

    await screen.findByText(/week 1 mark/i);
    expect(screen.getByLabelText(/search students/i)).toBeInTheDocument();
    expect(screen.getByText(/5 ungraded/i)).toBeInTheDocument();
  });
});
