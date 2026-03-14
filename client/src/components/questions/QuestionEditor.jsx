import {
  forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Select, MenuItem, FormControl, InputLabel,
  Box, IconButton, FormControlLabel, Typography, Divider, Paper,
  Checkbox, FormGroup,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import {
  TYPE_LABELS,
  QUESTION_TYPES,
  isOptionBasedQuestionType,
  isSlideType,
  normalizeQuestionType,
} from './constants';
import RichTextEditor from './RichTextEditor';
import AutoSaveStatus from '../common/AutoSaveStatus';
import {
  extractPlainTextFromHtml,
  hasRichTextContent,
  normalizeStoredHtml,
  prepareRichTextInput,
  renderKatexInElement,
} from './richTextUtils';

function normalizeOptions(opts) {
  if (!opts || !opts.length) return [{ content: '', correct: false }, { content: '', correct: false }];
  return opts.map((o) => ({
    content: prepareRichTextInput(o.content || o.answer || '', o.plainText || ''),
    correct: !!o.correct,
  }));
}

function buildTrueFalseOptions(correctIndex = 0) {
  return [
    { content: 'True', correct: correctIndex === 0 },
    { content: 'False', correct: correctIndex === 1 },
  ];
}

function normalizeTrueFalseOptions(opts) {
  if (!opts || !opts.length) return buildTrueFalseOptions(0);
  const correctIndex = opts.findIndex((option) => !!option?.correct);
  return buildTrueFalseOptions(correctIndex === 1 ? 1 : 0);
}

function enforceSingleCorrectOption(options = []) {
  let foundCorrect = false;
  return (options || []).map((option) => {
    const shouldStayCorrect = !!option?.correct && !foundCorrect;
    if (shouldStayCorrect) foundCorrect = true;
    return {
      content: option?.content || '',
      correct: shouldStayCorrect,
    };
  });
}

function hasAnyOptionContent(options = []) {
  return (options || []).some((option) => hasRichTextContent(option?.content || ''));
}

const emptyForm = () => ({
  type: QUESTION_TYPES.MULTIPLE_CHOICE,
  content: '',
  options: [{ content: '', correct: false }, { content: '', correct: false }],
  correctNumerical: '',
  toleranceNumerical: '',
  solution: '',
  points: 1,
});

function cloneFormState(form) {
  return {
    type: form.type,
    content: form.content || '',
    options: (form.options || []).map((option) => ({
      content: option?.content || '',
      correct: !!option?.correct,
    })),
    correctNumerical: form.correctNumerical ?? '',
    toleranceNumerical: form.toleranceNumerical ?? '',
    solution: form.solution || '',
    points: form.points ?? 1,
  };
}

const COMPACT_FIELD_SX = {
  '& .MuiInputBase-input': {
    py: 1.05,
  },
  '& .MuiSelect-select': {
    py: 1.05,
  },
};

function buildQuestionPayload(form) {
  const content = normalizeStoredHtml(form.content);
  const isSlide = isSlideType(form.type);
  const solution = isSlide ? '' : normalizeStoredHtml(form.solution);
  const points = isSlide ? 0 : Number(form.points) || 1;
  const payload = {
    type: form.type,
    content,
    plainText: extractPlainTextFromHtml(content),
    solution: solution || undefined,
    solution_plainText: solution ? extractPlainTextFromHtml(solution) : undefined,
    sessionOptions: { points },
  };

  if (isOptionBasedQuestionType(form.type) || form.type === QUESTION_TYPES.TRUE_FALSE) {
    const optionSource = form.type === QUESTION_TYPES.TRUE_FALSE
      ? normalizeTrueFalseOptions(form.options)
      : form.type === QUESTION_TYPES.MULTIPLE_CHOICE
        ? enforceSingleCorrectOption(form.options)
        : form.options;
    payload.options = optionSource.map((o) => {
      const optionHtml = normalizeStoredHtml(o.content);
      const optionPlainText = extractPlainTextFromHtml(optionHtml);
      return {
        content: optionHtml,
        plainText: optionPlainText,
        answer: optionPlainText,
        correct: o.correct,
        wysiwyg: true,
      };
    });
  }

  if (form.type === QUESTION_TYPES.NUMERICAL) {
    payload.correctNumerical = Number(form.correctNumerical) || 0;
    payload.toleranceNumerical = Number(form.toleranceNumerical) || 0;
  }

  return payload;
}

function MathLivePreview({
  html,
  fallback = '',
  emptyText = '(no content yet)',
  compact = false,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const prepared = prepareRichTextInput(html || '', fallback || '') || `<p>${emptyText}</p>`;
    containerRef.current.innerHTML = prepared;
    renderKatexInElement(containerRef.current);
  }, [html, fallback, emptyText]);

  return (
    <Box
      ref={containerRef}
      sx={{
        '& p': { my: compact ? 0 : 0.5 },
        '& ul, & ol': { my: compact ? 0 : 0.5, pl: 3 },
        '& img': {
          display: 'block',
          maxWidth: '90% !important',
          height: 'auto !important',
          borderRadius: 0,
          my: 0.5,
        },
      }}
    />
  );
}

