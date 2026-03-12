import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Alert, Box, CircularProgress, IconButton, Paper, Typography,
} from '@mui/material';
import {
  FormatBold as BoldIcon,
  FormatItalic as ItalicIcon,
  FormatUnderlined as UnderlineIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
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

const RESIZABLE_UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = dataUrl;
  });
}

async function prepareImageForUpload(file, maxWidthPx) {
  const safeMaxWidth = Number(maxWidthPx);
  if (!RESIZABLE_UPLOAD_TYPES.has(file.type)) {
    return { file, width: undefined };
  }
  if (!Number.isFinite(safeMaxWidth) || safeMaxWidth <= 0) {
    return { file, width: undefined };
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const sourceImage = await loadImageFromDataUrl(sourceDataUrl);
  const sourceWidth = sourceImage.naturalWidth || 0;
  const sourceHeight = sourceImage.naturalHeight || 0;

  if (!sourceWidth || !sourceHeight || sourceWidth <= safeMaxWidth) {
    return { file, width: sourceWidth || undefined };
  }

  const scale = safeMaxWidth / sourceWidth;
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return { file, width: sourceWidth || undefined };
  ctx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

  const resizedBlob = await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), file.type, 0.92);
  });

  if (!resizedBlob) return { file, width: sourceWidth || undefined };
  return {
    file: new File([resizedBlob], file.name, {
      type: file.type,
      lastModified: Date.now(),
    }),
    width: targetWidth,
  };
}

function getMaxEditorImageWidth(view) {
  const editorWidth = view?.dom?.getBoundingClientRect?.().width || 0;
  if (!Number.isFinite(editorWidth) || editorWidth <= 0) return 0;
  return Math.floor(editorWidth * 0.9);
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '',
  minHeight = 96,
  resizable = false,
  disabled = false,
  label,
  showTip = false,
  compact = false,
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const { t } = useTranslation();
  const lastEditorHtmlRef = useRef('');
  const bubbleMenuKey = useRef(`bubble-menu-${Math.random().toString(36).slice(2)}`);
  const preparedValue = useMemo(() => prepareRichTextInput(value || ''), [value]);
  const editorAriaLabel = label ? t('questions.richText.editorLabel', { label }) : t('questions.richText.defaultLabel');

  const uploadImage = async (file, maxEditorImageWidth) => {
    const preparedUpload = await prepareImageForUpload(file, maxEditorImageWidth);
    const formData = new FormData();
    formData.append('file', preparedUpload.file);
    const { data } = await apiClient.post('/images', formData);
    return {
      url: data?.image?.url || '',
      width: preparedUpload.width,
    };
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
        attributes: {
          class: 'question-rich-text-editor',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': editorAriaLabel,
          'aria-disabled': disabled ? 'true' : 'false',
        },
        handleDrop(view, event) {
          const droppedFiles = Array.from(event.dataTransfer?.files || []).filter(isImageFile);
          if (!droppedFiles.length) return false;

          event.preventDefault();
          setUploadError('');
          setUploading(true);

          const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
            ?? view.state.selection.from;
          const maxEditorImageWidth = getMaxEditorImageWidth(view);

          Promise.all(droppedFiles.map((file) => uploadImage(file, maxEditorImageWidth)))
            .then((uploads) => {
              const validUploads = uploads.filter((upload) => upload?.url);
              if (!validUploads.length) return;

              let tr = view.state.tr;
              let insertPos = dropPos;
              validUploads.forEach((upload) => {
                const imageNode = view.state.schema.nodes.image.create({
                  src: upload.url,
                  width: upload.width,
                });
                tr = tr.insert(insertPos, imageNode);
                insertPos += imageNode.nodeSize;
              });
              view.dispatch(tr);
            })
            .catch(() => {
              setUploadError(t('questions.richText.uploadFailed'));
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
          const maxEditorImageWidth = getMaxEditorImageWidth(view);
          Promise.all(pastedFiles.map((file) => uploadImage(file, maxEditorImageWidth)))
            .then((uploads) => {
              const validUploads = uploads.filter((upload) => upload?.url);
              if (!validUploads.length) return;

              let tr = view.state.tr;
              let pos = insertPos;
              validUploads.forEach((upload) => {
                const imageNode = view.state.schema.nodes.image.create({
                  src: upload.url,
                  width: upload.width,
                });
                tr = tr.insert(pos, imageNode);
                pos += imageNode.nodeSize;
              });
              view.dispatch(tr);
            })
            .catch(() => {
              setUploadError(t('questions.richText.uploadFailed'));
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
    [disabled, editorAriaLabel, placeholder]
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
            width: '100%',
            boxSizing: 'border-box',
            outline: 'none',
            fontSize: 15,
            lineHeight: 1.55,
            resize: resizable ? 'vertical' : 'none',
            overflowX: 'hidden',
            overflowY: resizable ? 'auto' : 'visible',
            '& p': { my: compact ? 0 : 0.7 },
            '& ul, & ol': { my: 0.7, pl: 3 },
            '& .tiptap-resizable-image': {
              my: 0.8,
            },
            '& img': { maxWidth: '100%', height: 'auto', borderRadius: 0 },
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
            options={{ placement: 'top', offset: 8 }}
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
                zIndex: 1700,
              }}
            >
              <IconButton
                size="small"
                aria-label={t('questions.richText.bold')}
                title={t('questions.richText.bold')}
                onClick={() => editor.chain().focus().toggleBold().run()}
                sx={{ color: editor.isActive('bold') ? 'warning.light' : 'inherit' }}
              >
                <BoldIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label={t('questions.richText.italic')}
                title={t('questions.richText.italic')}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                sx={{ color: editor.isActive('italic') ? 'warning.light' : 'inherit' }}
              >
                <ItalicIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label={t('questions.richText.underline')}
                title={t('questions.richText.underline')}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                sx={{ color: editor.isActive('underline') ? 'warning.light' : 'inherit' }}
              >
                <UnderlineIcon fontSize="small" />
              </IconButton>
            </Paper>
          </BubbleMenu>
        )}

        <EditorContent editor={editor} />
      </Paper>

      <Box sx={{ mt: showTip || uploading || uploadError ? 0.75 : 0, minHeight: showTip || uploading || uploadError ? 26 : 0 }}>
        {uploading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">{t('questions.richText.uploadingImage')}</Typography>
          </Box>
        ) : showTip ? (
          <Typography variant="caption" color="text.secondary">
            {t('questions.richText.editorTip')}
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
