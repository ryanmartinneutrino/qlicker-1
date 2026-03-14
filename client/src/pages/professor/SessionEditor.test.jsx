import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionEditor from './SessionEditor';

const {
  navigateMock,
  requestCloseMock,
  apiClientMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  requestCloseMock: vi.fn(),
  apiClientMock: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ courseId: 'course-1', sessionId: 'session-1' }),
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: {} }),
    useSearchParams: () => [new URLSearchParams('returnTab=1')],
  };
});

vi.mock('../../api/client', () => ({
  default: apiClientMock,
}));

vi.mock('../../components/questions/QuestionEditor', () => ({
  default: React.forwardRef(function MockQuestionEditor(_props, ref) {
    React.useImperativeHandle(ref, () => ({
      requestClose: requestCloseMock,
    }));
    return <div>Mock Question Editor</div>;
  }),
}));

vi.mock('../../components/questions/QuestionDisplay', () => ({
  default: ({ question }) => <div>{question?.content || ''}</div>,
}));

vi.mock('../../components/common/AutoSaveStatus', () => ({
  default: () => null,
}));

vi.mock('../../components/common/BackLinkButton', () => ({
  default: ({ label, onClick }) => <button type="button" onClick={onClick}>{label}</button>,
}));

vi.mock('../../components/common/DateTimePreferenceField', () => ({
  default: ({ label, value = '', onChange }) => (
    <input
      aria-label={label}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

vi.mock('../../components/common/SessionStatusChip', () => ({
  default: ({ status }) => <div>{status}</div>,
}));

vi.mock('../../utils/courseTitle', () => ({
  buildCourseTitle: () => 'CS 101',
}));

describe('SessionEditor inline close behavior', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    requestCloseMock.mockReset();
    apiClientMock.get.mockReset();
    apiClientMock.patch.mockReset();
    apiClientMock.post.mockReset();
    apiClientMock.delete.mockReset();

    apiClientMock.get.mockImplementation((url) => {
      if (url === '/sessions/session-1') {
        return Promise.resolve({
          data: {
            session: {
              _id: 'session-1',
              name: 'Draft Session',
              description: '',
              quiz: false,
              practiceQuiz: false,
              msScoringMethod: 'right-minus-wrong',
              reviewable: false,
              status: 'hidden',
              questions: ['q1'],
              quizExtensions: [],
            },
          },
        });
      }

      if (url === '/questions/q1') {
        return Promise.resolve({
          data: {
            question: {
              _id: 'q1',
              type: 2,
              content: 'Original content',
              plainText: 'Original content',
              options: [],
              sessionOptions: { points: 1 },
            },
          },
        });
      }

      if (url === '/sessions/session-1/results') {
        return Promise.resolve({ data: { studentResults: [] } });
      }

      if (url === '/settings/public') {
        return Promise.resolve({ data: { timeFormat: '24h' } });
      }

      if (url === '/courses/course-1') {
        return Promise.resolve({
          data: {
            course: {
              _id: 'course-1',
              name: 'Test Course',
              deptCode: 'CS',
              courseNumber: '101',
              section: '001',
              quizTimeFormat: 'inherit',
              students: [],
            },
          },
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
  });

  it('routes outer close buttons through the question editor close handler', async () => {
    render(<SessionEditor />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'common.edit' }))[0]);
    expect(screen.getByText('Mock Question Editor')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'professor.sessionEditor.closeEditor' })[0]);

    await waitFor(() => {
      expect(requestCloseMock).toHaveBeenCalledTimes(1);
    });
  });
});
