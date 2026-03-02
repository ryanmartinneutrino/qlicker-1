import {
  Box, Typography, Chip, Paper,
} from '@mui/material';
import {
  CheckCircle as CorrectIcon,
} from '@mui/icons-material';
import { useEffect, useMemo, useRef } from 'react';
import {
  TYPE_LABELS, TYPE_COLORS, QUESTION_TYPES, normalizeQuestionType,
} from './constants';

function hasHtml(text) {
  return typeof text === 'string' && /<[^>]+>/.test(text);
}

function renderRichText(value, fallback = '') {
  const text = value || fallback || '';
  if (!hasHtml(text)) {
    return <Typography variant="body1" sx={{ mb: 1 }}>{text || '(no content)'}</Typography>;
  }
  return (
    <Box
      sx={{ mb: 1, '& p': { my: 0.5 } }}
      dangerouslySetInnerHTML={{ __html: text }}
    />
  );
}

export default function QuestionDisplay({ question }) {
  if (!question) return null;
  const containerRef = useRef(null);
  const opts = question.options || [];
  const points = question.sessionOptions?.points;
  const normalizedType = useMemo(() => normalizeQuestionType(question), [question]);

  useEffect(() => {
    if (!containerRef.current || !window.MathJax?.typesetPromise) return;
    window.MathJax.typesetPromise([containerRef.current]).catch(() => {});
  }, [question, normalizedType]);

  return (
    <Paper variant="outlined" sx={{ p: 2 }} ref={containerRef}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Chip label={TYPE_LABELS[normalizedType] || 'Unknown'} color={TYPE_COLORS[normalizedType] || 'default'} size="small" />
        {points != null && <Chip label={`${points} pt${points !== 1 ? 's' : ''}`} size="small" variant="outlined" />}
      </Box>

      {renderRichText(question.content, question.plainText)}

      {[QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.TRUE_FALSE, QUESTION_TYPES.MULTI_SELECT].includes(normalizedType) && opts.length > 0 && (
        <Box sx={{ pl: 2 }}>
          {opts.map((opt, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
              {opt.correct && <CorrectIcon color="success" fontSize="small" />}
              <Box sx={{ color: opt.correct ? 'success.main' : 'text.secondary' }}>
                {hasHtml(opt.content)
                  ? <Box dangerouslySetInnerHTML={{ __html: opt.content }} />
                  : <Typography variant="body2">{opt.content || opt.plainText || opt.answer || `Option ${i + 1}`}</Typography>}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {normalizedType === QUESTION_TYPES.NUMERICAL && (
        <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
          Correct: {question.correctNumerical ?? '—'} (± {question.toleranceNumerical ?? 0})
        </Typography>
      )}

      {question.solution && (
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Solution
          </Typography>
          {hasHtml(question.solution)
            ? <Box dangerouslySetInnerHTML={{ __html: question.solution }} />
            : <Typography variant="body2">{question.solution}</Typography>}
        </Box>
      )}
    </Paper>
  );
}
