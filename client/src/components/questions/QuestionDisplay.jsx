import {
  Box, Typography, Chip, Paper,
} from '@mui/material';
import {
  CheckCircle as CorrectIcon,
} from '@mui/icons-material';
import { TYPE_LABELS, TYPE_COLORS, QUESTION_TYPES } from './constants';

export default function QuestionDisplay({ question }) {
  if (!question) return null;
  const opts = question.options || [];
  const points = question.sessionOptions?.points;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Chip label={TYPE_LABELS[question.type] || 'Unknown'} color={TYPE_COLORS[question.type] || 'default'} size="small" />
        {points != null && <Chip label={`${points} pt${points !== 1 ? 's' : ''}`} size="small" variant="outlined" />}
      </Box>

      <Typography variant="body1" sx={{ mb: 1 }}>{question.content || question.plainText || '(no content)'}</Typography>

      {[QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT].includes(question.type) && opts.length > 0 && (
        <Box sx={{ pl: 2 }}>
          {opts.map((opt, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
              {opt.correct && <CorrectIcon color="success" fontSize="small" />}
              <Typography variant="body2" color={opt.correct ? 'success.main' : 'text.secondary'}>
                {opt.content || opt.answer || `Option ${i + 1}`}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {question.type === QUESTION_TYPES.NUMERICAL && (
        <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
          Correct: {question.correctNumerical ?? '—'} (± {question.toleranceNumerical ?? 0})
        </Typography>
      )}
    </Paper>
  );
}
