import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionChatPanel from './SessionChatPanel';
import apiClient from '../../api/client';
import i18n from '../../i18n';

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../questions/StudentRichTextEditor', () => ({
  default: ({ value, onChange, placeholder, ariaLabel }) => (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange({ html: event.target.value })}
    />
  ),
  MathPreview: () => null,
}));

vi.mock('../questions/richTextUtils', () => ({
  extractPlainTextFromHtml: (html = '') => String(html).replace(/<[^>]*>/g, '').trim(),
  prepareRichTextInput: (html = '', fallback = '') => html || fallback || '',
  renderKatexInElement: () => {},
}));

describe('SessionChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.changeLanguage('en');
    apiClient.get.mockResolvedValue({
      data: {
        canPost: false,
        canVote: true,
        canDismiss: false,
        canComment: false,
        canViewNames: false,
        quickPosts: [],
        posts: [],
      },
    });
  });

  it('loads chat once on mount and only refetches when refreshToken changes', async () => {
    const { rerender } = render(
      <SessionChatPanel
        sessionId="session-1"
        enabled
        role="student"
        refreshToken={0}
      />
    );

    expect(await screen.findByText('No posts yet.')).toBeInTheDocument();
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledTimes(1);
    });
    expect(apiClient.get).toHaveBeenCalledWith('/sessions/session-1/chat', { params: {} });

    rerender(
      <SessionChatPanel
        sessionId="session-1"
        enabled
        role="student"
        refreshToken={1}
      />
    );

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
    expect(apiClient.get).toHaveBeenLastCalledWith('/sessions/session-1/chat', { params: {} });
  });

  it('lets students trigger a shared quick post from hidden quick-post options', async () => {
    apiClient.get
      .mockResolvedValueOnce({
        data: {
          canPost: false,
          canVote: true,
          canDismiss: false,
          canComment: false,
          canViewNames: false,
          quickPostOptions: [
            {
              postId: 'quick-3',
              questionNumber: 3,
              label: "I didn't understand question 3",
              upvoteCount: 0,
              viewerHasUpvoted: false,
            },
          ],
          posts: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          canPost: false,
          canVote: true,
          canDismiss: false,
          canComment: false,
          canViewNames: false,
          quickPostOptions: [
            {
              postId: 'quick-3',
              questionNumber: 3,
              label: "I didn't understand question 3",
              upvoteCount: 1,
              viewerHasUpvoted: true,
            },
          ],
          posts: [
            {
              _id: 'quick-3',
              body: "I didn't understand question 3",
              bodyWysiwyg: '',
              createdAt: null,
              updatedAt: null,
              upvoteCount: 1,
              viewerHasUpvoted: true,
              isOwnPost: false,
              isQuickPost: true,
              quickPostQuestionNumber: 3,
              dismissed: false,
              authorRole: 'system',
              authorName: null,
              comments: [],
            },
          ],
        },
      });
    apiClient.post.mockResolvedValue({ data: { success: true } });

    render(
      <SessionChatPanel
        sessionId="session-1"
        enabled
        role="student"
      />
    );

    expect(await screen.findByText('Need more explanation?')).toBeInTheDocument();
    expect(screen.getByText('Choose an earlier question to add your vote to a shared request for clarification.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Request explanation' }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/sessions/session-1/chat/quick-posts/3/toggle');
    });
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole('button', { name: 'Undo request' })).toBeInTheDocument();
    expect(screen.getAllByText("I didn't understand question 3").length).toBeGreaterThan(0);
  });
});
