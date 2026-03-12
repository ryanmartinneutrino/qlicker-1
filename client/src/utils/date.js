import i18n from '../i18n';
import { DEFAULT_DATE_FORMAT } from '../i18n';

const MONTH_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_SHORT_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function getMonthShort(lang) {
  return lang?.startsWith('fr') ? MONTH_SHORT_FR : MONTH_SHORT_EN;
}

/**
 * Return the active date-format key.
 * Checks localStorage first (set via admin panel), falls back to DEFAULT_DATE_FORMAT.
 */
export function getDateFormat() {
  try {
    return localStorage.getItem('qlicker_dateFormat') || DEFAULT_DATE_FORMAT;
  } catch {
    return DEFAULT_DATE_FORMAT;
  }
}

/**
 * Format a date value using the active locale and date-format preference.
 *
 * Supported format keys:
 *   DD-MMM-YYYY  → 11-Jan-2026 (default)
 *   MMM-DD-YYYY  → Jan-11-2026
 *   YYYY-MM-DD   → 2026-01-11
 *
 * The clock always uses 24-hour format (HH:mm) when a time is displayed.
 */
export function formatDisplayDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const lang = i18n.language || 'en';
  const months = getMonthShort(lang);
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const fmt = getDateFormat();

  switch (fmt) {
    case 'MMM-DD-YYYY':
      return `${month}-${day}-${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${day}`;
    case 'DD-MMM-YYYY':
    default:
      return `${day}-${month}-${year}`;
  }
}

/**
 * Format a date-time value including the 24-hour clock.
 * Example: "11-Jan-2026 14:30"
 */
export function formatDisplayDateTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const datePart = formatDisplayDate(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${datePart} ${hours}:${minutes}`;
}