const QuestionEditor = forwardRef(function QuestionEditor({
  open,
  onClose,
  onAutoSave,
  initial,
  initialBaseline = null,
  inline = false,
  disableTypeSelection = false,
  disableOptionCountChanges = false,
  optionCountLockReason = 'Option count is locked for this question.',
  typeSelectionLockReason = 'Question type is locked for this question.',
}, ref) {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm());
  const [persistedQuestionId, setPersistedQuestionId] = useState(null);
  const [autosaveState, setAutosaveState] = useState('idle');
  const [autosaveError, setAutosaveError] = useState('');
  const [closing, setClosing] = useState(false);
  const [initialSnapshotHash, setInitialSnapshotHash] = useState('');

  const questionIdRef = useRef(null);
  const latestFormRef = useRef(emptyForm());
  const hydratingRef = useRef(false);
  const lastSavedHashRef = useRef('');
  const initialFormRef = useRef(emptyForm());
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(null);
  const onAutoSaveRef = useRef(onAutoSave);
  const tRef = useRef(t);

  useEffect(() => {
    onAutoSaveRef.current = onAutoSave;
  }, [onAutoSave]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const updateForm = useCallback((updater) => {
    const baseForm = latestFormRef.current;
    const nextForm = typeof updater === 'function' ? updater(baseForm) : updater;
    const normalizedNextForm = cloneFormState(nextForm);
    latestFormRef.current = normalizedNextForm;
    setForm(normalizedNextForm);
    return normalizedNextForm;
  }, []);

  const persistPayload = useCallback(async (payload, payloadHash) => {
    const runSave = async (nextPayload, nextHash) => {
      if (saveInFlightRef.current) {
        queuedSaveRef.current = { payload: nextPayload, payloadHash: nextHash };
        return null;
      }

      saveInFlightRef.current = true;
      setAutosaveState('saving');
      setAutosaveError('');

      try {
        const savedQuestion = await onAutoSaveRef.current(nextPayload, questionIdRef.current);
        if (savedQuestion?._id && savedQuestion._id !== questionIdRef.current) {
          questionIdRef.current = savedQuestion._id;
          setPersistedQuestionId(savedQuestion._id);
        }
        lastSavedHashRef.current = nextHash;
        setAutosaveState('saved');
        return savedQuestion;
      } catch (err) {
        setAutosaveState('error');
        setAutosaveError(err.response?.data?.message || tRef.current('questions.editor.autosaveFailed'));
        throw err;
      } finally {
        saveInFlightRef.current = false;
        if (queuedSaveRef.current) {
          const queued = queuedSaveRef.current;
          queuedSaveRef.current = null;
          try {
            await runSave(queued.payload, queued.payloadHash);
          } catch {
            // Keep latest error surfaced to the user; queue processing continues.
          }
        }
      }
    };

    return runSave(payload, payloadHash);
  }, []);

  const waitForSaveDrain = useCallback(async () => {
    while (saveInFlightRef.current || queuedSaveRef.current) {
      await new Promise((resolve) => {
        setTimeout(resolve, 40);
      });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (initial?._id && questionIdRef.current && questionIdRef.current === initial._id) {
      return;
    }

    const toFormState = (question) => {
      const normalizedType = question ? normalizeQuestionType(question) : QUESTION_TYPES.MULTIPLE_CHOICE;
      return question
        ? {
          type: normalizedType,
          content: prepareRichTextInput(question.content || '', question.plainText || ''),
          options: normalizedType === QUESTION_TYPES.TRUE_FALSE
            ? normalizeTrueFalseOptions(question.options)
            : normalizedType === QUESTION_TYPES.SLIDE
              ? []
              : normalizeOptions(question.options),
          correctNumerical: question.correctNumerical ?? '',
          toleranceNumerical: question.toleranceNumerical ?? '',
          solution: prepareRichTextInput(question.solution || '', question.solution_plainText || ''),
          points: normalizedType === QUESTION_TYPES.SLIDE ? 0 : (question.sessionOptions?.points ?? 1),
        }
        : emptyForm();
    };

    const rawNextForm = initial
      ? toFormState(initial)
      : emptyForm();
    const rawBaselineForm = initialBaseline
      ? toFormState(initialBaseline)
      : rawNextForm;
    const nextForm = cloneFormState(rawNextForm);
    const baselineForm = cloneFormState(rawBaselineForm);
    const currentFormHash = JSON.stringify(buildQuestionPayload(nextForm));
    const snapshotHash = JSON.stringify(buildQuestionPayload(baselineForm));

    hydratingRef.current = true;
    latestFormRef.current = cloneFormState(nextForm);
    setForm(nextForm);
    initialFormRef.current = baselineForm;
    setInitialSnapshotHash(snapshotHash);
    setAutosaveState('idle');
    setAutosaveError('');
    saveInFlightRef.current = false;
    queuedSaveRef.current = null;

    const nextId = initial?._id || null;
    setPersistedQuestionId(nextId);
    questionIdRef.current = nextId;

    lastSavedHashRef.current = nextId ? currentFormHash : '';

    const hydrationTimer = setTimeout(() => {
      hydratingRef.current = false;
    }, 0);

    return () => clearTimeout(hydrationTimer);
  }, [open, initial?._id]);

  useEffect(() => {
    if (!open || hydratingRef.current) return;
    if (!hasRichTextContent(form.content) && !questionIdRef.current) return;

    const payload = buildQuestionPayload(form);
    const payloadHash = JSON.stringify(payload);
    if (payloadHash === lastSavedHashRef.current) return;

    const autosaveTimer = setTimeout(() => {
      persistPayload(payload, payloadHash);
    }, 700);

    return () => clearTimeout(autosaveTimer);
  }, [open, form, persistPayload]);

  const currentPayloadHash = useMemo(() => JSON.stringify(buildQuestionPayload(form)), [form]);
  const deferredPreviewForm = useDeferredValue(form);
  const previewPayload = useMemo(() => buildQuestionPayload(deferredPreviewForm), [deferredPreviewForm]);
  const hasChangesSinceOpen = useMemo(() => {
    if (!open) return false;
    return currentPayloadHash !== initialSnapshotHash;
  }, [currentPayloadHash, initialSnapshotHash, open]);

  // Warn before erasing option content when leaving option-based types.
  const handleTypeChange = (type) => {
    const currentForm = latestFormRef.current;
    if (disableTypeSelection) return;
    if (type === currentForm.type) return;

    const switchingFromOptionBasedType = isOptionBasedQuestionType(currentForm.type);
    const switchingToNonOptionBasedType = !isOptionBasedQuestionType(type);
    if (switchingFromOptionBasedType && switchingToNonOptionBasedType && hasAnyOptionContent(currentForm.options)) {
      const confirmReset = window.confirm(
        t('questions.editor.confirmTypeChange')
      );
      if (!confirmReset) return;
    }

    let nextOptions = currentForm.options;
    if (currentForm.type === QUESTION_TYPES.MULTI_SELECT && type === QUESTION_TYPES.MULTIPLE_CHOICE) {
      const correctCount = currentForm.options.filter((option) => !!option.correct).length;
      if (correctCount > 1) {
        const confirmSingleCorrect = window.confirm(
          t('questions.editor.confirmSingleCorrect')
        );
        if (!confirmSingleCorrect) return;
      }
      nextOptions = enforceSingleCorrectOption(currentForm.options);
    }

    const update = { ...currentForm, type };
    if (type === QUESTION_TYPES.TRUE_FALSE) {
      update.options = normalizeTrueFalseOptions(currentForm.options);
    } else if (type === QUESTION_TYPES.SHORT_ANSWER) {
      update.options = [];
      update.solution = currentForm.solution;
    } else if (type === QUESTION_TYPES.NUMERICAL) {
      update.options = [];
    } else if (type === QUESTION_TYPES.SLIDE) {
      update.options = [];
      update.solution = '';
      update.points = 0;
    } else if (
      currentForm.type === QUESTION_TYPES.TRUE_FALSE
      || currentForm.type === QUESTION_TYPES.SHORT_ANSWER
      || currentForm.type === QUESTION_TYPES.NUMERICAL
      || currentForm.type === QUESTION_TYPES.SLIDE
    ) {
      update.options = [{ content: '', correct: false }, { content: '', correct: false }];
    } else if (nextOptions !== currentForm.options) {
      update.options = nextOptions;
    }
    if (type !== QUESTION_TYPES.SLIDE && currentForm.type === QUESTION_TYPES.SLIDE && Number(update.points) === 0) {
      update.points = 1;
    }
    updateForm(update);
  };

  const setOption = (idx, field, value) => {
    updateForm((prev) => {
      const opts = [...prev.options];
      opts[idx] = { ...opts[idx], [field]: value };
      if (field === 'correct' && value && (prev.type === QUESTION_TYPES.MULTIPLE_CHOICE || prev.type === QUESTION_TYPES.TRUE_FALSE)) {
        opts.forEach((o, i) => { if (i !== idx) o.correct = false; });
      }
      return { ...prev, options: opts };
    });
  };

  const addOption = () => {
    if (disableOptionCountChanges) return;
    updateForm((prev) => ({ ...prev, options: [...prev.options, { content: '', correct: false }] }));
  };
  const removeOption = (idx) => {
    if (disableOptionCountChanges) return;
    updateForm((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== idx) }));
  };

  const autoSaveStatus = autosaveState === 'saved' ? 'success' : autosaveState;

  const handleCloseRequest = useCallback(async () => {
    if (closing) return;

    setClosing(true);
    try {
      const latestForm = latestFormRef.current;
      const shouldAttemptSave = hasRichTextContent(latestForm.content) || !!questionIdRef.current;
      if (shouldAttemptSave) {
        const payload = buildQuestionPayload(latestForm);
        const payloadHash = JSON.stringify(payload);
        if (payloadHash !== lastSavedHashRef.current || saveInFlightRef.current || queuedSaveRef.current) {
          await persistPayload(payload, payloadHash);
        }
        await waitForSaveDrain();
      }

      onClose?.({ persistedQuestionId: questionIdRef.current });
    } catch {
      // Keep editor open on save failure so user can retry.
    } finally {
      setClosing(false);
    }
  }, [closing, onClose, persistPayload, waitForSaveDrain]);

  useImperativeHandle(ref, () => ({
    requestClose: handleCloseRequest,
  }), [handleCloseRequest]);

  const handleUndoAllChanges = useCallback(() => {
    setAutosaveError('');
    setAutosaveState('idle');
    updateForm(cloneFormState(initialFormRef.current));
  }, [updateForm]);

  const editorFields = (
    <>
        {(() => {
          const slideMode = isSlideType(form.type);
          const questionTextLabel = slideMode ? t('questions.editor.slideText') : t('questions.editor.questionText');
          const questionPlaceholder = slideMode ? t('questions.editor.slidePlaceholder') : t('questions.editor.questionPlaceholder');

          return (
            <>
        <Box
          sx={{
            display: 'flex',
            gap: 1.25,
            mb: 2,
            mt: 1,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ flexGrow: 1, minWidth: { xs: '100%', sm: 260 }, maxWidth: { sm: 360 } }}>
            <FormControl
              size="small"
              sx={{
                width: '100%',
                ...COMPACT_FIELD_SX,
              }}
            >
              <InputLabel>{t('questions.editor.questionType')}</InputLabel>
              <Select
                size="small"
                value={form.type}
                label={t('questions.editor.questionType')}
                disabled={disableTypeSelection}
                onChange={e => handleTypeChange(Number(e.target.value))}
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={Number(k)}>{v}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {disableTypeSelection && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {typeSelectionLockReason}
              </Typography>
            )}
          </Box>

          {!slideMode && (
            <TextField
              label={t('questions.editor.points')}
              type="number"
              size="small"
              sx={{ width: 120, ...COMPACT_FIELD_SX }}
              inputProps={{ min: 0 }}
              value={form.points}
              onChange={e => updateForm((prev) => ({ ...prev, points: e.target.value }))}
            />
          )}
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, minHeight: 24 }}>
            <Typography variant="subtitle2">{questionTextLabel}</Typography>
            {hasChangesSinceOpen ? (
              <Button
                size="small"
                onClick={handleUndoAllChanges}
                disabled={closing}
              >
                {t('questions.editor.undoAllChanges')}
              </Button>
            ) : null}
          </Box>
          <RichTextEditor
            value={form.content}
            onChange={({ html }) => updateForm((prev) => ({ ...prev, content: html }))}
            placeholder={questionPlaceholder}
            minHeight={26}
            resizable
            showTip
          />
        </Box>

        {isOptionBasedQuestionType(form.type) && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {form.type === QUESTION_TYPES.MULTI_SELECT ? t('questions.editor.optionsSelectAll') : t('questions.editor.optionsSelectOne')}
            </Typography>
            {disableOptionCountChanges && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {optionCountLockReason}
              </Typography>
            )}
            {form.options.map((opt, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
                {form.type === QUESTION_TYPES.MULTI_SELECT ? (
                  <Checkbox checked={opt.correct} onChange={e => setOption(i, 'correct', e.target.checked)} sx={{ mt: 0.5 }} />
                ) : (
                  <Checkbox checked={opt.correct} onChange={() => setOption(i, 'correct', true)} sx={{ mt: 0.5 }} />
                )}
                <Box sx={{ flexGrow: 1 }}>
                  <RichTextEditor
                    value={opt.content}
                    onChange={({ html }) => setOption(i, 'content', html)}
                    placeholder={`Option ${i + 1}`}
                    minHeight={30}
                    compact
                  />
                </Box>
                {form.options.length > 2 && (
                  <IconButton size="small" disabled={disableOptionCountChanges} onClick={() => removeOption(i)} sx={{ mt: 0.5 }}><DeleteIcon fontSize="small" /></IconButton>
                )}
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addOption} disabled={disableOptionCountChanges}>{t('questions.editor.addOption')}</Button>
          </Box>
        )}

        {form.type === QUESTION_TYPES.TRUE_FALSE && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('questions.editor.correctAnswer')}</Typography>
            <FormGroup row>
              <FormControlLabel
                control={<Checkbox checked={form.options[0]?.correct || false} onChange={() => {
                  updateForm((prev) => ({ ...prev, options: buildTrueFalseOptions(0) }));
                }} />}
                label={t('questions.editor.true')}
              />
              <FormControlLabel
                control={<Checkbox checked={form.options[1]?.correct || false} onChange={() => {
                  updateForm((prev) => ({ ...prev, options: buildTrueFalseOptions(1) }));
                }} />}
                label={t('questions.editor.false')}
              />
            </FormGroup>
          </Box>
        )}

        {form.type === QUESTION_TYPES.NUMERICAL && (
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label={t('questions.editor.correctAnswer')}
              type="number"
              fullWidth
              value={form.correctNumerical}
              onChange={e => updateForm((prev) => ({ ...prev, correctNumerical: e.target.value }))}
            />
            <TextField
              label={t('questions.editor.toleranceLabel')}
              type="number"
              fullWidth
              value={form.toleranceNumerical}
              onChange={e => updateForm((prev) => ({ ...prev, toleranceNumerical: e.target.value }))}
            />
          </Box>
        )}

        {!slideMode && (
          <>
            <Divider sx={{ my: 2 }} />

            <RichTextEditor
              label={t('questions.editor.solutionLabel')}
              value={form.solution}
              onChange={({ html }) => updateForm((prev) => ({ ...prev, solution: html }))}
              placeholder={t('questions.editor.solutionPlaceholder')}
              minHeight={26}
              resizable
            />
          </>
        )}
        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('questions.editor.livePreview')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('questions.editor.mathDelimitersNote')}
        </Typography>
        <Paper variant="outlined" sx={{ mt: 1, p: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Question
          </Typography>
          <MathLivePreview
            html={previewPayload.content}
            fallback={previewPayload.plainText}
            emptyText="(no question text yet)"
          />

          {(isOptionBasedQuestionType(form.type) || form.type === QUESTION_TYPES.TRUE_FALSE)
            && (previewPayload.options || []).length > 0 && (
              <Box sx={{ mt: 1 }}>
                {(previewPayload.options || []).map((option, optionIdx) => (
                  <Box
                    key={`preview-option-${optionIdx}`}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '20px minmax(0, 1fr)',
                      columnGap: 0.5,
                      alignItems: 'start',
                      mb: 0.75,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                      {String.fromCharCode(65 + optionIdx)}.
                    </Typography>
                    <Box sx={{ '& p': { my: 0 }, '& ul, & ol': { my: 0, pl: 2.5 }, '& li': { my: 0 } }}>
                      <MathLivePreview
                        html={option.content}
                        fallback={option.plainText || option.answer}
                        emptyText={`(empty option ${optionIdx + 1})`}
                        compact
                      />
                    </Box>
                  </Box>
                ))}
              </Box>
            )}

          {form.type === QUESTION_TYPES.NUMERICAL && (
            <Box sx={{ mt: 0.75 }}>
              <Typography variant="body2" color="text.secondary">
                {t('questions.editor.correctValue', { value: previewPayload.correctNumerical ?? 0 })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('questions.editor.toleranceValue', { value: previewPayload.toleranceNumerical ?? 0 })}
              </Typography>
            </Box>
          )}

          {!slideMode && previewPayload.solution ? (
            <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary">
                {t('common.solution')}
              </Typography>
              <MathLivePreview
                html={previewPayload.solution}
                fallback={previewPayload.solution_plainText}
                emptyText=""
              />
            </Box>
          ) : null}
        </Paper>
            </>
          );
        })()}
    </>
  );

  const footer = (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        px: inline ? 0 : 3,
        py: inline ? 0 : 1,
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
      }}
    >
      <Box sx={{ minHeight: 24, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <AutoSaveStatus status={autoSaveStatus} errorText={autosaveError} />
        <Button
          size="small"
          onClick={handleUndoAllChanges}
          disabled={!hasChangesSinceOpen || closing}
        >
          {t('questions.editor.undoAllChanges')}
        </Button>
      </Box>
      <Button onClick={handleCloseRequest} disabled={closing}>
        {closing ? t('questions.editor.closing') : t('common.close')}
      </Button>
    </Box>
  );

  if (inline) {
    return (
      <Box sx={{ width: '100%', minWidth: 0 }}>
        {editorFields}
        <Box sx={{ mt: 1.5 }}>{footer}</Box>
      </Box>
    );
  }

  return (
    <Dialog
      open={open}
      maxWidth="md"
      fullWidth
      onClose={(_event, reason) => {
        if (reason === 'backdropClick') return;
        handleCloseRequest();
      }}
    >
      <DialogTitle>{persistedQuestionId ? t('questions.editor.editQuestion') : t('questions.editor.newQuestion')}</DialogTitle>
      <DialogContent dividers>
        <Paper variant="outlined" sx={{ border: 'none', boxShadow: 'none' }}>
          {editorFields}
        </Paper>
      </DialogContent>
      <DialogActions>{footer}</DialogActions>
    </Dialog>
  );
});

export default QuestionEditor;
