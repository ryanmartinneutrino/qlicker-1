import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function buildResultsPayload(sessionOverrides = {}) {
  return {
    session: {
      _id: 'session-1',
      name: 'Midterm review',
      status: 'done',
      reviewable: true,
      questions: ['q-1'],
      ...sessionOverrides,
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
        joinedAt: '2026-03-15T12:05:00.000Z',
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
      {
        studentId: 'student-2',
        firstname: 'Grace',
        lastname: 'Hopper',
        email: 'grace@example.edu',
        profileImage: 'https://example.edu/grace-full.png',
        profileThumbnail: 'https://example.edu/grace-thumb.png',
        inSession: false,
        participation: 50,
        joinedAt: '2026-03-15T11:55:00.000Z',
        questionResults: [
          {
            questionId: 'q-1',
            responses: [
              {
                attempt: 1,
                answer: '0',
                createdAt: '2026-03-15T11:56:00.000Z',
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('SessionReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage('en');

    apiClient.get.mockImplementation(async (url) => {
      if (url === '/sessions/session-1/results') {
        return {
          data: buildResultsPayload(),
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
              {
                _id: 'grade-2',
                userId: 'student-2',
                value: 20,
                participation: 50,
                marks: [
                  {
                    questionId: 'q-1',
                    points: 1,
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

  it('shows the consolidated response data table, sorts rows, and exports the visible CSV', async () => {
    const originalBlob = globalThis.Blob;
    let downloadedBlob = null;
    class BlobSpy {
      constructor(parts, options = {}) {
        this.parts = parts;
        this.type = options.type;
      }
    }
    vi.stubGlobal('Blob', BlobSpy);
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      downloadedBlob = blob;
      return 'blob:session-review-test';
    });
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderSessionReview();

    await screen.findByText('Midterm review');
    expect(screen.queryByRole('tab', { name: /students/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /response data/i }));

    expect(await screen.findByText('B (4)')).toBeInTheDocument();
    expect(screen.getByText('A (1)')).toBeInTheDocument();
    expect(screen.getByText('Grade')).toBeInTheDocument();
    expect(screen.getByText('87.5%')).toBeInTheDocument();
    expect(screen.getAllByText('Joined Session').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /export results to csv/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Joined Session' }));

    const resultsTable = screen.getByRole('table', { name: /student results/i });
    await waitFor(() => {
      const rows = within(resultsTable).getAllByRole('row');
      expect(within(rows[1]).getByText('Grace Hopper')).toBeInTheDocument();
      expect(within(rows[2]).getByText('Ada Lovelace')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText(/search students/i);
    fireEvent.change(searchInput, { target: { value: 'ada@example.edu' } });

    await waitFor(() => {
      const filteredRows = within(resultsTable).getAllByRole('row');
      expect(within(filteredRows[1]).getByText('Ada Lovelace')).toBeInTheDocument();
      expect(within(resultsTable).queryByText('Grace Hopper')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /export results to csv/i }));

    expect(clickSpy).toHaveBeenCalled();
    expect(downloadedBlob).toBeTruthy();
    const csvText = downloadedBlob.parts.join('');
    expect(csvText).toContain('Last Name,First Name,Email,Grade,In Session,Participation,Percent Correct,Joined Session');
    expect(csvText).toContain('Q1 Attempt 1 Response,Q1 Attempt 1 Points,Q1 Attempt 2 Response,Q1 Attempt 2 Points');
    expect(csvText).toContain('Lovelace,Ada,ada@example.edu,87.5%,Yes,100%,100%');
    expect(csvText).toContain(',B,4');
    expect(csvText).not.toContain('grace@example.edu');

    vi.stubGlobal('Blob', originalBlob);
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    clickSpy.mockRestore();
    expect(screen.queryByText(/attempt 2/i)).not.toBeInTheDocument();
  });

  it('builds CSV rows for the visible students in table order with split identity columns', async () => {
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
          value: 87.5,
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
          inSession: true,
          participation: 100,
          joinedAt: '2026-03-15T12:05:00.000Z',
          questionResults: [
            {
              questionId: 'q-1',
              responses: [{ attempt: 2, answer: '1', createdAt: '2026-03-15T12:00:00.000Z' }],
            },
          ],
        },
      ],
      visibleStudents: [
        {
          studentId: 'student-1',
          percentCorrectValue: 100,
        },
      ],
      t: i18n.t.bind(i18n),
    });

    expect(csvExport.filename).toBe('Midterm_review_results.csv');
    expect(csvExport.csvContent).toContain('Last Name,First Name,Email,Grade,In Session,Participation,Percent Correct,Joined Session,Q1 Response,Q1 Points');
    expect(csvExport.csvContent).toContain('Lovelace,Ada,ada@example.edu,87.5%,Yes,100%,100%');
    expect(csvExport.csvContent).toContain(',B,4');
  });

  it('opens the student avatar image from the response data tab', async () => {
    renderSessionReview();

    await screen.findByText('Midterm review');
    fireEvent.click(screen.getByRole('tab', { name: /response data/i }));
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByRole('button', { name: /ada lovelace/i }));

    expect(await screen.findByRole('img', { name: 'Ada Lovelace' })).toBeInTheDocument();
  });

  it('loads running live interactive sessions but warns that grading stays locked', async () => {
    apiClient.get.mockImplementation(async (url) => {
      if (url === '/sessions/session-1/results') {
        return {
          data: buildResultsPayload({ status: 'running', reviewable: false, quiz: false, practiceQuiz: false }),
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
            grades: [],
          },
        };
      }
      if (url === '/courses/course-1/groups') {
        return { data: { groupCategories: [] } };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderSessionReview();

    await screen.findByText('Midterm review');
    expect(screen.getByText(/results continue to update here, but grading stays locked until the session ends/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /grading/i }));
    expect(await screen.findByText(/this grading interface is locked while the session is live/i)).toBeInTheDocument();
    expect(screen.queryByText(/results will be available after the session ends/i)).not.toBeInTheDocument();
  });

  it('makes sessions reviewable through the dedicated reviewable endpoint without a confirm dialog', async () => {
    apiClient.get.mockImplementation(async (url) => {
      if (url === '/sessions/session-1/results') {
        return {
          data: buildResultsPayload({ reviewable: false }),
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
        return { data: { grades: [] } };
      }
      if (url === '/courses/course-1/groups') {
        return { data: { groupCategories: [] } };
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    apiClient.patch
      .mockResolvedValueOnce({
        data: {
          session: buildResultsPayload({ reviewable: true }).session,
          grading: null,
          nonAutoGradeableWarning: null,
        },
      });

    renderSessionReview();

    const toggle = await screen.findByRole('switch', { name: /toggle student review access/i });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledTimes(1);
      expect(apiClient.patch).toHaveBeenCalledWith('/sessions/session-1/reviewable', { reviewable: true });
      expect(toggle).toBeChecked();
    });
  });
});
