import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, Paper,
  TextField, Tooltip, Typography,
} from '@mui/material';
import {
  FormatBold as BoldIcon,
  FormatItalic as ItalicIcon,
  FormatListBulleted as BulletListIcon,
  Code as CodeIcon,
  DataObject as SourceIcon,
  FormatColorText as ColorIcon,
  Image as ImageIcon,
  InsertLink as LinkIcon,
  FormatSize as FontSizeIcon,
  FormatUnderlined as UnderlineIcon,
  ExpandLess as CollapseToolbarIcon,
  ExpandMore as ExpandToolbarIcon,
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

const FONT_SIZE_OPTIONS = ['', '12px', '14px', '16px', '18px', '24px', '32px'];

function normalizeLinkValue(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (trimmed.includes('@') && !trimmed.includes(' ')) return `mailto:${trimmed}`;
  return `https://${trimmed}`;
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
  ariaLabel,
  ariaDescribedBy,
  onBlur,
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [sourceDraft, setSourceDraft] = useState('');
  const { t } = useTranslation();
  const lastEditorHtmlRef = useRef('');
  const bubbleMenuKey = useRef(`bubble-menu-${Math.random().toString(36).slice(2)}`);
  const fileInputRef = useRef(null);
  const [toolbarExpanded, setToolbarExpanded] = useState(false);
  const preparedValue = useMemo(() => prepareRichTextInput(value || ''), [value]);
  const editorAriaLabel = ariaLabel || (label ? t('questions.richText.editorLabel', { label }) : t('questions.richText.defaultLabel'));

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

  const insertUploadedImages = async (view, files, insertPos) => {
    if (!view || !Array.isArray(files) || files.length === 0) return;
    setUploadError('');
    setUploading(true);
    try {
      const maxEditorImageWidth = getMaxEditorImageWidth(view);
      const uploads = await Promise.all(files.map((file) => uploadImage(file, maxEditorImageWidth)));
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
    } catch {
      setUploadError(t('questions.richText.uploadFailed'));
    } finally {
      setUploading(false);
    }
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
          link: false,
          underline: false,
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
        }),
        TextStyle,
        Color,
        FontSize,
        Underline,
        ResizableImage.configure({ allowBase64: false }),
        Placeholder.configure({
          placeholder: placeholder || '',
          showOnlyWhenEditable: true,
          emptyEditorClass: 'is-editor-empty',
          emptyNodeClass: 'is-empty',
        }),
      ],
      editorProps: {
        attributes: {
          class: 'question-rich-text-editor',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': editorAriaLabel,
          'aria-disabled': disabled ? 'true' : 'false',
          ...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {}),
        },
        handleDOMEvents: {
          blur: () => {
            onBlur?.();
            return false;
          },
        },
        handleDrop(view, event) {
          const droppedFiles = Array.from(event.dataTransfer?.files || []).filter(isImageFile);
          if (!droppedFiles.length) return false;

          event.preventDefault();
          const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
            ?? view.state.selection.from;
          insertUploadedImages(view, droppedFiles, dropPos);
          return true;
        },
        handlePaste(view, event) {
          const pastedFiles = Array.from(event.clipboardData?.files || []).filter(isImageFile);
          if (!pastedFiles.length) return false;

          event.preventDefault();
          insertUploadedImages(view, pastedFiles, view.state.selection.from);
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
    [ariaDescribedBy, disabled, editorAriaLabel, onBlur, placeholder, t]
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

  const currentColor = editor?.getAttributes('textStyle')?.color || '#000000';
  const currentFontSize = editor?.getAttributes('textStyle')?.fontSize || '';

  const openLinkEditor = () => {
    if (!editor) return;
    setLinkDraft(editor.getAttributes('link')?.href || '');
    setLinkDialogOpen(true);
  };

  const applyLinkDraft = () => {
    if (!editor) return;
    const nextLink = normalizeLinkValue(linkDraft);
    if (!nextLink) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: nextLink }).run();
    }
    setLinkDialogOpen(false);
  };

  const openSourceEditor = () => {
    if (!editor) return;
    setSourceDraft(normalizeStoredHtml(editor.getHTML()));
    setSourceDialogOpen(true);
  };

  const applySourceDraft = () => {
    if (!editor) return;
    editor.commands.setContent(normalizeStoredHtml(sourceDraft || ''), false, { preserveWhitespace: 'full' });
    const html = normalizeStoredHtml(editor.getHTML());
    lastEditorHtmlRef.current = html;
    setSourceDialogOpen(false);
  };

  const handleToolbarImageInput = async (event) => {
    const files = Array.from(event.target.files || []).filter(isImageFile);
    if (editor?.view && files.length > 0) {
      await insertUploadedImages(editor.view, files, editor.state.selection.from);
    }
    event.target.value = '';
  };

  return (
    <Box>
      {(label || editor) ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: label ? 'space-between' : 'flex-end',
            gap: 1,
            mb: 0.35,
            minHeight: 28,
          }}
        >
          {label ? (
            <Typography variant="subtitle2">
              {label}
            </Typography>
          ) : <Box />}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35 }}>
            <Typography variant="caption" color="text.secondary">
              {toolbarExpanded ? t('questions.richText.hideToolbar') : t('questions.richText.showToolbar')}
            </Typography>
            <Tooltip title={toolbarExpanded ? t('questions.richText.hideToolbar') : t('questions.richText.showToolbar')}>
              <span>
                <IconButton
                  size="small"
                  aria-label={toolbarExpanded ? t('questions.richText.hideToolbar') : t('questions.richText.showToolbar')}
                  onClick={() => setToolbarExpanded((current) => !current)}
                  disabled={disabled}
                  sx={{ p: 0.5 }}
                >
                  {toolbarExpanded ? <CollapseToolbarIcon fontSize="small" /> : <ExpandToolbarIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      ) : null}

      <Paper
        variant="outlined"
        sx={{
          borderRadius: 1.5,
          px: 1.25,
          py: toolbarExpanded ? 1.25 : 0.85,
          minHeight: minHeight + (toolbarExpanded ? 84 : 0),
          borderColor: 'divider',
          '&:focus-within': { borderColor: 'primary.main', boxShadow: theme => `0 0 0 1px ${theme.palette.primary.main}` },
          '& .editor-toolbar-controls': {
            position: 'sticky',
            top: 0,
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            flexWrap: 'wrap',
            pb: 1,
            mb: 1,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          },
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
            '& p.is-empty:first-of-type::before, & .is-editor-empty:first-of-type::before': {
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
            options={{
              placement: 'top',
              offset: 16,
              strategy: 'fixed',
              appendTo: () => document.body,
            }}
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
              <IconButton
                size="small"
                aria-label={t('questions.richText.link')}
                title={t('questions.richText.link')}
                onClick={openLinkEditor}
                sx={{ color: editor.isActive('link') ? 'warning.light' : 'inherit' }}
              >
                <LinkIcon fontSize="small" />
              </IconButton>
            </Paper>
          </BubbleMenu>
        )}

        {editor && toolbarExpanded ? (
          <Box className="editor-toolbar-controls">
                <IconButton
                  size="small"
                  aria-label={t('questions.richText.bold')}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  color={editor.isActive('bold') ? 'primary' : 'default'}
                  disabled={disabled}
                >
                  <BoldIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={t('questions.richText.italic')}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  color={editor.isActive('italic') ? 'primary' : 'default'}
                  disabled={disabled}
                >
                  <ItalicIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={t('questions.richText.underline')}
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  color={editor.isActive('underline') ? 'primary' : 'default'}
                  disabled={disabled}
                >
                  <UnderlineIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={t('questions.richText.bulletList')}
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  color={editor.isActive('bulletList') ? 'primary' : 'default'}
                  disabled={disabled}
                >
                  <BulletListIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={t('questions.richText.inlineCode')}
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  color={editor.isActive('code') ? 'primary' : 'default'}
                  disabled={disabled}
                >
                  <CodeIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={t('questions.richText.link')}
                  onClick={openLinkEditor}
                  color={editor.isActive('link') ? 'primary' : 'default'}
                  disabled={disabled}
                >
                  <LinkIcon fontSize="small" />
                </IconButton>
                <Button
                  component="label"
                  size="small"
                  variant="outlined"
                  startIcon={<ImageIcon />}
                  disabled={disabled || uploading}
                >
                  {t('questions.richText.image')}
                  <input
                    ref={fileInputRef}
                    hidden
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleToolbarImageInput}
                  />
                </Button>
                <TextField
                  size="small"
                  select
                  label={t('questions.richText.fontSize')}
                  value={currentFontSize}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (!nextValue) {
                      editor.chain().focus().unsetFontSize().run();
                      return;
                    }
                    editor.chain().focus().setFontSize(nextValue).run();
                  }}
                  sx={{ width: 120 }}
                  disabled={disabled}
                  InputProps={{ startAdornment: <FontSizeIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }}
                >
                  {FONT_SIZE_OPTIONS.map((option) => (
                    <MenuItem key={option || 'default'} value={option}>
                      {option || t('questions.richText.defaultSize')}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ColorIcon />}
                  component="label"
                  disabled={disabled}
                >
                  {t('questions.richText.color')}
                  <input
                    type="color"
                    value={currentColor}
                    onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
                    style={{ width: 28, height: 28, border: 0, background: 'transparent', marginLeft: 8 }}
                  />
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<SourceIcon />}
                  onClick={openSourceEditor}
                  disabled={disabled}
                >
                  {t('questions.richText.source')}
                </Button>
          </Box>
        ) : null}

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

      <Dialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('questions.richText.link')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            autoFocus
            label={t('questions.richText.linkUrl')}
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            placeholder={t('questions.richText.linkUrlPlaceholder')}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button
            onClick={() => {
              if (editor) {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
              }
              setLinkDraft('');
              setLinkDialogOpen(false);
            }}
          >
            {t('questions.richText.removeLink')}
          </Button>
          <Button variant="contained" onClick={applyLinkDraft}>{t('common.save')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={sourceDialogOpen} onClose={() => setSourceDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('questions.richText.source')}</DialogTitle>
        <DialogContent>
          <TextField
            multiline
            minRows={12}
            fullWidth
            autoFocus
            value={sourceDraft}
            onChange={(event) => setSourceDraft(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSourceDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={applySourceDraft}>{t('questions.richText.applySource')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
