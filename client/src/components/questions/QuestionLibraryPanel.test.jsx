import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuestionLibraryPanel from './QuestionLibraryPanel';

const {
  apiClientMock,
  tMock,
  requestCloseMock,
} = vi.hoisted(() => ({
  apiClientMock: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  tMock: vi.fn((key, options) => options?.defaultValue ?? key),
  requestCloseMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: tMock,
  }),
}));

vi.mock('../../api/client', () => ({
  default: apiClientMock,
}));

vi.mock('./QuestionDisplay', () => ({
  default: ({ question }) => <div>{question?.content || ''}</div>,
}));

vi.mock('./QuestionEditor', () => ({
  default: React.forwardRef(function MockQuestionEditor(_props, ref) {
    React.useImperativeHandle(ref, () => ({
      requestClose: requestCloseMock,
    }));
    return <div>Mock Question Editor</div>;
  }),
}));

describe('QuestionLibraryPanel', () => {
  beforeEach(() => {
    apiClientMock.get.mockReset();
    apiClientMock.post.mockReset();
    apiClientMock.patch.mockReset();
    apiClientMock.delete.mockReset();
    tMock.mockClear();
    requestCloseMock.mockReset();

    apiClientMock.get.mockImplementation((url) => {
      if (url === '/courses') {
        return Promise.resolve({
          data: {
            courses: [
              { _id: 'course-1', name: 'Course One', instructors: ['prof-1'] },
            ],
          },
        });
      }

      if (url === '/courses/course-1/sessions') {
        return Promise.resolve({
          data: {
            sessions: [
              { _id: 'session-1', name: 'Session One', status: 'hidden' },
            ],
          },
        });
      }

      if (url === '/courses/course-1/question-tags?limit=100') {
        return Promise.resolve({
          data: {
            tags: [{ value: 'algebra', label: 'algebra' }],
          },
        });
      }

      if (url.startsWith('/courses/course-1/questions?') && url.includes('idsOnly=true')) {
        return Promise.resolve({
          data: {
            questionIds: ['q1'],
            total: 1,
          },
        });
      }

      if (url.startsWith('/courses/course-1/questions?')) {
        return Promise.resolve({
          data: {
            questions: [
              {
                _id: 'q1',
                type: 2,
                content: 'Library question content',
                approved: false,
                hasResponses: true,
                linkedSessions: [{ _id: 'session-1', name: 'Session One' }],
                tags: [
                  { value: 'algebra', label: 'algebra' },
                  { value: 'Qlicker', label: 'Qlicker' },
                ],
              },
            ],
            total: 1,
            page: 1,
            limit: 10,
            questionTypes: [2],
          },
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
  });

  it('loads course-library questions and supports selecting all filtered matches', async () => {
    render(
      <QuestionLibraryPanel
        courseId="course-1"
        availableSessions={[{ _id: 'session-1', name: 'Session One', status: 'hidden' }]}
      />
    );

    expect(await screen.findByText('Library question content')).toBeInTheDocument();
    expect(screen.getByText('Session One')).toBeInTheDocument();
    expect(screen.getAllByText('Short Answer').length).toBeGreaterThan(0);
    expect(screen.getByText('Has responses')).toBeInTheDocument();
    expect(screen.getByText('Unapproved')).toBeInTheDocument();
    expect(screen.getByText('algebra')).toBeInTheDocument();
    expect(screen.queryByText('Qlicker')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select all filtered' }));

    await waitFor(() => {
      expect(apiClientMock.get).toHaveBeenCalledWith(expect.stringContaining('idsOnly=true'));
    });

    expect(screen.getByRole('button', { name: 'Export JSON' })).not.toBeDisabled();
  });

  it('uses edit and close icons that route closing through the editor close handler', async () => {
    render(
      <QuestionLibraryPanel
        courseId="course-1"
        availableSessions={[{ _id: 'session-1', name: 'Session One', status: 'hidden' }]}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'common.edit' }));
    expect(screen.getByText('Mock Question Editor')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'professor.sessionEditor.closeEditor' }));

    await waitFor(() => {
      expect(requestCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  it('bulk-updates selected question visibility from the library modal', async () => {
    render(
      <QuestionLibraryPanel
        courseId="course-1"
        availableSessions={[{ _id: 'session-1', name: 'Session One', status: 'hidden' }]}
      />
    );

    await screen.findByText('Library question content');

    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Change visibility' }));

    expect(screen.queryByText(/Students normally see session questions by making that session reviewable/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Visible to any prof on Qlicker'));

    expect(screen.getByText(/Students normally see session questions by making that session reviewable/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => {
      expect(apiClientMock.post).toHaveBeenCalledWith('/questions/bulk-visibility', {
        questionIds: ['q1'],
        public: true,
        publicOnQlicker: true,
        publicOnQlickerForStudents: false,
      });
    });
  });
});
