import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LiveSession from './LiveSession';
import apiClient from '../../api/client';
import i18n from '../../i18n';
import { QUESTION_TYPES } from '../../components/questions/constants';

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../contexts/LiveSessionWebSocketContext', () => ({
  LiveSessionWebSocketProvider: ({ children }) => children,
  useLiveSessionWebSocket: () => ({
    lastEvent: null,
    registerRefreshHandler: () => () => {},
    transport: 'polling',
  }),
}));

vi.mock('../../hooks/useLiveSessionTelemetry', () => ({
  default: () => ({
    recordEventReceipt: () => null,
    recordLiveFetch: () => null,
    scheduleUiSyncMeasurement: () => {},
  }),
}));

describe('Student LiveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage('en');

    apiClient.get.mockImplementation(async (url) => {
      if (url === '/sessions/session-1/live') {
        return {
          data: {
            session: {
              _id: 'session-1',
              name: 'Live math session',
            },
            currentQuestion: {
              _id: 'q-1',
              type: QUESTION_TYPES.MULTI_SELECT,
              content: '<p>Select all matching options</p>',
              plainText: 'Select all matching options',
              options: [
                {
                  _id: 'opt-1',
                  content: '<p><br></p>',
                  plainText: '\\(x^2\\)',
                  correct: true,
                },
                {
                  _id: 'opt-2',
                  content: '<p>Other</p>',
                  plainText: 'Other',
                  correct: false,
                },
              ],
              sessionOptions: {
                hidden: false,
                stats: false,
                correct: false,
                attempts: [{ number: 1, closed: false }],
              },
            },
            currentAttempt: { number: 1, closed: false },
            isJoined: true,
            questionHidden: false,
            showStats: false,
            showCorrect: false,
            responseStats: null,
            studentResponse: null,
            questionCount: 1,
            questionNumber: 1,
            questionProgress: { current: 1, total: 1 },
            pageProgress: { current: 1, total: 1 },
          },
        };
      }

      throw new Error(`Unexpected GET ${url}`);
    });
  });

  it('renders math from option plain-text fallbacks for live MS options', async () => {
    const view = (
      <MemoryRouter initialEntries={['/student/course/course-1/live/session-1']}>
        <Routes>
          <Route path="/student/course/:courseId/live/:sessionId" element={<LiveSession />} />
        </Routes>
      </MemoryRouter>
    );
    const { container, rerender } = render(view);

    expect(await screen.findByText('Live math session')).toBeInTheDocument();

    await waitFor(() => {
      expect(container.querySelector('.katex')).not.toBeNull();
    });

    rerender(view);

    await waitFor(() => {
      expect(container.querySelector('.katex')).not.toBeNull();
    });
    expect(screen.queryByText('\\(x^2\\)')).not.toBeInTheDocument();
  });

  it('shows numerical tolerance helper text next to the live answer input', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        session: {
          _id: 'session-1',
          name: 'Live math session',
          status: 'running',
        },
        currentQuestion: {
          _id: 'q-1',
          type: QUESTION_TYPES.NUMERICAL,
          content: '<p>Estimate the value</p>',
          plainText: 'Estimate the value',
          toleranceNumerical: 12345,
          sessionOptions: {
            hidden: false,
            stats: false,
            correct: false,
            attempts: [{ number: 1, closed: false }],
          },
        },
        currentAttempt: { number: 1, closed: false },
        isJoined: true,
        questionHidden: false,
        showStats: false,
        showCorrect: false,
        responseStats: null,
        studentResponse: null,
        questionCount: 1,
        questionNumber: 1,
        questionProgress: { current: 1, total: 1 },
        pageProgress: { current: 1, total: 1 },
      },
    });

    render(
      <MemoryRouter initialEntries={['/student/course/course-1/live/session-1']}>
        <Routes>
          <Route path="/student/course/:courseId/live/:sessionId" element={<LiveSession />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Answers will be scored based on a tolerance of \+\/- 1\.2345E4\./i)).toBeInTheDocument();
  });
});
