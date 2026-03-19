import renderMathInElement from 'katex/contrib/auto-render';
import DOMPurify from 'dompurify';

const EMPTY_PARAGRAPH_REGEX = /<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi;
const BLOCK_SPLIT_REGEX = /<\/p>\s*<p>/gi;
const CURRENCY_PATTERN = /\$\d[\d,]*(?:\.\d{1,2})?(?:\s?(?:USD|CAD|EUR|GBP))?(?!\$)/gi;
const INTERACTIVE_SELECTOR = 'button, input, select, textarea, [role="button"], a[href], label';
const RICH_TEXT_ALLOWED_ATTRIBUTES = ['width', 'height', 'data-width', 'data-height'];
const URL_ATTRIBUTES = ['src', 'href', 'srcset', 'poster', 'data', 'xlink:href'];

function createInertContainer(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  return {
    root: template.content || template,
    toHtml: () => template.innerHTML,
  };
}

function isBlobUrl(value) {
  return /^blob:/i.test(String(value || '').trim());
}

function hasBlobUrlAttributeValue(attribute, value) {
  if (attribute === 'srcset') {
    return /(^|,)\s*blob:/i.test(String(value || '').trim());
  }
  return isBlobUrl(value);
}

function stripTransientBlobUrls(html) {
  if (!html || typeof document === 'undefined') return html ?? '';
  const { root, toHtml } = createInertContainer(html);

  root.querySelectorAll('*').forEach((node) => {
    let shouldRemoveNode = false;
    URL_ATTRIBUTES.forEach((attribute) => {
      if (shouldRemoveNode) return;
      const value = node.getAttribute(attribute);
      if (!hasBlobUrlAttributeValue(attribute, value)) return;
      if (node.tagName === 'IMG' && (attribute === 'src' || attribute === 'srcset')) {
        shouldRemoveNode = true;
        return;
      }
      node.removeAttribute(attribute);
    });
    if (shouldRemoveNode) {
      node.remove();
    }
  });

  return toHtml();
}

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
  const { root, toHtml } = createInertContainer(html);

  root.querySelectorAll('script[type^="math/tex"]').forEach((scriptEl) => {
    const type = (scriptEl.getAttribute('type') || '').toLowerCase();
    const displayMode = type.includes('mode=display');
    const latex = normalizeLatexForKatex((scriptEl.textContent || '').trim());
    const textNode = document.createTextNode(displayMode ? `$$\n${latex}\n$$` : `\\(${latex}\\)`);
    scriptEl.parentNode?.replaceChild(textNode, scriptEl);
  });

  return toHtml();
}

function convertStoredMathNodesToDelimiters(html) {
  if (!html || typeof document === 'undefined') return html;
  const { root, toHtml } = createInertContainer(html);

  root.querySelectorAll('[data-type="inline-math"], [data-type="block-math"]').forEach((node) => {
    const rawLatex = decodeHtmlAttribute(node.getAttribute('data-latex') || '');
    const latex = normalizeLatexForKatex(rawLatex);
    const isBlock = node.getAttribute('data-type') === 'block-math';
    const replacement = document.createTextNode(isBlock ? `$$\n${latex}\n$$` : `\\(${latex}\\)`);
    node.parentNode?.replaceChild(replacement, node);
  });

  return toHtml();
}

function normalizeBlockMathMarkup(container) {
  if (!container) return;
  const html = container.innerHTML;
  container.innerHTML = html.replace(/\$\$([\s\S]*?)\$\$/g, (fullMatch, inner) => {
    let cleaned = inner
      .replace(BLOCK_SPLIT_REGEX, '\n')
      .replace(/<br\s*\/?>/gi, '\n');

    // Strip HTML tags iteratively to prevent incomplete sanitization
    // (e.g. nested fragments like `<scr<b>ipt>` surviving a single pass).
    let previous;
    do {
      previous = cleaned;
      cleaned = cleaned.replace(/<[^>]+>/g, '');
    } while (cleaned !== previous);

    cleaned = cleaned.trim();
    if (!cleaned) return fullMatch;
    return `$$\n${normalizeLatexForKatex(cleaned)}\n$$`;
  });
}

function hasInteractiveNodes(container) {
  if (!container || typeof container.querySelector !== 'function') return false;
  if (typeof container.matches === 'function' && container.matches(INTERACTIVE_SELECTOR)) return true;
  return Boolean(container.querySelector(INTERACTIVE_SELECTOR));
}

function normalizeBlockMathMarkupSafely(container) {
  if (!container) return;

  // Avoid rewriting an interactive container's innerHTML, which would detach React handlers.
  if (!hasInteractiveNodes(container)) {
    normalizeBlockMathMarkup(container);
    return;
  }

  container.querySelectorAll('p, li, div, span').forEach((node) => {
    if (hasInteractiveNodes(node)) return;
    normalizeBlockMathMarkup(node);
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

  let normalized = stripTransientBlobUrls(source);
  normalized = convertLegacyMathScriptTags(normalized);
  normalized = convertStoredMathNodesToDelimiters(normalized);

  if (!isHtmlLike(normalized)) {
    return `<p>${escapeHtml(normalized)}</p>`;
  }

  return sanitizeRichHtml(normalized);
}

export function sanitizeRichHtml(html) {
  const source = String(html || '').trim();
  if (!source) return '';
  if (typeof window === 'undefined') return source;

  return DOMPurify.sanitize(stripTransientBlobUrls(source), {
    USE_PROFILES: { html: true },
    ADD_ATTR: RICH_TEXT_ALLOWED_ATTRIBUTES,
  });
}

export function normalizeStoredHtml(html) {
  const trimmed = String(html || '').trim();
  if (!trimmed) return '';
  const sanitized = sanitizeRichHtml(trimmed).trim();
  if (!sanitized || sanitized === '<p></p>' || sanitized === '<p><br></p>') return '';

  const noEmptyParagraphs = sanitized.replace(EMPTY_PARAGRAPH_REGEX, '').trim();
  if (!noEmptyParagraphs) return '';
  return sanitized;
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

  normalizeBlockMathMarkupSafely(container);
  const restoreCurrency = maskCurrencyTokens(container);
  const renderOptions = {
    throwOnError: false,
    strict: 'ignore',
    trust: true,
    output: 'html',
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
