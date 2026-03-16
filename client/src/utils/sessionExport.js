import { prepareRichTextInput } from '../components/questions/richTextUtils';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function slugifyFilenamePart(value, fallback = 'session') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

export function buildSessionExportFilename(sessionName, suffix, extension) {
  return `${slugifyFilenamePart(sessionName, 'session')}-${suffix}.${extension}`;
}

function isCorrectOption(option) {
  return option?.correct === true || option?.correct === 1 || option?.correct === '1';
}

function buildOptionHtml(option, index, { showAnswers = false } = {}) {
  const content = prepareRichTextInput(
    option?.content || option?.plainText || option?.answer || '',
    option?.plainText || option?.answer || `Option ${index + 1}`
  );
  const isCorrect = isCorrectOption(option);
  const marker = showAnswers && isCorrect ? '✓' : String.fromCharCode(65 + index);

  return `
    <li class="option ${showAnswers && isCorrect ? 'option-correct' : ''}">
      <span class="option-marker">${escapeHtml(marker)}.</span>
      <div class="option-content">${content}</div>
    </li>
  `;
}

function buildQuestionAnswerHtml(question, { t } = {}) {
  if (Number(question?.type) === 4) {
    return `
      <div class="answer-box">
        <strong>${escapeHtml(t('questions.display.correct', { value: question?.correctNumerical ?? '—' }))}</strong>
        <span>${escapeHtml(t('questions.display.tolerance', { value: question?.toleranceNumerical ?? 0 }))}</span>
      </div>
    `;
  }

  if (!Array.isArray(question?.options) || question.options.length === 0) {
    return '';
  }

  return `
    <ul class="options">
      ${question.options.map((option, index) => buildOptionHtml(option, index, { showAnswers: true })).join('')}
    </ul>
  `;
}

function buildQuestionHtml(question, index, { showAnswers = false, showSolutions = false, t }) {
  const prompt = prepareRichTextInput(question?.content || '', question?.plainText || t('common.noContent'));
  const options = !showAnswers && Array.isArray(question?.options) && question.options.length > 0
    ? `<ul class="options">${question.options.map((option, optionIndex) => buildOptionHtml(option, optionIndex)).join('')}</ul>`
    : '';
  const answers = showAnswers ? buildQuestionAnswerHtml(question, { t }) : '';
  const solution = showSolutions && (question?.solution || question?.solution_plainText)
    ? `
      <section class="solution">
        <h3>${escapeHtml(t('common.solution'))}</h3>
        <div>${prepareRichTextInput(question.solution || '', question.solution_plainText || '')}</div>
      </section>
    `
    : '';

  return `
    <article class="question">
      <header class="question-header">
        <h2>${escapeHtml(t('professor.sessionEditor.questionNumber', { number: index + 1 }))}</h2>
      </header>
      <div class="question-body">${prompt}</div>
      ${options}
      ${answers}
      ${solution}
    </article>
  `;
}

export function buildPrintableSessionHtml({
  course,
  session,
  questions = [],
  variant = 'questions',
  t,
}) {
  const showAnswers = variant === 'answers' || variant === 'answers-solutions';
  const showSolutions = variant === 'answers-solutions';
  const subtitle = variant === 'answers-solutions'
    ? t('professor.sessionEditor.pdfAnswersSolutions')
    : variant === 'answers'
      ? t('professor.sessionEditor.pdfAnswers')
      : t('professor.sessionEditor.pdfQuestions');

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(session?.name || 'Session export')}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 24px; font-size: 14px; line-height: 1.5; }
        h1, h2, h3, p { margin: 0; }
        .page-header { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #333; }
        .page-header h1 { font-size: 20px; margin-bottom: 4px; }
        .page-header p { color: #555; font-size: 12px; }
        .question { break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #ddd; }
        .question-header { margin-bottom: 8px; }
        .question-header h2 { font-size: 16px; }
        .question-body p, .question-body ul, .question-body ol, .option-content p, .option-content ul, .option-content ol, .solution p, .solution ul, .solution ol { margin: 0 0 4px 0; }
        .question-body img, .option-content img, .solution img { max-width: 100%; height: auto; }
        .options { list-style: none; padding: 0; margin: 8px 0 0; }
        .option { display: grid; grid-template-columns: 24px 1fr; gap: 8px; align-items: start; margin-bottom: 4px; }
        .option-marker { font-weight: 700; }
        .option-correct { background: #e8f5e9; border-radius: 4px; padding: 4px 6px; }
        .answer-box { margin-top: 8px; padding: 8px 10px; background: #e8f5e9; border-left: 4px solid #2e7d32; display: grid; gap: 4px; }
        .solution { margin-top: 10px; padding-top: 8px; border-top: 1px solid #ddd; }
        .solution h3 { font-size: 12px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.03em; color: #555; }
      </style>
    </head>
    <body>
      <header class="page-header">
        <h1>${escapeHtml(session?.name || '')}</h1>
        <p>${escapeHtml(course?.name || '')}</p>
        <p>${escapeHtml(subtitle)}</p>
      </header>
      <main>
        ${questions.map((question, index) => buildQuestionHtml(question, index, {
          showAnswers,
          showSolutions,
          t,
        })).join('')}
      </main>
    </body>
  </html>`;
}

export function openSessionPrintWindow({
  course,
  session,
  questions = [],
  variant = 'questions',
  t,
}) {
  const nextWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!nextWindow) {
    throw new Error('blocked');
  }

  nextWindow.document.open();
  nextWindow.document.write(buildPrintableSessionHtml({
    course,
    session,
    questions,
    variant,
    t,
  }));
  nextWindow.document.close();
  nextWindow.focus?.();
  nextWindow.print?.();
  return nextWindow;
}
