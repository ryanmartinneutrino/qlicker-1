import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Select, MenuItem, FormControl, InputLabel,
  Box, IconButton, FormControlLabel, Typography, Divider,
  Checkbox, FormGroup, Alert,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { TYPE_LABELS, QUESTION_TYPES, normalizeQuestionType } from './constants';
import RichTextEditor from './RichTextEditor';
import {
  extractPlainTextFromHtml,
  hasRichTextContent,
  normalizeStoredHtml,
  prepareRichTextInput,
} from './richTextUtils';

function normalizeOptions(opts) {
  if (!opts || !opts.length) return [{ content: '', correct: false }, { content: '', correct: false }];
  return opts.map((o) => ({
    content: prepareRichTextInput(o.content || o.answer || '', o.plainText || ''),
    correct: !!o.correct,
  }));
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

function buildQuestionPayload(form) {
  const content = normalizeStoredHtml(form.content);
  const solution = normalizeStoredHtml(form.solution);
  const payload = {
    type: form.type,
    content,
    plainText: extractPlainTextFromHtml(content),
    solution: solution || undefined,
    solution_plainText: solution ? extractPlainTextFromHtml(solution) : undefined,
    sessionOptions: { points: Number(form.points) || 1 },
  };

  if ([QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT].includes(form.type)) {
    payload.options = form.options.map((o) => {
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

export default function QuestionEditor({
  open,
  onClose,
  onAutoSave,
  initial,
}) {
  const [form, setForm] = useState(emptyForm());
  const [persistedQuestionId, setPersistedQuestionId] = useState(null);
  const [autosaveState, setAutosaveState] = useState('idle');
  const [autosaveError, setAutosaveError] = useState('');

  const questionIdRef = useRef(null);
  const hydratingRef = useRef(false);
  const lastSavedHashRef = useRef('');
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(null);

  const persistPayload = useCallback(async (payload, payloadHash) => {
    if (saveInFlightRef.current) {
      queuedSaveRef.current = { payload, payloadHash };
      return;
    }

    saveInFlightRef.current = true;
    setAutosaveState('saving');
    setAutosaveError('');

    try {
      const savedQuestion = await onAutoSave(payload, questionIdRef.current);
      if (savedQuestion?._id && savedQuestion._id !== questionIdRef.current) {
        questionIdRef.current = savedQuestion._id;
        setPersistedQuestionId(savedQuestion._id);
      }
      lastSavedHashRef.current = payloadHash;
      setAutosaveState('saved');
    } catch (err) {
      setAutosaveState('error');
      setAutosaveError(err.response?.data?.message || 'Autosave failed');
    } finally {
      saveInFlightRef.current = false;
      if (queuedSaveRef.current) {
        const queued = queuedSaveRef.current;
        queuedSaveRef.current = null;
        persistPayload(queued.payload, queued.payloadHash);
      }
    }
  }, [onAutoSave]);

  useEffect(() => {
    if (!open) return;

    const nextForm = initial
      ? {
        type: normalizeQuestionType(initial),
        content: prepareRichTextInput(initial.content || '', initial.plainText || ''),
        options: normalizeOptions(initial.options),
        correctNumerical: initial.correctNumerical ?? '',
        toleranceNumerical: initial.toleranceNumerical ?? '',
        solution: prepareRichTextInput(initial.solution || '', initial.solution_plainText || ''),
        points: initial.sessionOptions?.points ?? 1,
      }
      : emptyForm();

    hydratingRef.current = true;
    setForm(nextForm);
    setAutosaveState('idle');
    setAutosaveError('');
    saveInFlightRef.current = false;
    queuedSaveRef.current = null;

    const nextId = initial?._id || null;
    setPersistedQuestionId(nextId);
    questionIdRef.current = nextId;

    lastSavedHashRef.current = nextId ? JSON.stringify(buildQuestionPayload(nextForm)) : '';

    const hydrationTimer = setTimeout(() => {
      hydratingRef.current = false;
    }, 0);

    return () => clearTimeout(hydrationTimer);
  }, [open, initial?._id]);

  useEffect(() => {
    if (!open || hydratingRef.current) return;
    if (!hasRichTextContent(form.content)) return;

    const payload = buildQuestionPayload(form);
    const payloadHash = JSON.stringify(payload);
    if (payloadHash === lastSavedHashRef.current) return;

    const autosaveTimer = setTimeout(() => {
      persistPayload(payload, payloadHash);
    }, 700);

    return () => clearTimeout(autosaveTimer);
  }, [open, form, persistPayload]);

  // When switching to TF, reset options to True/False pair
  const handleTypeChange = (type) => {
    const update = { ...form, type };
    if (type === QUESTION_TYPES.TRUE_FALSE) {
      update.options = [{ content: 'True', correct: true }, { content: 'False', correct: false }];
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

  const autosaveLabel = autosaveState === 'saving'
    ? 'Saving...'
    : autosaveState === 'saved'
      ? 'All changes saved'
      : persistedQuestionId
        ? 'Autosave enabled'
        : 'Start typing to create question';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{persistedQuestionId ? 'Edit Question' : 'New Question'}</DialogTitle>
      <DialogContent dividers>
        <FormControl fullWidth sx={{ mb: 2, mt: 1 }}>
          <InputLabel>Question Type</InputLabel>
          <Select
            value={form.type}
            label="Question Type"
            onChange={e => handleTypeChange(Number(e.target.value))}
          >
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={Number(k)}>{v}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ mb: 2 }}>
          <RichTextEditor
            label="Question Text"
            value={form.content}
            onChange={({ html }) => setForm(prev => ({ ...prev, content: html }))}
            placeholder="Write the question here..."
            minHeight={110}
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
                  setForm({ ...form, options: [{ content: 'True', correct: true }, { content: 'False', correct: false }] });
                }} />}
                label="True"
              />
              <FormControlLabel
                control={<Checkbox checked={form.options[1]?.correct || false} onChange={() => {
                  setForm({ ...form, options: [{ content: 'True', correct: false }, { content: 'False', correct: true }] });
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

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Points"
            type="number"
            sx={{ width: 120 }}
            inputProps={{ min: 0 }}
            value={form.points}
            onChange={e => setForm({ ...form, points: e.target.value })}
          />
        </Box>

        <RichTextEditor
          label="Solution / Explanation (optional)"
          value={form.solution}
          onChange={({ html }) => setForm(prev => ({ ...prev, solution: html }))}
          placeholder="Add an optional explanation..."
          minHeight={96}
        />
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        <Box sx={{ minHeight: 24, display: 'flex', alignItems: 'center' }}>
          {autosaveError ? (
            <Alert severity="error" sx={{ py: 0 }}>
              {autosaveError}
            </Alert>
          ) : (
            <Typography variant="caption" color="text.secondary">{autosaveLabel}</Typography>
          )}
        </Box>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
