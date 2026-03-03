import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Alert, Box, CircularProgress, IconButton, Paper, Tooltip, Typography,
} from '@mui/material';
import {
  FormatBold as BoldIcon,
  FormatItalic as ItalicIcon,
  FormatUnderlined as UnderlineIcon,
} from '@mui/icons-material';
import apiClient from '../../api/client';
import {
  extractPlainTextFromHtml,
  normalizeStoredHtml,
  prepareRichTextInput,
} from './richTextUtils';
import ResizableImage from './ResizableImage';

function isImageFile(file) {
  return Boolean(file?.type?.startsWith('image/'));
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '',
  minHeight = 96,
  disabled = false,
  label,
  showTip = false,
  compact = false,
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const lastEditorHtmlRef = useRef('');
  const bubbleMenuKey = useRef(`bubble-menu-${Math.random().toString(36).slice(2)}`);
  const preparedValue = useMemo(() => prepareRichTextInput(value || ''), [value]);

  const uploadImage = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post('/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data?.image?.url || '';
  };

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
        ResizableImage.configure({ allowBase64: false }),
        Placeholder.configure({ placeholder }),
      ],
      editorProps: {
        attributes: { class: 'question-rich-text-editor' },
        handleDrop(view, event) {
          const droppedFiles = Array.from(event.dataTransfer?.files || []).filter(isImageFile);
          if (!droppedFiles.length) return false;

          event.preventDefault();
          setUploadError('');
          setUploading(true);

          const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
            ?? view.state.selection.from;

          Promise.all(droppedFiles.map(file => uploadImage(file)))
            .then((urls) => {
              const validUrls = urls.filter(Boolean);
              if (!validUrls.length) return;

              let tr = view.state.tr;
              let insertPos = dropPos;
              validUrls.forEach((url) => {
                const imageNode = view.state.schema.nodes.image.create({ src: url });
                tr = tr.insert(insertPos, imageNode);
                insertPos += imageNode.nodeSize;
              });
              view.dispatch(tr);
            })
            .catch(() => {
              setUploadError('Image upload failed. Try again.');
            })
            .finally(() => {
              setUploading(false);
            });

          return true;
        },
        handlePaste(view, event) {
          const pastedFiles = Array.from(event.clipboardData?.files || []).filter(isImageFile);
          if (!pastedFiles.length) return false;

          event.preventDefault();
          setUploadError('');
          setUploading(true);

          const insertPos = view.state.selection.from;
          Promise.all(pastedFiles.map(file => uploadImage(file)))
            .then((urls) => {
              const validUrls = urls.filter(Boolean);
              if (!validUrls.length) return;

              let tr = view.state.tr;
              let pos = insertPos;
              validUrls.forEach((url) => {
                const imageNode = view.state.schema.nodes.image.create({ src: url });
                tr = tr.insert(pos, imageNode);
                pos += imageNode.nodeSize;
              });
              view.dispatch(tr);
            })
            .catch(() => {
              setUploadError('Image upload failed. Try again.');
            })
            .finally(() => {
              setUploading(false);
            });

          return true;
        },
      },
      onCreate: ({ editor: createdEditor }) => {
        const html = normalizeStoredHtml(createdEditor.getHTML());
        lastEditorHtmlRef.current = html;
        onChange?.({ html, plainText: extractPlainTextFromHtml(html) });
      },
      onUpdate: ({ editor: updatedEditor }) => {
        const html = normalizeStoredHtml(updatedEditor.getHTML());
        lastEditorHtmlRef.current = html;
        onChange?.({ html, plainText: extractPlainTextFromHtml(html) });
      },
    },
    [disabled]
  );

  useEffect(() => {
    if (!editor) return;
    if (disabled !== !editor.isEditable) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;

    const targetHtml = preparedValue || '';
    const currentHtml = normalizeStoredHtml(editor.getHTML());
    if (targetHtml === currentHtml || targetHtml === lastEditorHtmlRef.current) return;

    editor.commands.setContent(targetHtml, false, { preserveWhitespace: 'full' });
    const html = normalizeStoredHtml(editor.getHTML());
    lastEditorHtmlRef.current = html;
  }, [editor, preparedValue]);

  return (
    <Box>
      {label ? (
        <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
          {label}
        </Typography>
      ) : null}

      <Paper
        variant="outlined"
        sx={{
          borderRadius: 1.5,
          p: 1.25,
          minHeight: minHeight + 24,
          borderColor: 'divider',
          '&:focus-within': { borderColor: 'primary.main', boxShadow: theme => `0 0 0 1px ${theme.palette.primary.main}` },
          '& .question-rich-text-editor': {
            minHeight,
            outline: 'none',
            fontSize: 15,
            lineHeight: 1.55,
            '& p': { my: compact ? 0 : 0.7 },
            '& ul, & ol': { my: 0.7, pl: 3 },
            '& .tiptap-resizable-image': {
              borderRadius: 6,
              border: theme => `1px dashed ${theme.palette.divider}`,
              my: 0.8,
            },
            '& img': { maxWidth: '100%', height: 'auto', borderRadius: 1 },
            '& .is-empty::before': {
              color: 'text.disabled',
              content: 'attr(data-placeholder)',
              float: 'left',
              pointerEvents: 'none',
              height: 0,
            },
          },
        }}
      >
        {editor && (
          <BubbleMenu
            editor={editor}
            pluginKey={bubbleMenuKey.current}
            shouldShow={({ editor: menuEditor, from, to }) => menuEditor.isEditable && from < to}
            tippyOptions={{ duration: 100, placement: 'top', zIndex: 1700 }}
          >
            <Paper
              elevation={3}
              sx={{
                display: 'flex',
                alignItems: 'center',
                px: 0.5,
                py: 0.25,
                borderRadius: 2,
                bgcolor: 'grey.900',
                color: 'common.white',
              }}
            >
              <Tooltip title="Bold">
                <IconButton
                  size="small"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  sx={{ color: editor.isActive('bold') ? 'warning.light' : 'inherit' }}
                >
                  <BoldIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Italic">
                <IconButton
                  size="small"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  sx={{ color: editor.isActive('italic') ? 'warning.light' : 'inherit' }}
                >
                  <ItalicIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Underline">
                <IconButton
                  size="small"
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  sx={{ color: editor.isActive('underline') ? 'warning.light' : 'inherit' }}
                >
                  <UnderlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Paper>
          </BubbleMenu>
        )}

        <EditorContent editor={editor} />
      </Paper>

      <Box sx={{ mt: showTip || uploading || uploadError ? 0.75 : 0, minHeight: showTip || uploading || uploadError ? 26 : 0 }}>
        {uploading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">Uploading image...</Typography>
          </Box>
        ) : showTip ? (
          <Typography variant="caption" color="text.secondary">
            Tip: select text for formatting. Type math as `$...$`, `\\(...\\)` or `$$...$$`. Drag/drop or paste an image to upload.
          </Typography>
        ) : null}
        {uploadError ? (
          <Alert severity="error" sx={{ mt: 0.75, py: 0 }}>
            {uploadError}
          </Alert>
        ) : null}
      </Box>
    </Box>
  );
}
