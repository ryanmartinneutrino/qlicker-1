import { describe, expect, it } from 'vitest';
import { normalizeStoredHtml, prepareRichTextInput } from './richTextUtils';

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
    const html = [
      '<p>Prompt</p>',
      '<p><img src="blob:https://qlicker.queensu.ca/a4504e7d-e942-4fca-a441-d2a9ccb2c176" width="240" data-width="240"></p>',
      '<p><a href="blob:https://qlicker.queensu.ca/a4504e7d-e942-4fca-a441-d2a9ccb2c176">download</a></p>',
    ].join('');

    const prepared = prepareRichTextInput(html);
    const normalized = normalizeStoredHtml(html);

    expect(prepared).toContain('<p>Prompt</p>');
    expect(prepared).not.toContain('blob:https://qlicker.queensu.ca/');
    expect(prepared).not.toContain('<img');
    expect(prepared).toContain('<a>download</a>');

    expect(normalized).toContain('<p>Prompt</p>');
    expect(normalized).not.toContain('blob:https://qlicker.queensu.ca/');
    expect(normalized).not.toContain('<img');
    expect(normalized).toContain('<a>download</a>');
  });
});
