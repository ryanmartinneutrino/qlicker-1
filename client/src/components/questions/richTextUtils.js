import katex from 'katex';
import renderMathInElement from 'katex/contrib/auto-render';

const EMPTY_PARAGRAPH_REGEX = /<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi;
const BLOCK_SPLIT_REGEX = /<\/p>\s*<p>/gi;
const CURRENCY_PATTERN = /\$\d[\d,]*(?:\.\d{1,2})?(?:\s?(?:USD|CAD|EUR|GBP))?(?!\$)/gi;

function isHtmlLike(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeHtmlAttribute(value) {
  if (!value || typeof document === 'undefined') return value || '';
  const el = document.createElement('textarea');
  el.innerHTML = value;
  return el.value;
}

function normalizeLatexForKatex(latex) {
  if (!latex) return latex;
  return latex
    .replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\*?\}/g, '\\end{aligned}');
}

function convertLegacyMathScriptTags(html) {
  if (!html || typeof document === 'undefined') return html;
  const container = document.createElement('div');
  container.innerHTML = html;

  container.querySelectorAll('script[type^="math/tex"]').forEach((scriptEl) => {
    const type = (scriptEl.getAttribute('type') || '').toLowerCase();
    const displayMode = type.includes('mode=display');
    const latex = normalizeLatexForKatex((scriptEl.textContent || '').trim());
    const textNode = document.createTextNode(displayMode ? `$$\n${latex}\n$$` : `$${latex}$`);
    scriptEl.parentNode?.replaceChild(textNode, scriptEl);
  });

  return container.innerHTML;
}

function convertStoredMathNodesToDelimiters(html) {
  if (!html || typeof document === 'undefined') return html;
  const container = document.createElement('div');
  container.innerHTML = html;

  container.querySelectorAll('[data-type="inline-math"], [data-type="block-math"]').forEach((node) => {
    const rawLatex = decodeHtmlAttribute(node.getAttribute('data-latex') || '');
    const latex = normalizeLatexForKatex(rawLatex);
    const isBlock = node.getAttribute('data-type') === 'block-math';
    const replacement = document.createTextNode(isBlock ? `$$\n${latex}\n$$` : `$${latex}$`);
    node.parentNode?.replaceChild(replacement, node);
  });

  return container.innerHTML;
}

function normalizeBlockMathMarkup(container) {
  if (!container) return;
  const html = container.innerHTML;
  container.innerHTML = html.replace(/\$\$([\s\S]*?)\$\$/g, (fullMatch, inner) => {
    const cleaned = inner
      .replace(BLOCK_SPLIT_REGEX, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (!cleaned) return fullMatch;
    return `$$\n${normalizeLatexForKatex(cleaned)}\n$$`;
  });
}

function maskCurrencyTokens(container) {
  if (!container || typeof document === 'undefined') return () => {};
  const replacements = [];
  const showTextNode = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;
  const walker = document.createTreeWalker(container, showTextNode);

  let node = walker.nextNode();
  while (node) {
    const originalText = node.nodeValue || '';
    if (originalText.includes('$')) {
      node.nodeValue = originalText.replace(CURRENCY_PATTERN, (match) => {
        const token = `__QL_CUR_${replacements.length}__`;
        replacements.push({ token, value: match });
        return token;
      });
    }
    node = walker.nextNode();
  }

  return () => {
    if (!replacements.length) return;
    const restoreWalker = document.createTreeWalker(container, showTextNode);
    let textNode = restoreWalker.nextNode();
    while (textNode) {
      let value = textNode.nodeValue || '';
      replacements.forEach(({ token, value: original }) => {
        value = value.replaceAll(token, original);
      });
      textNode.nodeValue = value;
      textNode = restoreWalker.nextNode();
    }
  };
}

export function prepareRichTextInput(value, fallback = '') {
  const source = ((value && String(value)) || (fallback && String(fallback)) || '').trim();
  if (!source) return '';

  let normalized = convertLegacyMathScriptTags(source);
  normalized = convertStoredMathNodesToDelimiters(normalized);

  if (!isHtmlLike(normalized)) {
    return `<p>${escapeHtml(normalized)}</p>`;
  }

  return normalized;
}

export function normalizeStoredHtml(html) {
  const trimmed = String(html || '').trim();
  if (!trimmed) return '';
  if (trimmed === '<p></p>' || trimmed === '<p><br></p>') return '';

  const noEmptyParagraphs = trimmed.replace(EMPTY_PARAGRAPH_REGEX, '').trim();
  if (!noEmptyParagraphs) return '';
  return trimmed;
}

export function extractPlainTextFromHtml(html) {
  if (!html) return '';
  if (typeof document === 'undefined') {
    return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const container = document.createElement('div');
  container.innerHTML = convertStoredMathNodesToDelimiters(html);
  return (container.textContent || '').replace(/\s+/g, ' ').trim();
}

export function hasRichTextContent(html) {
  const normalized = normalizeStoredHtml(html);
  if (!normalized) return false;

  const plainText = extractPlainTextFromHtml(normalized);
  if (plainText.length > 0) return true;

  return /<img\b/i.test(normalized);
}

export function renderKatexInElement(container) {
  if (!container) return;

  normalizeBlockMathMarkup(container);
  const restoreCurrency = maskCurrencyTokens(container);
  const renderOptions = {
    throwOnError: false,
    strict: 'ignore',
    trust: true,
    preProcess: math => normalizeLatexForKatex(math),
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
      { left: '$', right: '$', display: false },
    ],
    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
  };

  try {
    renderMathInElement(container, renderOptions);
  } catch {
    // Fall back to smaller chunks if whole-container auto-render fails.
    const chunks = container.querySelectorAll('p, li, div, span');
    chunks.forEach((chunk) => {
      try {
        renderMathInElement(chunk, renderOptions);
      } catch {
        // Keep failing chunks unchanged.
      }
    });
  } finally {
    restoreCurrency();
  }
}
