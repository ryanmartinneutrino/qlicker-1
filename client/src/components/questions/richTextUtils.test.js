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
});
