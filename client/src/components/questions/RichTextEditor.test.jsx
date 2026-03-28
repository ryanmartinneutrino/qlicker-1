import { describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import RichTextEditor from './RichTextEditor';

vi.mock('../../api/client', () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

vi.mock('@tiptap/react/menus', () => ({
  BubbleMenu: () => null,
}));

function installRectMocks(container) {
  const proseMirror = container.querySelector('.ProseMirror');
  const wrapper = container.querySelector('.tiptap-resizable-image');
  const handle = container.querySelector('.tiptap-image-resize-handle');

  expect(proseMirror).toBeTruthy();
  expect(wrapper).toBeTruthy();
  expect(handle).toBeTruthy();

  Object.defineProperty(proseMirror, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 800,
      height: 200,
      top: 0,
      left: 0,
      right: 800,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });

  Object.defineProperty(wrapper, 'getBoundingClientRect', {
    configurable: true,
    value: () => {
      const width = Number.parseInt(wrapper.style.width || '320', 10) || 320;
      return {
        width,
        height: 100,
        top: 0,
        left: 0,
        right: width,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    },
  });

  return { wrapper, handle };
}

describe('RichTextEditor image resizing', () => {
  it('emits resized image HTML when the resize handle changes image width', async () => {
    const changes = [];
    const initialValue = '<img src="https://example.com/image.png" width="320" data-width="320">';
    const onChange = ({ html }) => {
      changes.push(html);
    };

    const view = render(
      <RichTextEditor
        value={initialValue}
        onChange={onChange}
        resizable
      />
    );

    await waitFor(() => {
      expect(view.container.querySelector('.tiptap-image-resize-handle')).toBeTruthy();
    });

    const { wrapper, handle } = installRectMocks(view.container);

    fireEvent.mouseDown(handle, { clientX: 320 });
    fireEvent.mouseMove(document, { clientX: 200 });
    fireEvent.mouseUp(document, { clientX: 200 });

    await waitFor(() => {
      expect(changes.at(-1)).toContain('width="200"');
      expect(changes.at(-1)).toContain('data-width="200"');
    });

    expect(wrapper.style.width).toBe('200px');
  });

  it('keeps editor content before the toolbar toggle in keyboard tab order', async () => {
    render(<RichTextEditor value="<p>Hello</p>" />);

    await waitFor(() => {
      expect(document.querySelector('.ProseMirror')).toBeTruthy();
    });

    const proseMirror = document.querySelector('.ProseMirror');
    expect(proseMirror).toBeTruthy();
    const toggleToolbarButton = screen.getByRole('button', { name: 'questions.richText.showToolbar' });

    expect(proseMirror.compareDocumentPosition(toggleToolbarButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('keeps embedded video iframe node stable across unrelated rerenders', async () => {
    const videoHtml = '<div data-video-embed="" data-src="https://www.youtube.com/embed/dQw4w9WgXcQ"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="315"></iframe></div>';
    const view = render(
      <RichTextEditor
        value={videoHtml}
        onChange={() => {}}
        enableVideo
      />
    );

    await waitFor(() => {
      expect(view.container.querySelector('.tiptap-video-embed iframe')).toBeTruthy();
    });

    const initialIframe = view.container.querySelector('.tiptap-video-embed iframe');

    view.rerender(
      <RichTextEditor
        value={videoHtml}
        onChange={() => {}}
        enableVideo
        showTip
      />
    );

    await waitFor(() => {
      expect(view.container.querySelector('.tiptap-video-embed iframe')).toBe(initialIframe);
    });
  });
});
