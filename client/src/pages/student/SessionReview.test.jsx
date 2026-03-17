import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SessionReview from './SessionReview';
import apiClient from '../../api/client';
import i18n from '../../i18n';

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('Student SessionReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage('en');

    apiClient.get.mockImplementation(async (url) => {
      if (url === '/sessions/session-1/review') {
        return {
          data: {
            session: {
              _id: 'session-1',
              name: 'Practice review',
              quiz: true,
              practiceQuiz: true,
              studentCreated: true,
            },
            questions: [
              {
                _id: 'q-1',
                type: 0,
                content: '<p>Pick one</p>',
                plainText: 'Pick one',
                sessionOptions: { points: 1 },
                options: [
                  { answer: 'A', plainText: 'A', correct: true },
                  { answer: 'B', plainText: 'B', correct: false },
                ],
              },
            ],
            responses: {
              'q-1': [{ attempt: 1, answer: '0' }],
            },
            feedback: {
              feedbackSeenAt: null,
              feedbackQuestionIds: [],
              feedbackCount: 0,
              newFeedbackQuestionIds: [],
              newFeedbackCount: 0,
              hasNewFeedback: false,
            },
          },
        };
      }

      if (url === '/sessions/session-1/grades') {
        return {
          data: {
            grades: [
              {
                userId: 'student-1',
                value: 100,
                points: 1,
                outOf: 1,
                participation: 100,
                marks: [{ questionId: 'q-1', points: 1, outOf: 1 }],
              },
            ],
          },
        };
      }

      throw new Error(`Unexpected GET ${url}`);
    });
  });

  it('renders without hook-order warnings after loading review data', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={['/student/course/course-1/session/session-1/review']}>
        <Routes>
          <Route path="/student/course/:courseId/session/:sessionId/review" element={<SessionReview />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Practice review')).toBeInTheDocument();

    await waitFor(() => {
      expect(
        consoleErrorSpy.mock.calls.some((call) => (
          call.some((value) => String(value).includes('change in the order of Hooks'))
        ))
      ).toBe(false);
    });

    expect(apiClient.get).not.toHaveBeenCalledWith('/sessions/session-1/grades');

    consoleErrorSpy.mockRestore();
  });
});
