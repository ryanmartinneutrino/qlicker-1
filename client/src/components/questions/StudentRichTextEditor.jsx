import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  prepareRichTextInput,
  renderKatexInElement,
} from './richTextUtils';
import RichTextEditor from './RichTextEditor';

export default function StudentRichTextEditor({
  value,
  onChange,
  onChangeDebounceMs = 0,
  placeholder,
  disabled = false,
  ariaLabel,
  showMathHint = true,
}) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder || t('questions.studentRichText.placeholder');
  const resolvedAriaLabel = ariaLabel || t('questions.studentRichText.editorLabel');
  const onChangeRef = useRef(onChange);
  const onChangeDebounceMsRef = useRef(onChangeDebounceMs);
  const debounceTimerRef = useRef(null);
  const pendingChangeRef = useRef(null);
  const mathHintId = useId();

  const flushPendingChange = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (!pendingChangeRef.current || typeof onChangeRef.current !== 'function') return;
    const nextPayload = pendingChangeRef.current;
    pendingChangeRef.current = null;
    onChangeRef.current(nextPayload);
  }, []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onChangeDebounceMsRef.current = onChangeDebounceMs;
  }, [onChangeDebounceMs]);

  const handleEditorChange = useCallback((nextPayload) => {
    const debounceMs = Number(onChangeDebounceMsRef.current);
    if (!Number.isFinite(debounceMs) || debounceMs <= 0) {
      pendingChangeRef.current = null;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (typeof onChangeRef.current === 'function') {
        onChangeRef.current(nextPayload);
      }
      return;
    }

    pendingChangeRef.current = nextPayload;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (!pendingChangeRef.current || typeof onChangeRef.current !== 'function') return;
      const pendingPayload = pendingChangeRef.current;
      pendingChangeRef.current = null;
      onChangeRef.current(pendingPayload);
    }, debounceMs);
  }, []);

  useEffect(() => () => {
    flushPendingChange();
  }, [flushPendingChange]);

  return (
    <Box>
      <RichTextEditor
        value={value}
        onChange={handleEditorChange}
        placeholder={resolvedPlaceholder}
        disabled={disabled}
        minHeight={80}
        ariaLabel={resolvedAriaLabel}
        ariaDescribedBy={showMathHint ? mathHintId : undefined}
        onBlur={flushPendingChange}
      />
      {showMathHint && (
        <Typography id={mathHintId} variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {t('questions.studentRichText.mathTip')}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Live preview component that renders KaTeX from HTML content.
 * Shows all typed content and renders math when delimiters are present.
 */
export function MathPreview({ html, debounceMs = 140, showLabel = true }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const prepared = useMemo(() => prepareRichTextInput(html || ''), [html]);
  const [committedPreview, setCommittedPreview] = useState(prepared);

  useEffect(() => {
    if (!prepared) {
      setCommittedPreview('');
      return undefined;
    }
    if (!Number.isFinite(debounceMs) || debounceMs <= 0) {
      setCommittedPreview(prepared);
      return undefined;
    }
    // Debounce preview updates to avoid flicker while typing.
    const timer = setTimeout(() => {
      setCommittedPreview(prepared);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs, prepared]);

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
      {showLabel && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          {t('questions.studentRichText.preview')}
        </Typography>
      )}
      <Box
        ref={ref}
        dangerouslySetInnerHTML={{ __html: committedPreview }}
      />
    </Paper>
  );
}
