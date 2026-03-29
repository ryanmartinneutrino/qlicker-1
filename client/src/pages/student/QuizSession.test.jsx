import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuizSession from './QuizSession';
import apiClient from '../../api/client';
import i18n from '../../i18n';
import { QUESTION_TYPES } from '../../components/questions/constants';

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
  getAccessToken: vi.fn(() => null),
}));

describe('Student QuizSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage('en');

    apiClient.get.mockImplementation(async (url) => {
      if (url === '/sessions/session-1/quiz') {
        return {
          data: {
            session: {
              _id: 'session-1',
              name: 'Math quiz',
              quiz: true,
              practiceQuiz: false,
              studentCreated: false,
            },
            questions: [
              {
                _id: 'q-1',
                type: QUESTION_TYPES.MULTIPLE_CHOICE,
                content: '<p>Select the correct option</p>',
                plainText: 'Select the correct option',
                options: [
                  {
                    _id: 'opt-1',
                    content: '<p><br></p>',
                    plainText: '\\(x^2\\)',
                    correct: true,
                  },
                  {
                    _id: 'opt-2',
                    content: '<p>Not math</p>',
                    plainText: 'Not math',
                    correct: false,
                  },
                ],
                sessionOptions: { points: 1 },
              },
            ],
            responses: {},
            allAnswered: false,
            submitted: false,
          },
        };
      }

      throw new Error(`Unexpected GET ${url}`);
    });
  });

  it('renders math from option plain-text fallbacks for quiz MC options', async () => {
    const view = (
      <MemoryRouter initialEntries={['/student/course/course-1/session/session-1/quiz']}>
        <Routes>
          <Route path="/student/course/:courseId/session/:sessionId/quiz" element={<QuizSession />} />
        </Routes>
      </MemoryRouter>
    );
    const { container, rerender } = render(view);

    expect(await screen.findByText('Math quiz')).toBeInTheDocument();

    await waitFor(() => {
      expect(container.querySelector('.katex')).not.toBeNull();
    });

    rerender(view);

    await waitFor(() => {
      expect(container.querySelector('.katex')).not.toBeNull();
    });
    expect(screen.queryByText('\\(x^2\\)')).not.toBeInTheDocument();
  });

  it('shows numerical tolerance helper text next to the answer input', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        session: {
          _id: 'session-1',
          name: 'Math quiz',
          quiz: true,
          practiceQuiz: false,
          studentCreated: false,
        },
        questions: [
          {
            _id: 'q-1',
            type: QUESTION_TYPES.NUMERICAL,
            content: '<p>Estimate the value</p>',
            plainText: 'Estimate the value',
            toleranceNumerical: 0.00012,
            sessionOptions: { points: 1 },
          },
        ],
        responses: {},
        allAnswered: false,
        submitted: false,
      },
    });

    render(
      <MemoryRouter initialEntries={['/student/course/course-1/session/session-1/quiz']}>
        <Routes>
          <Route path="/student/course/:courseId/session/:sessionId/quiz" element={<QuizSession />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Answers will be scored based on a tolerance of +/- 1.2E-4.')).toBeInTheDocument();
  });
});
