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
import { prepareRichTextInput, renderKatexInElement } from './richTextUtils';

function renderRichText(value, fallback = '') {
  const contentHtml = prepareRichTextInput(value || '', fallback || '');
  if (!contentHtml) {
    return <Typography variant="body1" sx={{ mb: 1 }}>(no content)</Typography>;
  }
  return (
    <Box
      sx={{ mb: 1, '& p': { my: 0.5 } }}
      dangerouslySetInnerHTML={{ __html: contentHtml }}
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
    if (!containerRef.current) return;
    renderKatexInElement(containerRef.current);
  }, [question, normalizedType]);

  const shouldLetterOptions = [QUESTION_TYPES.MULTIPLE_CHOICE, QUESTION_TYPES.MULTI_SELECT].includes(normalizedType);

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
            <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 0.5 }}>
              <Box sx={{ width: 20, display: 'flex', justifyContent: 'center', pt: 0.25 }}>
                {opt.correct ? <CorrectIcon color="success" fontSize="small" /> : null}
              </Box>
              <Box sx={{ color: opt.correct ? 'success.main' : 'text.secondary' }}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: shouldLetterOptions ? '20px minmax(0, 1fr)' : 'minmax(0, 1fr)',
                    columnGap: 0.5,
                    alignItems: 'start',
                  }}
                >
                  {shouldLetterOptions ? <Typography variant="body2" sx={{ lineHeight: 1.5 }}>{String.fromCharCode(65 + i)}.</Typography> : null}
                  <Box
                    sx={{
                      '& p': { my: 0 },
                      '& ul, & ol': { my: 0, pl: 2.5 },
                      '& li': { my: 0 },
                    }}
                    dangerouslySetInnerHTML={{
                      __html: prepareRichTextInput(
                        opt.content || opt.plainText || opt.answer || `Option ${i + 1}`
                      ),
                    }}
                  />
                </Box>
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

      {(question.solution || question.solution_plainText) && (
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Solution
          </Typography>
          <Box dangerouslySetInnerHTML={{ __html: prepareRichTextInput(question.solution, question.solution_plainText) }} />
        </Box>
      )}
    </Paper>
  );
}
