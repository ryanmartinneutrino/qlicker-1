import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
//import de from './locales/de.json';
//import es from './locales/es.json';
import fr from './locales/fr.json';
//import it from './locales/it.json';
//import pir from './locales/pir.json';
//import ru from './locales/ru.json';
//import zh from './locales/zh.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
     // de: { translation: de },
     // es: { translation: es },
      fr: { translation: fr },
     // it: { translation: it },
     // pir: { translation: pir },
     // ru: { translation: ru },
     // zh: { translation: zh },
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
  //{ code: 'de', label: 'Deutsch' },
  //{ code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  //{ code: 'it', label: 'Italiano' },
  //{ code: 'pir', label: 'Pirate' },
  //{ code: 'ru', label: 'Русский' },
  //{ code: 'zh', label: '中文' },
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

export const TIME_FORMATS = [
  { key: '24h', example: '14:30' },
  { key: '12h', example: '2:30 PM' },
];

/**
 * Default date format key. DD-MMM-YYYY gives "11-Jan-2026".
 */
export const DEFAULT_DATE_FORMAT = 'DD-MMM-YYYY';

/**
 * Default locale.
 */
export const DEFAULT_LOCALE = 'en';
