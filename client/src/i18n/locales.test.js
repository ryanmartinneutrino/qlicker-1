import { describe, expect, it } from 'vitest';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import pir from './locales/pir.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';

const LOCALES = {
  de,
  en,
  es,
  fr,
  it,
  pir,
  ru,
  zh,
};

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
  it('keeps translation structures aligned across all supported locales', () => {
    const sections = [
      'questionLibrary',
      'questions.types',
    ];

    sections.forEach((section) => {
      expect(getNestedValue(en, section)).toBeTruthy();

      Object.entries(LOCALES).forEach(([localeCode, localeMessages]) => {
        expect(getNestedValue(localeMessages, section), `Missing ${section} in ${localeCode}`).toBeTruthy();
        expect(flattenKeys(getNestedValue(localeMessages, section))).toEqual(flattenKeys(getNestedValue(en, section)));
      });
    });

    expect(getNestedValue(en, 'questionLibrary.filters.sessionsButton')).toBe('Sessions');
    expect(getNestedValue(en, 'questionLibrary.filters.sessionsDialogTitle')).toBe('Filter by sessions');
  });
});
