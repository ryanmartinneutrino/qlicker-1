import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PracticeSessionEditor from './PracticeSessionEditor';

const {
  apiClientMock,
  tMock,
  questionEditorPropsMock,
} = vi.hoisted(() => ({
  apiClientMock: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  tMock: vi.fn((key, options) => options?.defaultValue ?? key),
  questionEditorPropsMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tMock }),
}));

vi.mock('../../api/client', () => ({
  default: apiClientMock,
}));

vi.mock('../../components/common/BackLinkButton', () => ({
  default: ({ label, onClick }) => <button type="button" onClick={onClick}>{label}</button>,
}));

vi.mock('../../components/questions/QuestionDisplay', () => ({
  default: ({ question }) => <div>{question?.content || ''}</div>,
}));

vi.mock('../../components/questions/QuestionEditor', () => ({
  default: React.forwardRef(function MockQuestionEditor(props, ref) {
    React.useImperativeHandle(ref, () => ({
      requestClose: vi.fn(),
    }));
    questionEditorPropsMock(props);
    return <div>Mock Question Editor</div>;
  }),
}));

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/student/course/course-1/practice-sessions/new']}>
      <Routes>
        <Route path="/student/course/:courseId/practice-sessions/new" element={<PracticeSessionEditor />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PracticeSessionEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    apiClientMock.get.mockImplementation((url) => {
      if (url === '/courses/course-1') {
        return Promise.resolve({
          data: {
            course: {
              _id: 'course-1',
              name: 'Course One',
              deptCode: 'CS',
              courseNumber: '101',
              section: '001',
              semester: 'Fall 2026',
              tags: [{ value: 'algebra', label: 'algebra' }],
            },
          },
        });
      }

      if (url === '/courses/course-1/questions?limit=100') {
        return Promise.resolve({
          data: {
            questions: [
              { _id: 'q-1', content: 'Existing question' },
            ],
          },
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
  });

  it('loads questions with the supported limit and keeps student question creation private', async () => {
    renderEditor();

    expect(await screen.findByText('Existing question')).toBeInTheDocument();
    expect(apiClientMock.get).toHaveBeenCalledWith('/courses/course-1/questions?limit=100');

    fireEvent.click(screen.getByRole('button', { name: 'New question' }));

    expect(await screen.findByText('Mock Question Editor')).toBeInTheDocument();
    expect(questionEditorPropsMock).toHaveBeenCalledWith(expect.objectContaining({
      showVisibilityControls: false,
      allowCustomTags: false,
      tagSuggestions: [{ value: 'algebra', label: 'algebra' }],
    }));
  });
});
