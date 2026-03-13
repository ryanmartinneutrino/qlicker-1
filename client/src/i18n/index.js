import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import fr from './locales/fr.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    fallbackLng: 'en',
    showSupportNotice: false,
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'qlicker_locale',
      caches: ['localStorage'],
    },
  });

export default i18n;

/**
 * Supported locales with human-readable labels.
 * Used by the admin panel locale selector and anywhere locale choices are presented.
 */
export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

/**
 * Available date-format presets.
 * The `key` is stored in Settings; the `example` shows a sample rendering.
 */
export const DATE_FORMATS = [
  { key: 'DD-MMM-YYYY', example: '11-Jan-2026' },
  { key: 'MMM-DD-YYYY', example: 'Jan-11-2026' },
  { key: 'YYYY-MM-DD', example: '2026-01-11' },
];

/**
 * Default date format key. DD-MMM-YYYY gives "11-Jan-2026".
 */
export const DEFAULT_DATE_FORMAT = 'DD-MMM-YYYY';

/**
 * Default locale.
 */
export const DEFAULT_LOCALE = 'en';
