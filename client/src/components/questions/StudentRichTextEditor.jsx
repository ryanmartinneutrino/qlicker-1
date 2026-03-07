import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Box, IconButton, Paper, Typography,
} from '@mui/material';
import {
  FormatBold as BoldIcon,
  FormatItalic as ItalicIcon,
  FormatUnderlined as UnderlineIcon,
} from '@mui/icons-material';
import {
  normalizeStoredHtml,
  prepareRichTextInput,
  renderKatexInElement,
} from './richTextUtils';

/**
 * Simplified TipTap editor for student short-answer responses.
 * Supports bold/italic/underline and inline/display KaTeX math.
 * No image upload capability.
 *
 * Props:
 *   value    – HTML string (initial content)
 *   onChange – ({ html, plainText }) => void
 *   placeholder – placeholder text
 *   disabled – whether the editor is read-only
 */
export default function StudentRichTextEditor({
  value,
  onChange,
  placeholder = 'Type your answer…',
  disabled = false,
  ariaLabel = 'Short answer response editor',
}) {
  const lastNormalizedHtmlRef = useRef('');
  const bubbleMenuKey = useRef(`sa-bubble-${Math.random().toString(36).slice(2)}`);
  const mathHintId = useId();
  const preparedValue = useMemo(() => prepareRichTextInput(value || ''), [value]);

  const editor = useEditor(
    {
      editable: !disabled,
      content: preparedValue,
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          blockquote: false,
          horizontalRule: false,
          underline: false,
        }),
        Underline,
        Placeholder.configure({ placeholder }),
      ],
      editorProps: {
        attributes: {
          class: 'student-rich-text-editor',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': ariaLabel,
          'aria-disabled': disabled ? 'true' : 'false',
          'aria-describedby': mathHintId,
        },
      },
      onUpdate({ editor: ed }) {
        const rawHtml = ed.getHTML();
        const html = normalizeStoredHtml(rawHtml);
        if (html === lastNormalizedHtmlRef.current) return;
        lastNormalizedHtmlRef.current = html;
        const plainText = ed.getText({ blockSeparator: ' ' }).replace(/\s+/g, ' ').trim();
        if (onChange) onChange({ html, plainText });
      },
    },
    [ariaLabel, disabled, mathHintId, placeholder]
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const nextHtml = normalizeStoredHtml(preparedValue || '');
    const currentHtml = normalizeStoredHtml(editor.getHTML());
    if (nextHtml === currentHtml) {
      lastNormalizedHtmlRef.current = currentHtml;
      return;
    }

    // Avoid resetting the user's cursor/typing when parent state echoes updates.
    if (editor.isFocused) return;

    editor.commands.setContent(preparedValue || '<p></p>', false);
    lastNormalizedHtmlRef.current = nextHtml;
  }, [editor, preparedValue]);

  if (!editor) return null;

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{
          position: 'relative',
          '& .ProseMirror': {
            outline: 'none',
            minHeight: 80,
            width: '100%',
            boxSizing: 'border-box',
            p: 1.5,
            fontSize: '0.95rem',
            resize: 'vertical',
            overflowX: 'hidden',
            overflowY: 'auto',
            '& p': { my: 0.5 },
            '& p.is-editor-empty:first-of-type::before': {
              content: 'attr(data-placeholder)',
              float: 'left',
              color: 'text.disabled',
              pointerEvents: 'none',
              height: 0,
            },
          },
          opacity: disabled ? 0.65 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
        }}
      >
        {editor && (
          <BubbleMenu key={bubbleMenuKey.current} editor={editor}>
            <Paper
              elevation={4}
              sx={{ display: 'flex', gap: 0.25, p: 0.25 }}
            >
              <IconButton
                size="small"
                onClick={() => editor.chain().focus().toggleBold().run()}
                color={editor.isActive('bold') ? 'primary' : 'default'}
                aria-label="Bold"
              >
                <BoldIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                color={editor.isActive('italic') ? 'primary' : 'default'}
                aria-label="Italic"
              >
                <ItalicIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                color={editor.isActive('underline') ? 'primary' : 'default'}
                aria-label="Underline"
              >
                <UnderlineIcon fontSize="small" />
              </IconButton>
            </Paper>
          </BubbleMenu>
        )}
        <EditorContent editor={editor} />
      </Paper>
      <Typography id={mathHintId} variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        Use \( ... \) for inline math or $$ ... $$ for display math
      </Typography>
    </Box>
  );
}

/**
 * Live preview component that renders KaTeX from HTML content.
 * Shows all typed content and renders math when delimiters are present.
 */
export function MathPreview({ html }) {
  const ref = useRef(null);
  const prepared = useMemo(() => prepareRichTextInput(html || ''), [html]);
  const [committedPreview, setCommittedPreview] = useState(prepared);

  useEffect(() => {
    if (!prepared) {
      setCommittedPreview('');
      return undefined;
    }
    // Debounce preview updates to avoid flicker while typing.
    const timer = setTimeout(() => {
      setCommittedPreview(prepared);
    }, 140);
    return () => clearTimeout(timer);
  }, [prepared]);

  useEffect(() => {
    if (!ref.current || !committedPreview) return;
    renderKatexInElement(ref.current);
  }, [committedPreview]);

  if (!committedPreview) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        mt: 1,
        bgcolor: 'grey.50',
        '& p': { my: 0.5 },
        '& img': { maxWidth: '100%' },
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Preview
      </Typography>
      <Box
        ref={ref}
        dangerouslySetInnerHTML={{ __html: committedPreview }}
      />
    </Paper>
  );
}
