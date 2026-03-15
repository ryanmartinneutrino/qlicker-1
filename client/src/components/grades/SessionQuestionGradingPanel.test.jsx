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
});
