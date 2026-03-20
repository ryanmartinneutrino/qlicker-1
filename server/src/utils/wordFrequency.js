/**
 * Compute word frequencies from an array of text responses.
 *
 * @param {string[]} texts - raw text strings (HTML is stripped internally)
 * @param {string[]} [stopWords=[]] - words to exclude (case-insensitive)
 * @param {number} [maxWords=100] - maximum number of words to return
 * @returns {{ text: string, count: number }[]} sorted descending by count
 */
export function computeWordFrequencies(texts, stopWords = [], maxWords = 100) {
  const stopSet = new Set((stopWords || []).map((w) => w.toLowerCase().trim()).filter(Boolean));
  const freq = new Map();

  for (const raw of texts) {
    if (!raw || typeof raw !== 'string') continue;

    // Strip HTML tags and decode common HTML entities.
    const plain = raw
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ');

    // Tokenize: split on non-letter/non-digit boundaries.
    // Supports accented characters and unicode letters via \p{L}.
    const tokens = plain.match(/[\p{L}\p{N}]+/gu) || [];

    for (const token of tokens) {
      const word = token.toLowerCase();
      if (word.length < 2) continue; // ignore single-char tokens
      if (stopSet.has(word)) continue;
      freq.set(word, (freq.get(word) || 0) + 1);
    }
  }

  // Sort descending by count, then alphabetically for stability.
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxWords)
    .map(([text, count]) => ({ text, count }));
}
