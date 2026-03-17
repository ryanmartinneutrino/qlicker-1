import React from 'react';
import { render, screen } from '@testing-library/react';
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
});
