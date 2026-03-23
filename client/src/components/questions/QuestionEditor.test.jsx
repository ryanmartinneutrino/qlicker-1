import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuestionEditor from './QuestionEditor';

const { tMock } = vi.hoisted(() => ({
  tMock: vi.fn((key, options) => options?.defaultValue ?? key),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tMock }),
}));

vi.mock('./RichTextEditor', () => ({
  default: ({ placeholder }) => <div>{placeholder}</div>,
}));

vi.mock('../common/AutoSaveStatus', () => ({
  default: () => <div>Autosave status</div>,
}));

describe('QuestionEditor', () => {
  it('disables tags and shows course-settings guidance when no course topics exist', () => {
    render(
      <QuestionEditor
        open
        inline
        initial={null}
        onAutoSave={vi.fn()}
        allowCustomTags={false}
        showVisibilityControls={false}
        showCourseTagSettingsHint
        tagSuggestions={[]}
      />
    );

    expect(screen.getByLabelText('Tags')).toBeDisabled();
    expect(screen.getByText('Only course-related topics can be added as question tags. Add course topics in Course Settings to enable tagging.')).toBeInTheDocument();
  });

  it('allows removing existing legacy tags when no course topics exist', async () => {
    vi.useFakeTimers();
    const onAutoSave = vi.fn().mockResolvedValue({ _id: 'question-legacy' });

    render(
      <QuestionEditor
        open
        inline
        initial={{
          _id: 'question-legacy',
          type: 2,
          content: '<p>Legacy tag question</p>',
          plainText: 'Legacy tag question',
          tags: [{ value: 'legacy-topic', label: 'legacy-topic' }],
          sessionOptions: { points: 1 },
        }}
        onAutoSave={onAutoSave}
        allowCustomTags={false}
        showVisibilityControls={false}
        showCourseTagSettingsHint
        tagSuggestions={[]}
      />
    );

    expect(screen.getByLabelText('Tags')).not.toBeDisabled();
    expect(screen.getByText('legacy-topic')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    fireEvent.keyDown(screen.getByLabelText('Tags'), { key: 'Backspace', code: 'Backspace' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });

    expect(onAutoSave).toHaveBeenCalledWith(expect.objectContaining({
      tags: [],
    }), 'question-legacy');
    expect(screen.getByLabelText('Tags')).toBeDisabled();

    vi.useRealTimers();
  });

  it('keeps visibility settings locked when the visibility controls are hidden', async () => {
    vi.useFakeTimers();
    const onAutoSave = vi.fn().mockResolvedValue({ _id: 'question-1' });

    render(
      <QuestionEditor
        open
        inline
        initial={{
          _id: 'question-1',
          type: 2,
          content: '<p>Question body</p>',
          options: [
            { content: '<p>Option 1</p>', correct: true },
            { content: '<p>Option 2</p>', correct: false },
          ],
          sessionOptions: { points: 1 },
          public: true,
          publicOnQlicker: true,
          publicOnQlickerForStudents: true,
        }}
        onAutoSave={onAutoSave}
        showVisibilityControls={false}
      />
    );

    expect(screen.queryByLabelText('Visible to students in this course')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Visible to any prof on Qlicker')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });

    expect(onAutoSave).toHaveBeenCalledWith(expect.objectContaining({
      public: true,
      publicOnQlicker: true,
      publicOnQlickerForStudents: true,
      sessionOptions: { points: 2 },
    }), 'question-1');

    vi.useRealTimers();
  });
});
