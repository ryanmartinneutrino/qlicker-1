import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import fr from './locales/fr.json';

function getNestedValue(obj, path) {
  return path.split('.').reduce((value, segment) => value?.[segment], obj);
}

function flattenKeys(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, nested]) => (
    flattenKeys(nested, prefix ? `${prefix}.${key}` : key)
  ));
}

describe('locale files', () => {
  it('keeps question-library and question-type translation structures aligned', () => {
    const sections = [
      'questionLibrary',
      'questions.types',
    ];

    sections.forEach((section) => {
      expect(getNestedValue(en, section)).toBeTruthy();
      expect(getNestedValue(fr, section)).toBeTruthy();
      expect(flattenKeys(getNestedValue(en, section))).toEqual(flattenKeys(getNestedValue(fr, section)));
    });

    expect(getNestedValue(en, 'questionLibrary.filters.sessionsButton')).toBe('Sessions');
    expect(getNestedValue(en, 'questionLibrary.filters.sessionsDialogTitle')).toBe('Filter by sessions');
  });
});
