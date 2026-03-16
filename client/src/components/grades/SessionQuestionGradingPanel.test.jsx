import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionQuestionGradingPanel, { buildResponseSummary } from './SessionQuestionGradingPanel';
import apiClient from '../../api/client';
import i18n from '../../i18n';

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

function buildGradesPayload() {
  return {
    grades: [
      {
        _id: 'grade-1',
        userId: 'student-a',
        marks: [{ questionId: 'q-mc', points: 1, outOf: 1, needsGrading: false }],
      },
      {
        _id: 'grade-2',
        userId: 'student-b',
        marks: [{ questionId: 'q-mc', points: 0, outOf: 1, needsGrading: false }],
      },
    ],
  };
}

describe('SessionQuestionGradingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage('en');
    apiClient.get.mockResolvedValue({ data: buildGradesPayload() });
    apiClient.patch.mockResolvedValue({ data: { grade: { _id: 'grade-1', userId: 'student-a', marks: [{ questionId: 'q-manual', points: 0, outOf: 5, needsGrading: false }] } } });
    apiClient.post.mockResolvedValue({ data: {} });
  });

  it('debounces answer filtering and matches MC answers by option label instead of option text', async () => {
    render(
      <SessionQuestionGradingPanel
        sessionId="session-1"
        session={{ _id: 'session-1', quiz: false, practiceQuiz: false }}
        questions={[
          {
            _id: 'q-mc',
            type: 0,
            content: '<p>Pick one</p>',
            plainText: 'Pick one',
            sessionOptions: { points: 1 },
            options: [
              { answer: 'Correct', plainText: 'Correct', correct: true },
              { answer: 'Alpha distractor', plainText: 'Alpha distractor', correct: false },
            ],
          },
        ]}
        studentResults={[
          {
            studentId: 'student-a',
            firstname: 'Ada',
            lastname: 'Lovelace',
            email: 'ada@example.edu',
            inSession: true,
            questionResults: [{ questionId: 'q-mc', responses: [{ attempt: 1, answer: '0' }] }],
          },
          {
            studentId: 'student-b',
            firstname: 'Grace',
            lastname: 'Hopper',
            email: 'grace@example.edu',
            inSession: true,
            questionResults: [{ questionId: 'q-mc', responses: [{ attempt: 1, answer: '1' }] }],
          },
        ]}
      />
    );

    await screen.findByText('Ada Lovelace');
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search answer content/i), { target: { value: 'A' } });

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
    });
  });

  it('builds filter text for TF, numerical, and short-answer responses using the searchable answer value', () => {
    expect(buildResponseSummary(
      {
        type: 1,
        options: [
          { answer: 'True', plainText: 'True', correct: true },
          { answer: 'False', plainText: 'False', correct: false },
        ],
      },
      { answer: '0' }
    ).filterText).toBe('true');

    expect(buildResponseSummary(
      { type: 4 },
      { answer: '12.345' }
    ).filterText).toBe('12.345');

    expect(buildResponseSummary(
      { type: 2 },
      { answer: 'Derivative is positive', answerWysiwyg: '<p>Derivative is positive</p>' }
    ).filterText.toLowerCase()).toContain('derivative is positive');
  });

  it('allows saving a manual zero when the mark previously had no explicit score', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        grades: [
          {
            _id: 'grade-1',
            userId: 'student-a',
            marks: [{ questionId: 'q-manual', points: null, outOf: 5, needsGrading: true, feedback: '' }],
          },
        ],
      },
    });

    render(
      <SessionQuestionGradingPanel
        sessionId="session-1"
        session={{ _id: 'session-1', quiz: false, practiceQuiz: false }}
        questions={[
          {
            _id: 'q-manual',
            type: 2,
            content: '<p>Explain your reasoning</p>',
            plainText: 'Explain your reasoning',
            sessionOptions: { points: 5 },
          },
        ]}
        studentResults={[
          {
            studentId: 'student-a',
            firstname: 'Ada',
            lastname: 'Lovelace',
            email: 'ada@example.edu',
            inSession: true,
            questionResults: [{ questionId: 'q-manual', responses: [{ attempt: 1, answer: 'Because it works.' }] }],
          },
        ]}
      />
    );

    await screen.findByText('Ada Lovelace');

    const saveButton = screen.getAllByRole('button', { name: /save/i }).find((button) => !button.disabled);
    expect(saveButton).toBeTruthy();
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/grades/grade-1/marks/q-manual',
        { points: 0, feedback: '' }
      );
    });
  });

  it('filters the grading table down to students with responses only', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        grades: [
          {
            _id: 'grade-1',
            userId: 'student-a',
            marks: [{ questionId: 'q-manual', points: 3, outOf: 5, needsGrading: false, feedback: '' }],
          },
          {
            _id: 'grade-2',
            userId: 'student-b',
            marks: [{ questionId: 'q-manual', points: 0, outOf: 5, needsGrading: false, feedback: '' }],
          },
        ],
      },
    });

    render(
      <SessionQuestionGradingPanel
        sessionId="session-1"
        session={{ _id: 'session-1', quiz: false, practiceQuiz: false }}
        questions={[
          {
            _id: 'q-manual',
            type: 2,
            content: '<p>Explain your reasoning</p>',
            plainText: 'Explain your reasoning',
            sessionOptions: { points: 5 },
          },
        ]}
        studentResults={[
          {
            studentId: 'student-a',
            firstname: 'Ada',
            lastname: 'Lovelace',
            email: 'ada@example.edu',
            inSession: true,
            questionResults: [{ questionId: 'q-manual', responses: [{ attempt: 1, answer: 'Has response' }] }],
          },
          {
            studentId: 'student-b',
            firstname: 'Grace',
            lastname: 'Hopper',
            email: 'grace@example.edu',
            inSession: true,
            questionResults: [{ questionId: 'q-manual', responses: [] }],
          },
        ]}
      />
    );

    await screen.findByText('Ada Lovelace');
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/only with responses/i));

    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
    });
  });

  it('applies bulk grading changes only to selected filtered students', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        grades: [
          {
            _id: 'grade-1',
            userId: 'student-a',
            marks: [{ questionId: 'q-manual', points: 1, outOf: 5, needsGrading: false, feedback: '' }],
          },
          {
            _id: 'grade-2',
            userId: 'student-b',
            marks: [{ questionId: 'q-manual', points: 2, outOf: 5, needsGrading: false, feedback: '' }],
          },
        ],
      },
    });
    apiClient.patch
      .mockResolvedValueOnce({ data: { grade: { _id: 'grade-1', userId: 'student-a', marks: [{ questionId: 'q-manual', points: 4, outOf: 5, needsGrading: false, feedback: '' }] } } })
      .mockResolvedValueOnce({ data: { grade: { _id: 'grade-2', userId: 'student-b', marks: [{ questionId: 'q-manual', points: 4, outOf: 5, needsGrading: false, feedback: '' }] } } });

    render(
      <SessionQuestionGradingPanel
        sessionId="session-1"
        session={{ _id: 'session-1', quiz: false, practiceQuiz: false }}
        questions={[
          {
            _id: 'q-manual',
            type: 2,
            content: '<p>Explain your reasoning</p>',
            plainText: 'Explain your reasoning',
            sessionOptions: { points: 5 },
          },
        ]}
        studentResults={[
          {
            studentId: 'student-a',
            firstname: 'Ada',
            lastname: 'Lovelace',
            email: 'ada@example.edu',
            inSession: true,
            questionResults: [{ questionId: 'q-manual', responses: [{ attempt: 1, answer: 'First response' }] }],
          },
          {
            studentId: 'student-b',
            firstname: 'Grace',
            lastname: 'Hopper',
            email: 'grace@example.edu',
            inSession: true,
            questionResults: [{ questionId: 'q-manual', responses: [{ attempt: 1, answer: 'Second response' }] }],
          },
        ]}
      />
    );

    await screen.findByText('Ada Lovelace');

    const [bulkSaveButton] = screen.getAllByRole('button', { name: /^save$/i });
    expect(bulkSaveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/bulk points/i), { target: { value: '4' } });
    expect(bulkSaveButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/select student: ada lovelace/i));
    expect(bulkSaveButton).not.toBeDisabled();

    fireEvent.click(bulkSaveButton);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledTimes(1);
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/grades/grade-1/marks/q-manual',
        { points: 4 }
      );
    });
  });
});
