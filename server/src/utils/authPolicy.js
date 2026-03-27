export const DEFAULT_TOKEN_EXPIRY_MINUTES = 120;
export const DEFAULT_MAX_IMAGE_WIDTH = 1920;
export const DEFAULT_AVATAR_THUMBNAIL_SIZE = 512;
export const DEFAULT_SSO_ROUTE_MODE = 'legacy';
export const DEFAULT_SSO_CLOCK_SKEW_MS = 60 * 1000;
export const DEFAULT_BACKUP_TIME_LOCAL = '02:00';
export const DEFAULT_BACKUP_RETENTION_DAILY = 7;
export const DEFAULT_BACKUP_RETENTION_WEEKLY = 4;
export const DEFAULT_BACKUP_RETENTION_MONTHLY = 12;

export const SSO_PROVIDER_ROUTES = {
  legacy: {
    callbackPath: '/SSO/SAML2',
    logoutCallbackPath: '/SSO/SAML2/logout',
  },
  api_v1: {
    callbackPath: '/api/v1/auth/sso/callback',
    logoutCallbackPath: '/api/v1/auth/sso/logout',
  },
};

function normalizeInteger(value, fallback, { min = Number.NEGATIVE_INFINITY } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < min) return fallback;
  return normalized;
}

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return fallback;
}

export function isAdminUser(user = {}) {
  const roles = user?.profile?.roles || [];
  return Array.isArray(roles) && roles.includes('admin');
}

export function isSsoEnabled(settings = {}) {
  return settings?.SSO_enabled === true;
}

export function canUseEmailLogin(user = {}, settings = {}) {
  if (isAdminUser(user)) return true;
  if (!isSsoEnabled(settings)) return true;
  return user?.allowEmailLogin === true;
}

export function shouldLockLocalProfileEdits(user = {}, settings = {}) {
  return isSsoEnabled(settings) && !canUseEmailLogin(user, settings);
}

export function normalizeTokenExpiryMinutes(value) {
  return normalizeInteger(value, DEFAULT_TOKEN_EXPIRY_MINUTES, { min: 1 });
}

export function normalizeMaxImageWidth(value) {
  return normalizeInteger(value, DEFAULT_MAX_IMAGE_WIDTH, { min: 1 });
}

export function normalizeAvatarThumbnailSize(value) {
  return normalizeInteger(value, DEFAULT_AVATAR_THUMBNAIL_SIZE, { min: 64 });
}

export function normalizeBackupTimeLocal(value) {
  const normalized = String(value || '').trim();
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    return normalized;
  }
  return DEFAULT_BACKUP_TIME_LOCAL;
}

export function normalizeBackupRetentionCount(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return normalizeInteger(value, fallback, { min: 0 });
}

export function normalizeSsoRouteMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'legacy' || normalized === 'api_v1') {
    return normalized;
  }
  return DEFAULT_SSO_ROUTE_MODE;
}

export function normalizeSsoClockSkewMs(value) {
  return normalizeInteger(value, DEFAULT_SSO_CLOCK_SKEW_MS, { min: -1 });
}

export function parseAuthnContext(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getSamlAdvancedSettings(settings = {}) {
  return {
    wantAssertionsSigned: normalizeBoolean(settings?.SSO_wantAssertionsSigned, false),
    wantAuthnResponseSigned: normalizeBoolean(settings?.SSO_wantAuthnResponseSigned, false),
    acceptedClockSkewMs: normalizeSsoClockSkewMs(settings?.SSO_acceptedClockSkewMs),
    disableRequestedAuthnContext: normalizeBoolean(settings?.SSO_disableRequestedAuthnContext, true),
    authnContext: parseAuthnContext(settings?.SSO_authnContext),
    routeMode: normalizeSsoRouteMode(settings?.SSO_routeMode),
  };
}

export function getSsoProviderRoutes(settings = {}) {
  const routeMode = normalizeSsoRouteMode(settings?.SSO_routeMode);
  return SSO_PROVIDER_ROUTES[routeMode] || SSO_PROVIDER_ROUTES[DEFAULT_SSO_ROUTE_MODE];
}

export function normalizeSettingsPayload(settings = {}) {
  return {
    ...settings,
    tokenExpiryMinutes: normalizeTokenExpiryMinutes(settings?.tokenExpiryMinutes),
    maxImageWidth: normalizeMaxImageWidth(settings?.maxImageWidth),
    avatarThumbnailSize: normalizeAvatarThumbnailSize(settings?.avatarThumbnailSize),
    backupEnabled: settings?.backupEnabled === true,
    backupTimeLocal: normalizeBackupTimeLocal(settings?.backupTimeLocal),
    backupRetentionDaily: normalizeBackupRetentionCount(
      settings?.backupRetentionDaily,
      DEFAULT_BACKUP_RETENTION_DAILY
    ),
    backupRetentionWeekly: normalizeBackupRetentionCount(
      settings?.backupRetentionWeekly,
      DEFAULT_BACKUP_RETENTION_WEEKLY
    ),
    backupRetentionMonthly: normalizeBackupRetentionCount(
      settings?.backupRetentionMonthly,
      DEFAULT_BACKUP_RETENTION_MONTHLY
    ),
    SSO_routeMode: normalizeSsoRouteMode(settings?.SSO_routeMode),
    SSO_wantAssertionsSigned: normalizeBoolean(settings?.SSO_wantAssertionsSigned, false),
    SSO_wantAuthnResponseSigned: normalizeBoolean(settings?.SSO_wantAuthnResponseSigned, false),
    SSO_acceptedClockSkewMs: normalizeSsoClockSkewMs(settings?.SSO_acceptedClockSkewMs),
    SSO_disableRequestedAuthnContext: normalizeBoolean(settings?.SSO_disableRequestedAuthnContext, true),
    SSO_authnContext: String(settings?.SSO_authnContext || '').trim(),
  };
}
