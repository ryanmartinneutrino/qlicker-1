import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SessionReview, { buildSessionResultsCsv } from './SessionReview';
import apiClient from '../../api/client';
import i18n from '../../i18n';

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

function renderSessionReview() {
  return render(
    <MemoryRouter initialEntries={['/prof/course/course-1/session/session-1/review']}>
      <Routes>
        <Route path="/prof/course/:courseId/session/:sessionId/review" element={<SessionReview />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SessionReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage('en');

    apiClient.get.mockImplementation(async (url) => {
      if (url === '/sessions/session-1/results') {
        return {
          data: {
            session: {
              _id: 'session-1',
              name: 'Midterm review',
              status: 'done',
              reviewable: true,
              questions: ['q-1'],
            },
            questions: [
              {
                _id: 'q-1',
                type: 0,
                content: '<p>Pick one</p>',
                plainText: 'Pick one',
                sessionOptions: { points: 5 },
                options: [
                  { answer: 'A', plainText: 'A', correct: false },
                  { answer: 'B', plainText: 'B', correct: true },
                ],
              },
            ],
            studentResults: [
              {
                studentId: 'student-1',
                firstname: 'Ada',
                lastname: 'Lovelace',
                email: 'ada@example.edu',
                profileImage: 'https://example.edu/ada-full.png',
                profileThumbnail: 'https://example.edu/ada-thumb.png',
                inSession: true,
                participation: 100,
                questionResults: [
                  {
                    questionId: 'q-1',
                    responses: [
                      {
                        attempt: 2,
                        answer: '1',
                        createdAt: '2026-03-15T12:00:00.000Z',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        };
      }

      if (url === '/courses/course-1') {
        return {
          data: {
            course: {
              _id: 'course-1',
              name: 'Discrete Math',
              deptCode: 'MATH',
              courseNumber: '200',
              section: '001',
              semester: 'Fall 2026',
            },
          },
        };
      }

      if (url === '/sessions/session-1/grades') {
        return {
          data: {
            grades: [
              {
                _id: 'grade-1',
                userId: 'student-1',
                value: 87.5,
                participation: 100,
                marks: [
                  {
                    questionId: 'q-1',
                    points: 4,
                    outOf: 5,
                    needsGrading: false,
                  },
                ],
              },
            ],
          },
        };
      }

      if (url === '/courses/course-1/groups') {
        return { data: { groupCategories: [] } };
      }

      throw new Error(`Unexpected GET ${url}`);
    });
  });

  it('shows response-table answers with points and exports CSV points from session grades', async () => {
    renderSessionReview();

    await screen.findByText('Midterm review');
    fireEvent.click(screen.getByRole('tab', { name: /response data/i }));

    expect(await screen.findByText('B (4)')).toBeInTheDocument();
    expect(screen.queryByText(/attempt 2/i)).not.toBeInTheDocument();
    expect(screen.getByText('Grade')).toBeInTheDocument();
    expect(screen.getByText('87.5%')).toBeInTheDocument();

    const csvExport = buildSessionResultsCsv({
      csvQuestionAttempts: [
        {
          question: {
            _id: 'q-1',
            type: 0,
            options: [
              { answer: 'A', plainText: 'A', correct: false },
              { answer: 'B', plainText: 'B', correct: true },
            ],
          },
          questionNumber: 1,
          attempts: [2],
        },
      ],
      gradesByStudentId: {
        'student-1': {
          userId: 'student-1',
          marks: [{ questionId: 'q-1', points: 4 }],
        },
      },
      sessionName: 'Midterm review',
      studentResults: [
        {
          studentId: 'student-1',
          firstname: 'Ada',
          lastname: 'Lovelace',
          email: 'ada@example.edu',
          participation: 100,
          questionResults: [
            {
              questionId: 'q-1',
              responses: [{ attempt: 2, answer: '1', createdAt: '2026-03-15T12:00:00.000Z' }],
            },
          ],
        },
      ],
      t: i18n.t.bind(i18n),
    });

    expect(csvExport.filename).toBe('Midterm_review_results.csv');
    expect(csvExport.csvContent).toContain('Q1 Response,Q1 Points');
    expect(csvExport.csvContent).toContain('ada@example.edu,100%,B,4');
  });

  it('opens the student avatar image from the students tab', async () => {
    renderSessionReview();

    await screen.findByText('Midterm review');
    fireEvent.click(screen.getByRole('tab', { name: /students/i }));
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByRole('button', { name: /ada lovelace/i }));

    expect(await screen.findByRole('img', { name: 'Ada Lovelace' })).toBeInTheDocument();
  });
});
