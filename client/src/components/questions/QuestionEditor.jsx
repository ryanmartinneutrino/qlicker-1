import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Select, MenuItem, FormControl, InputLabel,
  Box, IconButton, Switch, FormControlLabel, Typography, Divider,
  Checkbox, FormGroup,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { TYPE_LABELS, QUESTION_TYPES } from './constants';

function normalizeOptions(opts) {
  if (!opts || !opts.length) return [{ content: '', correct: false }, { content: '', correct: false }];
  return opts.map(o => ({ content: o.content || o.answer || '', correct: !!o.correct }));
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

export default function QuestionEditor({ open, onClose, onSave, initial, saving }) {
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          type: initial.type || QUESTION_TYPES.MULTIPLE_CHOICE,
          content: initial.content || '',
          options: normalizeOptions(initial.options),
          correctNumerical: initial.correctNumerical ?? '',
          toleranceNumerical: initial.toleranceNumerical ?? '',
          solution: initial.solution || '',
          points: initial.sessionOptions?.points ?? 1,
        });
      } else {
        setForm(emptyForm());
      }
    }
  }, [open, initial]);

  // When switching to TF, reset options to True/False pair
  const handleTypeChange = (type) => {
    const update = { ...form, type };
    if (type === QUESTION_TYPES.TRUE_FALSE) {
      update.options = [{ content: 'True', correct: true }, { content: 'False', correct: false }];
    } else if (type === QUESTION_TYPES.SHORT_ANSWER) {
      update.options = [];
    } else if (type === QUESTION_TYPES.NUMERICAL) {
      update.options = [];
    } else if (form.type === QUESTION_TYPES.TRUE_FALSE || form.type === QUESTION_TYPES.SHORT_ANSWER || form.type === QUESTION_TYPES.NUMERICAL) {
      // Switching from SA/TF/NU to MC/MS — provide two blank options
      update.options = [{ content: '', correct: false }, { content: '', correct: false }];
    }
    setForm(update);
  };

  const setOption = (idx, field, value) => {
    const opts = [...form.options];
    opts[idx] = { ...opts[idx], [field]: value };
    // For MC/TF: only one correct allowed
    if (field === 'correct' && value && (form.type === QUESTION_TYPES.MULTIPLE_CHOICE || form.type === QUESTION_TYPES.TRUE_FALSE)) {
      opts.forEach((o, i) => { if (i !== idx) o.correct = false; });
    }
    setForm({ ...form, options: opts });
  };

  const addOption = () => setForm({ ...form, options: [...form.options, { content: '', correct: false }] });
  const removeOption = (idx) => setForm({ ...form, options: form.options.filter((_, i) => i !== idx) });

  const handleSubmit = () => {
    const payload = {
      type: form.type,
      content: form.content,
      plainText: form.content,
      solution: form.solution || undefined,
      sessionOptions: { points: Number(form.points) || 1 },
    };
    if ([QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT].includes(form.type)) {
      payload.options = form.options.map(o => ({ content: o.content, correct: o.correct }));
    }
    if (form.type === QUESTION_TYPES.NUMERICAL) {
      payload.correctNumerical = Number(form.correctNumerical) || 0;
      payload.toleranceNumerical = Number(form.toleranceNumerical) || 0;
    }
    onSave(payload);
  };

  const isValid = form.content.trim().length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? 'Edit Question' : 'New Question'}</DialogTitle>
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

        <TextField
          label="Question Text"
          multiline minRows={2}
          fullWidth
          value={form.content}
          onChange={e => setForm({ ...form, content: e.target.value })}
          sx={{ mb: 2 }}
        />

        {/* MC / MS options */}
        {[QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.MULTI_SELECT].includes(form.type) && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Options {form.type === QUESTION_TYPES.MULTI_SELECT ? '(select all correct)' : '(select one correct)'}
            </Typography>
            {form.options.map((opt, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                {form.type === QUESTION_TYPES.MULTI_SELECT ? (
                  <Checkbox checked={opt.correct} onChange={e => setOption(i, 'correct', e.target.checked)} />
                ) : (
                  <Checkbox checked={opt.correct} onChange={() => setOption(i, 'correct', true)} />
                )}
                <TextField
                  size="small" fullWidth
                  placeholder={`Option ${i + 1}`}
                  value={opt.content}
                  onChange={e => setOption(i, 'content', e.target.value)}
                />
                {form.options.length > 2 && (
                  <IconButton size="small" onClick={() => removeOption(i)}><DeleteIcon fontSize="small" /></IconButton>
                )}
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addOption}>Add Option</Button>
          </Box>
        )}

        {/* TF options */}
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

        {/* Numerical */}
        {form.type === QUESTION_TYPES.NUMERICAL && (
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="Correct Answer" type="number" fullWidth
              value={form.correctNumerical}
              onChange={e => setForm({ ...form, correctNumerical: e.target.value })}
            />
            <TextField
              label="Tolerance (±)" type="number" fullWidth
              value={form.toleranceNumerical}
              onChange={e => setForm({ ...form, toleranceNumerical: e.target.value })}
            />
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Points" type="number" sx={{ width: 120 }}
            inputProps={{ min: 0 }}
            value={form.points}
            onChange={e => setForm({ ...form, points: e.target.value })}
          />
        </Box>

        <TextField
          label="Solution / Explanation (optional)"
          multiline minRows={2} fullWidth
          value={form.solution}
          onChange={e => setForm({ ...form, solution: e.target.value })}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!isValid || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
