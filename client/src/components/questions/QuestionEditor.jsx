import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
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
import { TYPE_LABELS, QUESTION_TYPES, normalizeQuestionType } from './constants';
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
  const solution = normalizeStoredHtml(form.solution);
  const parseOptionalNumber = (value) => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const payload = {
    type: form.type,
    content,
    plainText: extractPlainTextFromHtml(content),
    solution: solution || undefined,
    solution_plainText: solution ? extractPlainTextFromHtml(solution) : undefined,
    sessionOptions: { points: Number(form.points) || 1 },
  };

  if ([QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT].includes(form.type)) {
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
    const parsedCorrect = parseOptionalNumber(form.correctNumerical);
    const parsedTolerance = parseOptionalNumber(form.toleranceNumerical);
    if (parsedCorrect !== null) payload.correctNumerical = parsedCorrect;
    if (parsedTolerance !== null) payload.toleranceNumerical = parsedTolerance;
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

export default function QuestionEditor({
  open,
  onClose,
  onAutoSave,
  initial,
  initialBaseline = null,
  inline = false,
  disableTypeSelection = false,
  typeSelectionLockReason = 'Question type is locked for this question.',
}) {
  const [form, setForm] = useState(emptyForm());
  const [persistedQuestionId, setPersistedQuestionId] = useState(null);
  const [autosaveState, setAutosaveState] = useState('idle');
  const [autosaveError, setAutosaveError] = useState('');
  const [closing, setClosing] = useState(false);
  const [initialSnapshotHash, setInitialSnapshotHash] = useState('');

  const questionIdRef = useRef(null);
  const hydratingRef = useRef(false);
  const lastSavedHashRef = useRef('');
  const initialFormRef = useRef(emptyForm());
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(null);

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
        const savedQuestion = await onAutoSave(nextPayload, questionIdRef.current);
        if (savedQuestion?._id && savedQuestion._id !== questionIdRef.current) {
          questionIdRef.current = savedQuestion._id;
          setPersistedQuestionId(savedQuestion._id);
        }
        lastSavedHashRef.current = nextHash;
        setAutosaveState('saved');
        return savedQuestion;
      } catch (err) {
        setAutosaveState('error');
        setAutosaveError(err.response?.data?.message || 'Autosave failed');
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
  }, [onAutoSave]);

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
            : normalizeOptions(question.options),
          correctNumerical: question.correctNumerical ?? '',
          toleranceNumerical: question.toleranceNumerical ?? '',
          solution: prepareRichTextInput(question.solution || '', question.solution_plainText || ''),
          points: question.sessionOptions?.points ?? 1,
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

  const previewPayload = useMemo(() => buildQuestionPayload(form), [form]);
  const hasChangesSinceOpen = useMemo(() => {
    if (!open) return false;
    return JSON.stringify(previewPayload) !== initialSnapshotHash;
  }, [open, previewPayload, initialSnapshotHash]);

  // Warn before erasing option content when leaving option-based types.
  const handleTypeChange = (type) => {
    if (disableTypeSelection) return;
    if (type === form.type) return;

    const switchingFromOptionBasedType = [QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.MULTI_SELECT].includes(form.type);
    const switchingToNonOptionBasedType = ![QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.MULTI_SELECT].includes(type);
    if (switchingFromOptionBasedType && switchingToNonOptionBasedType && hasAnyOptionContent(form.options)) {
      const confirmReset = window.confirm(
        'Changing this question type will erase existing options. Continue?'
      );
      if (!confirmReset) return;
    }

    let nextOptions = form.options;
    if (form.type === QUESTION_TYPES.MULTI_SELECT && type === QUESTION_TYPES.MULTIPLE_CHOICE) {
      const correctCount = form.options.filter((option) => !!option.correct).length;
      if (correctCount > 1) {
        const confirmSingleCorrect = window.confirm(
          'Multiple Choice allows only one correct option. Continue and keep only the first correct selection?'
        );
        if (!confirmSingleCorrect) return;
      }
      nextOptions = enforceSingleCorrectOption(form.options);
    }

    const update = { ...form, type };
    if (type === QUESTION_TYPES.TRUE_FALSE) {
      update.options = normalizeTrueFalseOptions(form.options);
    } else if (type === QUESTION_TYPES.SHORT_ANSWER) {
      update.options = [];
    } else if (type === QUESTION_TYPES.NUMERICAL) {
      update.options = [];
    } else if (
      form.type === QUESTION_TYPES.TRUE_FALSE
      || form.type === QUESTION_TYPES.SHORT_ANSWER
      || form.type === QUESTION_TYPES.NUMERICAL
    ) {
      update.options = [{ content: '', correct: false }, { content: '', correct: false }];
    } else if (nextOptions !== form.options) {
      update.options = nextOptions;
    }
    setForm(update);
  };

  const setOption = (idx, field, value) => {
    setForm((prev) => {
      const opts = [...prev.options];
      opts[idx] = { ...opts[idx], [field]: value };
      if (field === 'correct' && value && (prev.type === QUESTION_TYPES.MULTIPLE_CHOICE || prev.type === QUESTION_TYPES.TRUE_FALSE)) {
        opts.forEach((o, i) => { if (i !== idx) o.correct = false; });
      }
      return { ...prev, options: opts };
    });
  };

  const addOption = () => setForm(prev => ({ ...prev, options: [...prev.options, { content: '', correct: false }] }));
  const removeOption = (idx) => setForm(prev => ({ ...prev, options: prev.options.filter((_, i) => i !== idx) }));

  const autoSaveStatus = autosaveState === 'saved' ? 'success' : autosaveState;

  const handleCloseRequest = useCallback(async () => {
    if (closing) return;

    setClosing(true);
    try {
      const shouldAttemptSave = hasRichTextContent(form.content) || !!questionIdRef.current;
      if (shouldAttemptSave) {
        const payload = buildQuestionPayload(form);
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
  }, [closing, form, onClose, persistPayload, waitForSaveDrain]);

  const handleUndoAllChanges = useCallback(() => {
    setAutosaveError('');
    setAutosaveState('idle');
    setForm(cloneFormState(initialFormRef.current));
  }, []);

  const editorFields = (
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
              <InputLabel>Question Type</InputLabel>
              <Select
                size="small"
                value={form.type}
                label="Question Type"
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

          <TextField
            label="Points"
            type="number"
            size="small"
            sx={{ width: 120, ...COMPACT_FIELD_SX }}
            inputProps={{ min: 0 }}
            value={form.points}
            onChange={e => setForm({ ...form, points: e.target.value })}
          />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, minHeight: 24 }}>
            <Typography variant="subtitle2">Question Text</Typography>
            {hasChangesSinceOpen ? (
              <Button
                size="small"
                onClick={handleUndoAllChanges}
                disabled={closing}
              >
                Undo all changes
              </Button>
            ) : null}
          </Box>
          <RichTextEditor
            value={form.content}
            onChange={({ html }) => setForm(prev => ({ ...prev, content: html }))}
            placeholder="Write the question here..."
            minHeight={26}
            resizable
            showTip
          />
        </Box>

        {[QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.MULTI_SELECT].includes(form.type) && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Options {form.type === QUESTION_TYPES.MULTI_SELECT ? '(select all correct)' : '(select one correct)'}
            </Typography>
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
                  <IconButton size="small" onClick={() => removeOption(i)} sx={{ mt: 0.5 }}><DeleteIcon fontSize="small" /></IconButton>
                )}
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addOption}>Add Option</Button>
          </Box>
        )}

        {form.type === QUESTION_TYPES.TRUE_FALSE && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Correct Answer</Typography>
            <FormGroup row>
              <FormControlLabel
                control={<Checkbox checked={form.options[0]?.correct || false} onChange={() => {
                  setForm({ ...form, options: buildTrueFalseOptions(0) });
                }} />}
                label="True"
              />
              <FormControlLabel
                control={<Checkbox checked={form.options[1]?.correct || false} onChange={() => {
                  setForm({ ...form, options: buildTrueFalseOptions(1) });
                }} />}
                label="False"
              />
            </FormGroup>
          </Box>
        )}

        {form.type === QUESTION_TYPES.NUMERICAL && (
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="Correct Answer"
              type="number"
              fullWidth
              value={form.correctNumerical}
              onChange={e => setForm({ ...form, correctNumerical: e.target.value })}
            />
            <TextField
              label="Tolerance (+/-)"
              type="number"
              fullWidth
              value={form.toleranceNumerical}
              onChange={e => setForm({ ...form, toleranceNumerical: e.target.value })}
            />
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <RichTextEditor
          label="Solution / Explanation (optional)"
          value={form.solution}
          onChange={({ html }) => setForm(prev => ({ ...prev, solution: html }))}
          placeholder="Add an optional explanation..."
          minHeight={26}
          resizable
        />
        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Live Preview
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Math delimiters stay visible while typing; rendered KaTeX is shown below.
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

          {[QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT].includes(form.type)
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
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              Correct: {previewPayload.correctNumerical ?? '—'} (± {previewPayload.toleranceNumerical ?? '—'})
            </Typography>
          )}

          {previewPayload.solution ? (
            <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary">
                Solution
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
          Undo all changes
        </Button>
      </Box>
      <Button onClick={handleCloseRequest} disabled={closing}>
        {closing ? 'Closing…' : 'Close'}
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
      <DialogTitle>{persistedQuestionId ? 'Edit Question' : 'New Question'}</DialogTitle>
      <DialogContent dividers>
        <Paper variant="outlined" sx={{ border: 'none', boxShadow: 'none' }}>
          {editorFields}
        </Paper>
      </DialogContent>
      <DialogActions>{footer}</DialogActions>
    </Dialog>
  );
}
