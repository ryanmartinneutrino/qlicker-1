import { describe, expect, it } from 'vitest';
import { normalizeStoredHtml, prepareRichTextInput, renderKatexInElement } from './richTextUtils';

describe('richTextUtils image attribute preservation', () => {
  it('preserves resized image width attributes through sanitization', () => {
    const html = '<p><img src="https://example.com/image.png" width="240" data-width="240"></p>';

    const prepared = prepareRichTextInput(html);
    const normalized = normalizeStoredHtml(html);

    expect(prepared).toContain('width="240"');
    expect(prepared).toContain('data-width="240"');
    expect(normalized).toContain('width="240"');
    expect(normalized).toContain('data-width="240"');
  });

  it('removes persisted blob image URLs that cannot be reloaded safely', () => {
    const staleBlobUrl = 'blob:https://stale-origin.invalid/a4504e7d-e942-4fca-a441-d2a9ccb2c176';
    const html = [
      '<p>Prompt</p>',
      `<p><img src="${staleBlobUrl}" width="240" data-width="240"></p>`,
      '<p><img src="https://example.com/keep.png" width="160" data-width="160"></p>',
      `<p><a href="${staleBlobUrl}">download</a></p>`,
      `<p><video src="${staleBlobUrl}" controls></video></p>`,
    ].join('');

    const prepared = prepareRichTextInput(html);
    const normalized = normalizeStoredHtml(html);

    expect(prepared).toContain('<p>Prompt</p>');
    expect(prepared).not.toContain('blob:');
    expect(prepared).toContain('src="https://example.com/keep.png"');
    expect(prepared).toContain('width="160"');
    expect(prepared).toContain('data-width="160"');
    expect(prepared).toContain('<a>download</a>');
    expect(prepared).not.toContain('<video src=');

    expect(normalized).toContain('<p>Prompt</p>');
    expect(normalized).not.toContain('blob:');
    expect(normalized).toContain('src="https://example.com/keep.png"');
    expect(normalized).toContain('width="160"');
    expect(normalized).toContain('data-width="160"');
    expect(normalized).toContain('<a>download</a>');
    expect(normalized).not.toContain('<video src=');
  });
});

describe('richTextUtils KaTeX rendering', () => {
  it('uses fallback when value is empty-but-truthy HTML', () => {
    const emptyHtml = '<p><br></p>';
    const mathFallback = '\\(x^2\\)';

    // normalizeStoredHtml correctly identifies empty HTML
    expect(normalizeStoredHtml(emptyHtml)).toBe('');

    // When normalized HTML is used as value with math fallback, KaTeX can render
    const prepared = prepareRichTextInput(normalizeStoredHtml(emptyHtml), mathFallback);
    expect(prepared).toContain('x^2');

    const container = document.createElement('div');
    container.innerHTML = prepared;
    renderKatexInElement(container);
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('renders inline math delimiters from plain text fallback', () => {
    const prepared = prepareRichTextInput('', '$x^2 + y^2$');
    const container = document.createElement('div');
    container.innerHTML = prepared;
    renderKatexInElement(container);
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('renders math in HTML content directly', () => {
    const prepared = prepareRichTextInput('<p>Calculate $\\frac{1}{2}$</p>');
    const container = document.createElement('div');
    container.innerHTML = prepared;
    renderKatexInElement(container);
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('converts stored math nodes to delimiters and renders', () => {
    const html = '<p>Answer: <span data-type="inline-math" data-latex="x^2"></span></p>';
    const prepared = prepareRichTextInput(html);
    expect(prepared).toContain('x^2');

    const container = document.createElement('div');
    container.innerHTML = prepared;
    renderKatexInElement(container);
    expect(container.querySelector('.katex')).not.toBeNull();
  });
});
