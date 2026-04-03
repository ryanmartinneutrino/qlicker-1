import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, TextField, Button, Checkbox,
  FormControlLabel, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, TablePagination, Select, MenuItem,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  InputAdornment, Alert, Snackbar, FormControl, InputLabel,
  ButtonBase, CircularProgress, Tooltip, Chip, TableSortLabel,
  Avatar,
} from '@mui/material';
import {
  Add as AddIcon,
  Block as BlockIcon,
  Cancel,
  CheckCircle,
  Delete as DeleteIcon,
  InfoOutlined as InfoOutlinedIcon,
  Notifications as NotificationsIcon,
  Restore as RestoreIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import apiClient from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { formatDisplayDateTime } from '../../utils/date';
import { buildCourseTitle } from '../../utils/courseTitle';
import { fetchAllCourses } from '../../utils/fetchAllCourses';
import {
  approximate16x9JpegSizeBytes,
  approximateSquareJpegSizeBytes,
  formatApproximateFileSize,
} from '../../utils/imageUpload';
import AutoSaveStatus from '../../components/common/AutoSaveStatus';
import ResponsiveTabsNavigation from '../../components/common/ResponsiveTabsNavigation';
import SessionListCard from '../../components/common/SessionListCard';
import ManageNotificationsDialog from '../../components/notifications/ManageNotificationsDialog';
import { SUPPORTED_LOCALES, DATE_FORMATS, TIME_FORMATS } from '../../i18n';
import i18n from '../../i18n';
import {
  clearPublicSettingsCache,
  getDefaultAvatarThumbnailSize,
  getDefaultMaxImageWidth,
} from '../../utils/publicSettings';

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null;
}

function FieldLabel({ label, tooltip }) {
  if (!tooltip) return label;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <span>{label}</span>
      <Tooltip title={tooltip}>
        <InfoOutlinedIcon sx={{ fontSize: '0.95rem', color: 'text.secondary' }} />
      </Tooltip>
    </Box>
  );
}

function parseTimeLocal(value, fallback = '02:00') {
  const normalized = String(value || fallback).trim();
  const match = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!match) return parseTimeLocal(fallback, '02:00');

  const hours24 = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours24) || hours24 < 0 || hours24 > 23) {
    return parseTimeLocal(fallback, '02:00');
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return parseTimeLocal(fallback, '02:00');
  }

  return { hours24, minutes };
}

function convert24HourTo12Hour(hours24) {
  if (hours24 === 0) return { hour12: 12, period: 'am' };
  if (hours24 === 12) return { hour12: 12, period: 'pm' };
  if (hours24 > 12) return { hour12: hours24 - 12, period: 'pm' };
  return { hour12: hours24, period: 'am' };
}

function convert12HourTo24Hour(hour12Value, periodValue) {
  const hour12 = Number(hour12Value);
  if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12) {
    return 0;
  }
  if (periodValue === 'pm') {
    return hour12 === 12 ? 12 : hour12 + 12;
  }
  return hour12 === 12 ? 0 : hour12;
}

function buildTimeLocalValue(hours24, minutes) {
  const safeHours = Math.max(0, Math.min(23, Number(hours24) || 0));
  const safeMinutes = Math.max(0, Math.min(59, Number(minutes) || 0));
  return `${String(safeHours).padStart(2, '0')}:${String(safeMinutes).padStart(2, '0')}`;
}

function BackupTimeField({
  helperText,
  label,
  onChange,
  use24Hour,
  value,
}) {
  const { t } = useTranslation();
  const { hours24, minutes } = parseTimeLocal(value);
  const { hour12, period } = convert24HourTo12Hour(hours24);

  return (
    <Box data-testid="backup-time-field">
      <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {use24Hour ? (
          <TextField
            select
            size="small"
            label={t('common.hour')}
            value={String(hours24).padStart(2, '0')}
            onChange={(event) => onChange(buildTimeLocalValue(event.target.value, minutes))}
            sx={{ width: 110 }}
          >
            {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')).map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <>
            <TextField
              select
              size="small"
              label={t('common.hour')}
              value={String(hour12)}
              onChange={(event) => onChange(buildTimeLocalValue(
                convert12HourTo24Hour(event.target.value, period),
                minutes,
              ))}
              sx={{ width: 110 }}
            >
              {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label={t('common.period')}
              value={period}
              onChange={(event) => onChange(buildTimeLocalValue(
                convert12HourTo24Hour(hour12, event.target.value),
                minutes,
              ))}
              sx={{ width: 120 }}
            >
              <MenuItem value="am">{t('common.am')}</MenuItem>
              <MenuItem value="pm">{t('common.pm')}</MenuItem>
            </TextField>
          </>
        )}
        <TextField
          select
          size="small"
          label={t('common.minute')}
          value={String(minutes).padStart(2, '0')}
          onChange={(event) => onChange(buildTimeLocalValue(hours24, event.target.value))}
          sx={{ width: 120 }}
        >
          {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        {helperText}
      </Typography>
    </Box>
  );
}

const AUTO_SAVE_DELAY_MS = 500;
const VALID_STORAGE_TYPES = new Set(['local', 's3', 'azure']);
const DEFAULT_SSO_SETTINGS = {
  SSO_enabled: false,
  SSO_entrypoint: '',
  SSO_logoutUrl: '',
  SSO_EntityId: '',
  SSO_identifierFormat: '',
  SSO_institutionName: '',
  SSO_emailIdentifier: '',
  SSO_firstNameIdentifier: '',
  SSO_lastNameIdentifier: '',
  SSO_roleIdentifier: '',
  SSO_roleProfName: '',
  SSO_studentNumberIdentifier: '',
  SSO_cert: '',
  SSO_privCert: '',
  SSO_privKey: '',
  SSO_wantAssertionsSigned: false,
  SSO_wantAuthnResponseSigned: false,
  SSO_acceptedClockSkewMs: 60000,
  SSO_disableRequestedAuthnContext: true,
  SSO_authnContext: '',
  SSO_routeMode: 'legacy',
};
const SSO_SETTINGS_KEYS = Object.keys(DEFAULT_SSO_SETTINGS);
const DEFAULT_BACKUP_SETTINGS = {
  backupEnabled: false,
  backupTimeLocal: '02:00',
  backupRetentionDaily: 7,
  backupRetentionWeekly: 4,
  backupRetentionMonthly: 12,
  backupLastRunAt: null,
  backupLastRunType: '',
  backupLastRunStatus: 'idle',
  backupLastRunFilename: '',
  backupLastRunMessage: '',
  backupManagerLastSeenAt: null,
  backupManagerStatus: 'unknown',
  backupManagerMessage: '',
  backupManagerHostPath: './backups',
  backupManagerCheckIntervalSeconds: 60,
  backupManagerIsStale: false,
};

function buildBackupSettingsState(data = {}) {
  return {
    ...DEFAULT_BACKUP_SETTINGS,
    backupEnabled: data.backupEnabled ?? false,
    backupTimeLocal: data.backupTimeLocal ?? '02:00',
    backupRetentionDaily: data.backupRetentionDaily ?? 7,
    backupRetentionWeekly: data.backupRetentionWeekly ?? 4,
    backupRetentionMonthly: data.backupRetentionMonthly ?? 12,
    backupLastRunAt: data.backupLastRunAt ?? null,
    backupLastRunType: data.backupLastRunType ?? '',
    backupLastRunStatus: data.backupLastRunStatus ?? 'idle',
    backupLastRunFilename: data.backupLastRunFilename ?? '',
    backupLastRunMessage: data.backupLastRunMessage ?? '',
    backupManagerLastSeenAt: data.backupManagerLastSeenAt ?? null,
    backupManagerStatus: data.backupManagerStatus ?? 'unknown',
    backupManagerMessage: data.backupManagerMessage ?? '',
    backupManagerHostPath: data.backupManagerHostPath ?? './backups',
    backupManagerCheckIntervalSeconds: data.backupManagerCheckIntervalSeconds ?? 60,
    backupManagerIsStale: data.backupManagerIsStale ?? false,
  };
}

function buildSsoSettingsState(data = {}) {
  const nextState = { ...DEFAULT_SSO_SETTINGS };
  SSO_SETTINGS_KEYS.forEach((key) => {
    if (data[key] !== undefined && data[key] !== null) {
      nextState[key] = data[key];
    }
  });
  return nextState;
}

function buildSsoSettingsPatchPayload(settings = {}) {
  const payload = {};
  SSO_SETTINGS_KEYS.forEach((key) => {
    payload[key] = settings[key];
  });
  return payload;
}

const SSO_BASIC_FIELDS = [
  { key: 'SSO_enabled', labelKey: 'admin.sso.enable', type: 'checkbox' },
  { key: 'SSO_entrypoint', labelKey: 'admin.sso.entrypoint' },
  { key: 'SSO_logoutUrl', labelKey: 'admin.sso.logoutUrl' },
  { key: 'SSO_EntityId', labelKey: 'admin.sso.entityId' },
  { key: 'SSO_identifierFormat', labelKey: 'admin.sso.identifierFormat' },
  { key: 'SSO_institutionName', labelKey: 'admin.sso.institutionName' },
  { key: 'SSO_emailIdentifier', labelKey: 'admin.sso.emailIdentifier' },
  { key: 'SSO_firstNameIdentifier', labelKey: 'admin.sso.firstNameIdentifier' },
  { key: 'SSO_lastNameIdentifier', labelKey: 'admin.sso.lastNameIdentifier' },
  { key: 'SSO_roleIdentifier', labelKey: 'admin.sso.roleIdentifier' },
  { key: 'SSO_roleProfName', labelKey: 'admin.sso.roleProfName' },
  { key: 'SSO_studentNumberIdentifier', labelKey: 'admin.sso.studentNumberIdentifier' },
  { key: 'SSO_cert', labelKey: 'admin.sso.cert', type: 'textarea' },
  { key: 'SSO_privCert', labelKey: 'admin.sso.privCert', type: 'textarea' },
  { key: 'SSO_privKey', labelKey: 'admin.sso.privKey', type: 'textarea' },
];
const BACKUP_STATUS_COLORS = {
  idle: 'default',
  running: 'info',
  success: 'success',
  failed: 'error',
};
const BACKUP_MANAGER_STATUS_COLORS = {
  unknown: 'default',
  healthy: 'success',
  warning: 'warning',
  error: 'error',
  stale: 'warning',
};
const SSO_ADVANCED_FIELDS = [
  {
    key: 'SSO_routeMode',
    labelKey: 'admin.sso.routeMode',
    helpKey: 'admin.sso.routeModeHelp',
    type: 'select',
    options: [
      { value: 'legacy', labelKey: 'admin.sso.routeModeLegacy' },
      { value: 'api_v1', labelKey: 'admin.sso.routeModeApiV1' },
    ],
  },
  {
    key: 'SSO_wantAssertionsSigned',
    labelKey: 'admin.sso.wantAssertionsSigned',
    helpKey: 'admin.sso.wantAssertionsSignedHelp',
    type: 'checkbox',
  },
  {
    key: 'SSO_wantAuthnResponseSigned',
    labelKey: 'admin.sso.wantAuthnResponseSigned',
    helpKey: 'admin.sso.wantAuthnResponseSignedHelp',
    type: 'checkbox',
  },
  {
    key: 'SSO_acceptedClockSkewMs',
    labelKey: 'admin.sso.acceptedClockSkewMs',
    helpKey: 'admin.sso.acceptedClockSkewMsHelp',
    type: 'number',
  },
  {
    key: 'SSO_disableRequestedAuthnContext',
    labelKey: 'admin.sso.disableRequestedAuthnContext',
    helpKey: 'admin.sso.disableRequestedAuthnContextHelp',
    type: 'checkbox',
  },
  {
    key: 'SSO_authnContext',
    labelKey: 'admin.sso.authnContext',
    helpKey: 'admin.sso.authnContextHelp',
    type: 'textarea',
  },
];

function normalizeCourseField(value) {
  return String(value || '').trim();
}

function buildCourseOptionLabel(course = {}) {
  const code = [course.deptCode, course.courseNumber].map(normalizeCourseField).filter(Boolean).join(' ');
  const section = normalizeCourseField(course.section);
  const name = normalizeCourseField(course.name);
  const semester = normalizeCourseField(course.semester);
  return [code, section, name, semester].filter(Boolean).join(' - ') || normalizeCourseField(course._id);
}

function buildCourseSearchIndex(course = {}) {
  return [
    buildCourseTitle(course, 'long'),
    buildCourseOptionLabel(course),
    normalizeCourseField(course.deptCode),
    normalizeCourseField(course.courseNumber),
    normalizeCourseField(course.section),
    normalizeCourseField(course.name),
    normalizeCourseField(course.semester),
  ].join(' ').toLowerCase();
}

function sortCoursesByRecent(courses = []) {
  return [...courses].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

function sortCoursesByTitle(courses = []) {
  return [...courses].sort((a, b) => {
    const titleCompare = buildCourseTitle(a, 'long').localeCompare(buildCourseTitle(b, 'long'));
    if (titleCompare !== 0) return titleCompare;
    return buildCourseOptionLabel(a).localeCompare(buildCourseOptionLabel(b));
  });
}

function renderCourseListItem(course = {}, inactiveLabel = 'Inactive') {
  return (
    <Paper
      key={course._id}
      variant="outlined"
      sx={{ p: 1.25, display: 'flex', flexDirection: 'column', gap: 0.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {buildCourseTitle(course, 'long')}
        </Typography>
        {course.inactive ? <Chip size="small" label={inactiveLabel} variant="outlined" /> : null}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {buildCourseOptionLabel(course)}
      </Typography>
    </Paper>
  );
}

// ── Settings Tab ────────────────────────────────────────────────────────────
function SettingsTab() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState({
    restrictDomain: false,
    allowedDomains: '',
    requireVerified: false,
    registrationDisabled: false,
    adminEmail: '',
    tokenExpiryMinutes: 120,
    locale: 'en',
    dateFormat: 'DD-MMM-YYYY',
    timeFormat: '24h',
  });
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [emailDeliveryStatus, setEmailDeliveryStatus] = useState({
    configured: true,
    code: 'configured',
    message: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const hasLoadedRef = useRef(false);
  const parsedAllowedDomains = useMemo(() => (
    settings.allowedDomains
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  ), [settings.allowedDomains]);
  const hasAllowedDomains = parsedAllowedDomains.length > 0;
  const effectiveRequireVerified = settings.requireVerified || hasAllowedDomains;
  const effectiveRestrictDomain = !ssoEnabled && (settings.restrictDomain || hasAllowedDomains);

  useEffect(() => {
    let mounted = true;
    apiClient.get('/settings').then(({ data }) => {
      if (!mounted) return;
      setSsoEnabled(data.SSO_enabled ?? false);
      setEmailDeliveryStatus(data.emailDeliveryStatus ?? {
        configured: true,
        code: 'configured',
        message: '',
      });
      const loadedLocale = data.locale ?? 'en';
      const loadedDateFormat = data.dateFormat ?? 'DD-MMM-YYYY';
      const loadedTimeFormat = data.timeFormat ?? '24h';
      setSettings({
        restrictDomain: data.restrictDomain ?? false,
        allowedDomains: Array.isArray(data.allowedDomains)
          ? data.allowedDomains.join(', ')
          : data.allowedDomains ?? '',
        requireVerified: data.requireVerified ?? false,
        registrationDisabled: data.registrationDisabled ?? false,
        adminEmail: data.resolvedAdminEmail ?? data.adminEmail ?? data.email ?? '',
        tokenExpiryMinutes: data.tokenExpiryMinutes ?? 120,
        locale: loadedLocale,
        dateFormat: loadedDateFormat,
        timeFormat: loadedTimeFormat,
      });
      i18n.changeLanguage(loadedLocale);
      localStorage.setItem('qlicker_locale', loadedLocale);
      localStorage.setItem('qlicker_dateFormat', loadedDateFormat);
      localStorage.setItem('qlicker_timeFormat', loadedTimeFormat);
    }).catch(() => {
      if (mounted) {
        setSaveStatus('error');
        setSaveError(t('admin.failedLoadSettings'));
      }
    }).finally(() => {
      if (mounted) {
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }

    const timer = setTimeout(async () => {
      setSaving(true);
      setSaveStatus('saving');
      setSaveError('');
      try {
        const allowedDomains = parsedAllowedDomains;
        const payload = {
          ...settings,
          allowedDomains,
          restrictDomain: !ssoEnabled && (settings.restrictDomain || allowedDomains.length > 0),
          requireVerified: settings.requireVerified || (!ssoEnabled && allowedDomains.length > 0),
          tokenExpiryMinutes: Math.max(5, parseInt(settings.tokenExpiryMinutes, 10) || 120),
          locale: settings.locale,
          dateFormat: settings.dateFormat,
          timeFormat: settings.timeFormat,
        };
        const { data } = await apiClient.patch('/settings', payload);
        setEmailDeliveryStatus(data.emailDeliveryStatus ?? {
          configured: true,
          code: 'configured',
          message: '',
        });
        clearPublicSettingsCache();
        setSaveStatus('success');
      } catch (err) {
        setSaveStatus('error');
        const message = err.response?.data?.message || t('admin.failedSaveSettings');
        setSaveError(`${message} ${t('profile.lastChangeNotRecorded')}`);
      } finally {
        setSaving(false);
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [settings, loading, parsedAllowedDomains, ssoEnabled]);

  if (loading) return <CircularProgress />;

  return (
    <Box sx={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <AutoSaveStatus status={saving ? 'saving' : saveStatus} errorText={saveError} />
      {ssoEnabled ? (
        <Alert severity="info">
          {t('admin.settings.allowedDomainsSsoIgnored')}
        </Alert>
      ) : null}
      {hasAllowedDomains ? (
        <Alert severity="info">
          {t('admin.settings.allowedDomainsRequireVerified')}
        </Alert>
      ) : null}
      {effectiveRequireVerified && emailDeliveryStatus.message ? (
        <Alert severity={emailDeliveryStatus.configured ? 'info' : 'warning'}>
          {emailDeliveryStatus.message}
        </Alert>
      ) : null}
      <FormControlLabel
        control={(
          <Checkbox
            checked={effectiveRestrictDomain}
            disabled={ssoEnabled || hasAllowedDomains}
            onChange={(e) => setSettings((s) => ({ ...s, restrictDomain: e.target.checked }))}
          />
        )}
        label={t('admin.settings.restrictDomain')}
      />
      <TextField
        label={t('admin.settings.allowedDomains')}
        value={settings.allowedDomains}
        onChange={(e) => setSettings((s) => ({ ...s, allowedDomains: e.target.value }))}
        helperText={t('admin.settings.allowedDomainsHelp')}
        fullWidth
      />
      <FormControlLabel
        control={(
          <Checkbox
            checked={effectiveRequireVerified}
            disabled={hasAllowedDomains}
            onChange={(e) => setSettings((s) => ({ ...s, requireVerified: e.target.checked }))}
          />
        )}
        label={t('admin.settings.requireVerified')}
      />
      <FormControlLabel
        control={<Checkbox checked={settings.registrationDisabled} onChange={(e) => setSettings((s) => ({ ...s, registrationDisabled: e.target.checked }))} />}
        label={t('admin.settings.registrationDisabled')}
      />
      <TextField
        label={t('admin.settings.adminEmail')}
        value={settings.adminEmail}
        onChange={(e) => setSettings((s) => ({ ...s, adminEmail: e.target.value }))}
        fullWidth
      />
      <TextField
        label={t('admin.settings.tokenExpiry')}
        type="number"
        value={settings.tokenExpiryMinutes}
        onChange={(e) => setSettings((s) => ({ ...s, tokenExpiryMinutes: e.target.value }))}
        helperText={t('admin.settings.tokenExpiryHelp')}
        inputProps={{ min: 5 }}
        fullWidth
      />
      <FormControl fullWidth>
        <InputLabel>{t('admin.settings.locale')}</InputLabel>
        <Select
          value={settings.locale}
          label={t('admin.settings.locale')}
          onChange={(e) => {
            const newLocale = e.target.value;
            setSettings((s) => ({ ...s, locale: newLocale }));
            i18n.changeLanguage(newLocale);
            localStorage.setItem('qlicker_locale', newLocale);
          }}
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <MenuItem key={loc.code} value={loc.code}>{loc.label}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl fullWidth>
        <InputLabel>{t('admin.settings.dateFormat')}</InputLabel>
        <Select
          value={settings.dateFormat}
          label={t('admin.settings.dateFormat')}
          onChange={(e) => {
            const newFormat = e.target.value;
            setSettings((s) => ({ ...s, dateFormat: newFormat }));
            localStorage.setItem('qlicker_dateFormat', newFormat);
          }}
        >
          {DATE_FORMATS.map((fmt) => (
            <MenuItem key={fmt.key} value={fmt.key}>{fmt.example}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl fullWidth>
        <InputLabel>{t('admin.settings.timeFormat')}</InputLabel>
        <Select
          value={settings.timeFormat}
          label={t('admin.settings.timeFormat')}
          onChange={(e) => {
            const newFormat = e.target.value;
            setSettings((s) => ({ ...s, timeFormat: newFormat }));
            localStorage.setItem('qlicker_timeFormat', newFormat);
          }}
        >
          {TIME_FORMATS.map((fmt) => (
            <MenuItem key={fmt.key} value={fmt.key}>
              {t(`admin.settings.timeFormatOptions.${fmt.key}`, { example: fmt.example })}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}

// ── Backup Tab ─────────────────────────────────────────────────────────────
function BackupTab() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(DEFAULT_BACKUP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timeFormat, setTimeFormat] = useState('24h');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const hasLoadedRef = useRef(false);
  const loadSettings = useCallback(async () => {
    const { data } = await apiClient.get('/settings');
    setTimeFormat(data.timeFormat === '12h' ? '12h' : '24h');
    hasLoadedRef.current = false;
    setSettings(buildBackupSettingsState(data));
  }, []);

  useEffect(() => {
    let mounted = true;
    loadSettings().catch(() => {
      if (mounted) {
        setSaveStatus('error');
        setSaveError(t('admin.failedLoadSettings'));
      }
    }).finally(() => {
      if (mounted) {
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [loadSettings, t]);

  useEffect(() => {
    if (loading) return undefined;
    const refreshIntervalMs = settings.backupLastRunStatus === 'running' ? 10000 : 60000;

    const timer = setInterval(() => {
      loadSettings().catch(() => {});
    }, refreshIntervalMs);

    return () => clearInterval(timer);
  }, [loadSettings, loading, settings.backupLastRunStatus]);

  useEffect(() => {
    if (loading) return;
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }

    const timer = setTimeout(async () => {
      setSaving(true);
      setSaveStatus('saving');
      setSaveError('');
      try {
        const dailyRetention = Number.parseInt(settings.backupRetentionDaily, 10);
        const weeklyRetention = Number.parseInt(settings.backupRetentionWeekly, 10);
        const monthlyRetention = Number.parseInt(settings.backupRetentionMonthly, 10);
        await apiClient.patch('/settings', {
          backupEnabled: !!settings.backupEnabled,
          backupTimeLocal: settings.backupTimeLocal || '02:00',
          backupRetentionDaily: Number.isFinite(dailyRetention) && dailyRetention >= 0 ? dailyRetention : 7,
          backupRetentionWeekly: Number.isFinite(weeklyRetention) && weeklyRetention >= 0 ? weeklyRetention : 4,
          backupRetentionMonthly: Number.isFinite(monthlyRetention) && monthlyRetention >= 0 ? monthlyRetention : 12,
        });
        setSaveStatus('success');
      } catch (err) {
        setSaveStatus('error');
        const message = err.response?.data?.message || t('admin.failedSaveBackupSettings');
        setSaveError(`${message} ${t('profile.lastChangeNotRecorded')}`);
      } finally {
        setSaving(false);
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [settings, loading]);

  if (loading) return <CircularProgress />;

  const lastRunStatus = settings.backupLastRunStatus || 'idle';
  const lastRunStatusLabel = {
    idle: t('admin.backup.statusIdle'),
    running: t('admin.backup.statusRunning'),
    success: t('admin.backup.statusSuccess'),
    failed: t('admin.backup.statusFailed'),
  }[lastRunStatus] || lastRunStatus;
  const backupManagerStatus = settings.backupManagerStatus || 'unknown';
  const backupManagerStatusLabel = {
    unknown: t('admin.backup.managerStatusUnknown'),
    healthy: t('admin.backup.managerStatusHealthy'),
    warning: t('admin.backup.managerStatusWarning'),
    error: t('admin.backup.managerStatusError'),
    stale: t('admin.backup.managerStatusStale'),
  }[backupManagerStatus] || backupManagerStatus;
  const backupManagerNeedsWarning = backupManagerStatus !== 'healthy';
  const backupManagerBlocksManualRun = backupManagerStatus === 'unknown'
    || backupManagerStatus === 'error'
    || backupManagerStatus === 'stale';
  const backupManagerAlertSeverity = backupManagerStatus === 'error' ? 'error' : 'warning';
  const showBackupResetButton = backupManagerNeedsWarning || lastRunStatus === 'running';

  const requestManualBackup = async () => {
    try {
      setSaveStatus('saving');
      setSaveError('');
      const { data } = await apiClient.post('/settings/backup-now');
      if (data?.backupLastRunStatus) {
        setSettings((current) => buildBackupSettingsState({ ...current, ...data }));
      } else {
        setSettings((current) => ({
          ...current,
          backupLastRunStatus: 'running',
          backupLastRunType: 'manual',
          backupLastRunMessage: t('admin.backup.runNowRequested'),
        }));
      }
      setSaveStatus('success');
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err.response?.data?.message || t('admin.backup.runNowFailed'));
    }
  };

  const requestBackupReset = async () => {
    try {
      setSaveStatus('saving');
      setSaveError('');
      const { data } = await apiClient.post('/settings/backup-reset');
      if (data?.backupLastRunStatus) {
        setSettings((current) => buildBackupSettingsState({ ...current, ...data }));
      } else {
        await loadSettings();
      }
      setSaveStatus('success');
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err.response?.data?.message || t('admin.backup.resetStateFailed'));
    }
  };

  return (
    <Box sx={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <AutoSaveStatus status={saving ? 'saving' : saveStatus} errorText={saveError} />
      <Alert severity="info">
        {t('admin.backup.help')}
      </Alert>
      {backupManagerNeedsWarning ? (
        <Alert severity={backupManagerAlertSeverity}>
          {settings.backupManagerMessage || t('admin.backup.managerStatusUnknownHelp')}
        </Alert>
      ) : null}
      {lastRunStatus === 'running' && backupManagerBlocksManualRun ? (
        <Alert severity="warning">
          {t('admin.backup.runningWarning')}
        </Alert>
      ) : null}
      <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t('admin.backup.storagePathLabel')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('admin.backup.storagePathValue', { value: settings.backupManagerHostPath || './backups' })}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="outlined"
            href="/manual/admin"
            target="_blank"
            rel="noreferrer"
          >
            {t('admin.backup.recoveryGuide')}
          </Button>
          {showBackupResetButton ? (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={requestBackupReset}
              disabled={saving}
            >
              {t('admin.backup.resetState')}
            </Button>
          ) : null}
          <Button
            size="small"
            variant="contained"
            onClick={requestManualBackup}
            disabled={saving || lastRunStatus === 'running' || backupManagerBlocksManualRun}
          >
            {t('admin.backup.runNow')}
          </Button>
        </Box>
      </Paper>
      <FormControlLabel
        control={(
          <Checkbox
            checked={!!settings.backupEnabled}
            onChange={(event) => setSettings((current) => ({ ...current, backupEnabled: event.target.checked }))}
          />
        )}
        label={t('admin.backup.enabled')}
      />
      <BackupTimeField
        label={t('admin.backup.timeLocal')}
        value={settings.backupTimeLocal}
        onChange={(nextValue) => setSettings((current) => ({ ...current, backupTimeLocal: nextValue }))}
        use24Hour={timeFormat !== '12h'}
        helperText={t('admin.backup.timeLocalHelp')}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' } }}>
        <TextField
          label={t('admin.backup.dailyRetention')}
          type="number"
          value={settings.backupRetentionDaily}
          onChange={(event) => setSettings((current) => ({ ...current, backupRetentionDaily: event.target.value }))}
          inputProps={{ min: 0 }}
          fullWidth
        />
        <TextField
          label={t('admin.backup.weeklyRetention')}
          type="number"
          value={settings.backupRetentionWeekly}
          onChange={(event) => setSettings((current) => ({ ...current, backupRetentionWeekly: event.target.value }))}
          inputProps={{ min: 0 }}
          fullWidth
        />
        <TextField
          label={t('admin.backup.monthlyRetention')}
          type="number"
          value={settings.backupRetentionMonthly}
          onChange={(event) => setSettings((current) => ({ ...current, backupRetentionMonthly: event.target.value }))}
          inputProps={{ min: 0 }}
          fullWidth
        />
      </Box>
      <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t('admin.backup.manager')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip size="small" label={backupManagerStatusLabel} color={BACKUP_MANAGER_STATUS_COLORS[backupManagerStatus] || 'default'} />
        </Box>
        <Typography variant="body2" color="text.secondary">
          {settings.backupManagerLastSeenAt
            ? t('admin.backup.managerLastSeen', { value: formatDisplayDateTime(settings.backupManagerLastSeenAt) })
            : t('admin.backup.managerNeverSeen')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {settings.backupManagerMessage || t('admin.backup.managerStatusUnknownHelp')}
        </Typography>
      </Paper>
      <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t('admin.backup.lastRun')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip size="small" label={lastRunStatusLabel} color={BACKUP_STATUS_COLORS[lastRunStatus] || 'default'} />
          {settings.backupLastRunType ? <Chip size="small" label={t(`admin.backup.type.${settings.backupLastRunType}`)} variant="outlined" /> : null}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {settings.backupLastRunAt
            ? t('admin.backup.lastRunAt', { value: formatDisplayDateTime(settings.backupLastRunAt) })
            : t('admin.backup.noRunsYet')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {settings.backupLastRunFilename
            ? t('admin.backup.lastRunFile', { value: settings.backupLastRunFilename })
            : t('admin.backup.lastRunFileEmpty')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {settings.backupLastRunMessage || t('admin.backup.lastRunMessageEmpty')}
        </Typography>
      </Paper>
    </Box>
  );
}

// ── Users Tab ───────────────────────────────────────────────────────────────
function UsersTab({ currentUserId }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [sortBy, setSortBy] = useState('lastLogin');
  const [sortDirection, setSortDirection] = useState('desc');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [timeFormat, setTimeFormat] = useState('24h');
  const [manageNotificationsOpen, setManageNotificationsOpen] = useState(false);

  // Create user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', firstname: '', lastname: '', role: 'student' });

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [imageViewUser, setImageViewUser] = useState(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userProperties, setUserProperties] = useState({ canPromote: false, allowEmailLogin: true, disabled: false });
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesSaving, setPropertiesSaving] = useState(false);
  const [resetPasswordValues, setResetPasswordValues] = useState({ password: '', confirmPassword: '' });
  const [resetPasswordSaving, setResetPasswordSaving] = useState(false);
  const adminResetPasswordInputProps = useMemo(() => ({
    autoCapitalize: 'none',
    autoCorrect: 'off',
    spellCheck: 'false',
    'data-form-type': 'other',
    'data-lpignore': 'true',
    'data-1p-ignore': 'true',
    'data-bwignore': 'true',
  }), []);

  const isStudentOnlyRole = (user) => {
    const roles = user?.profile?.roles || [];
    return roles.includes('student') && !roles.includes('professor') && !roles.includes('admin');
  };

  const getFullName = (u) => `${u.profile?.firstname || ''} ${u.profile?.lastname || ''}`.trim() || 'Unknown';
  const getInitials = (u) => {
    const firstInitial = u.profile?.firstname?.[0] || '';
    const lastInitial = u.profile?.lastname?.[0] || '';
    return (firstInitial + lastInitial).toUpperCase() || '?';
  };

  const getDefaultSortDirection = (field) => (field === 'lastLogin' ? 'desc' : 'asc');

  const handleSort = (field) => {
    setPage(0);
    setSortDirection((prevDirection) => {
      if (sortBy === field) {
        return prevDirection === 'asc' ? 'desc' : 'asc';
      }
      return getDefaultSortDirection(field);
    });
    setSortBy(field);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
        sortBy,
        sortDirection,
      };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      const { data } = await apiClient.get('/users', { params });
      setUsers(data.users);
      setTotal(data.total);
    } catch {
      setMsg({ severity: 'error', text: t('admin.users.failedLoadUsers') });
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, roleFilter, sortBy, sortDirection, t]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    let mounted = true;
    apiClient.get('/settings').then(({ data }) => {
      if (mounted) {
        setSsoEnabled(!!data?.SSO_enabled);
        setTimeFormat(data?.timeFormat === '12h' ? '12h' : '24h');
      }
    }).catch(() => {
      if (mounted) {
        setSsoEnabled(false);
        setTimeFormat('24h');
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleRoleChange = async (userId, role) => {
    try {
      await apiClient.patch(`/users/${userId}/role`, { role });
      setUsers((prev) => prev.map((u) => (
        u._id === userId
          ? {
            ...u,
            profile: {
              ...u.profile,
              roles: [role],
              ...(role === 'student' ? { canPromote: false } : {}),
            },
          }
          : u
      )));
      setMsg({ severity: 'success', text: t('admin.users.roleUpdated') });
    } catch {
      setMsg({ severity: 'error', text: t('admin.users.failedUpdateRole') });
    }
  };

  const handleVerifyEmail = async (userId) => {
    try {
      await apiClient.patch(`/users/${userId}/verify-email`);
      fetchUsers();
      setMsg({ severity: 'success', text: t('admin.users.emailVerified') });
    } catch {
      setMsg({ severity: 'error', text: t('admin.users.failedVerifyEmail') });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/users/${deleteTarget._id}`);
      setDeleteTarget(null);
      fetchUsers();
      setMsg({ severity: 'success', text: t('admin.users.userDeleted') });
    } catch {
      setMsg({ severity: 'error', text: t('admin.users.failedDeleteUser') });
    }
  };

  const handleToggleDisabled = async (targetUser) => {
    if (!targetUser?._id) return;
    const nextDisabled = !(targetUser?.disabled === true);
    try {
      const { data } = await apiClient.patch(`/users/${targetUser._id}/properties`, {
        disabled: nextDisabled,
      });
      setUsers((prev) => prev.map((user) => (user._id === data._id ? { ...user, ...data } : user)));
      setSelectedUser((prev) => (prev?._id === data._id ? data : prev));
      setUserProperties((prev) => ({ ...prev, disabled: !!data?.disabled }));
      setMsg({
        severity: 'success',
        text: nextDisabled ? t('admin.users.userDisabled') : t('admin.users.userRestored'),
      });
    } catch (err) {
      setMsg({
        severity: 'error',
        text: err.response?.data?.message || t('admin.users.failedToggleDisabled'),
      });
    }
  };

  const handleCreate = async () => {
    try {
      await apiClient.post('/users', newUser);
      setCreateOpen(false);
      setNewUser({ email: '', password: '', firstname: '', lastname: '', role: 'student' });
      fetchUsers();
      setMsg({ severity: 'success', text: t('admin.users.userCreated') });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.error || t('admin.users.failedCreateUser') });
    }
  };

  const openPropertiesModal = async (userSummary) => {
    setSelectedUser(userSummary);
    setUserProperties({
      canPromote: isStudentOnlyRole(userSummary) ? false : !!userSummary?.profile?.canPromote,
      allowEmailLogin: userSummary?.allowEmailLogin === true,
      disabled: userSummary?.disabled === true,
    });
    setResetPasswordValues({ password: '', confirmPassword: '' });
    setPropertiesOpen(true);
    setPropertiesLoading(true);
    try {
      const { data } = await apiClient.get(`/users/${userSummary._id}`);
      setSelectedUser(data);
      setUserProperties({
        canPromote: isStudentOnlyRole(data) ? false : !!data?.profile?.canPromote,
        allowEmailLogin: data?.allowEmailLogin === true,
        disabled: data?.disabled === true,
      });
    } catch {
      setMsg({ severity: 'error', text: t('admin.users.failedLoadUserProperties') });
      setPropertiesOpen(false);
    } finally {
      setPropertiesLoading(false);
    }
  };

  const closePropertiesModal = () => {
    setPropertiesOpen(false);
    setSelectedUser(null);
    setPropertiesLoading(false);
    setPropertiesSaving(false);
    setResetPasswordSaving(false);
    setResetPasswordValues({ password: '', confirmPassword: '' });
  };

  const handleSaveProperties = async () => {
    if (!selectedUser?._id) return;
    setPropertiesSaving(true);
    try {
      const { data } = await apiClient.patch(`/users/${selectedUser._id}/properties`, userProperties);
      setSelectedUser(data);
      setUserProperties({
        canPromote: isStudentOnlyRole(data) ? false : !!data?.profile?.canPromote,
        allowEmailLogin: data?.allowEmailLogin === true,
        disabled: data?.disabled === true,
      });
      setUsers((prev) => prev.map((user) => (user._id === data._id ? { ...user, ...data } : user)));
      setMsg({ severity: 'success', text: t('admin.users.userPropertiesUpdated') });
      closePropertiesModal();
    } catch {
      setMsg({ severity: 'error', text: t('admin.users.failedUpdateUserProperties') });
      setPropertiesSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser?._id) return;
    if (resetPasswordValues.password.length < 8) {
      setMsg({ severity: 'error', text: t('admin.users.passwordTooShort') });
      return;
    }
    if (resetPasswordValues.password !== resetPasswordValues.confirmPassword) {
      setMsg({ severity: 'error', text: t('admin.users.passwordsNoMatch') });
      return;
    }

    setResetPasswordSaving(true);
    try {
      const { data } = await apiClient.patch(`/users/${selectedUser._id}/password`, {
        newPassword: resetPasswordValues.password,
      });
      setSelectedUser(data);
      setUsers((prev) => prev.map((user) => (user._id === data._id ? { ...user, ...data } : user)));
      setResetPasswordValues({ password: '', confirmPassword: '' });
      setMsg({ severity: 'success', text: t('admin.users.passwordReset') });
    } catch (err) {
      setMsg({ severity: 'error', text: err.response?.data?.message || t('admin.users.failedResetPassword') });
    } finally {
      setResetPasswordSaving(false);
    }
  };

  const selectedUserIsStudentOnly = isStudentOnlyRole(selectedUser);
  const selectedUserIsAdmin = selectedUser?.profile?.roles?.includes('admin');
  const selectedUserIsDisabled = selectedUser?.disabled === true;
  const activeSessions = Array.isArray(selectedUser?.activeSessions) ? selectedUser.activeSessions : [];
  const hasActiveSessions = activeSessions.length > 0;
  const studentCourses = Array.isArray(selectedUser?.studentCourses) ? selectedUser.studentCourses : [];
  const instructorCourses = Array.isArray(selectedUser?.instructorCourses) ? selectedUser.instructorCourses : [];
  const selectedUserRoles = selectedUser?.profile?.roles || [];
  const renderCourseSection = (title, courses, emptyLabel) => (
    <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {courses.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {courses.map((course) => renderCourseListItem(course, t('admin.courses.inactive')))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {emptyLabel}
        </Typography>
      )}
    </Paper>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder={t('admin.users.searchPlaceholder')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
          sx={{ minWidth: 260 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>{t('admin.users.role')}</InputLabel>
          <Select value={roleFilter} label={t('admin.users.role')} onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">{t('admin.users.all')}</MenuItem>
            <MenuItem value="admin">{t('admin.users.admin')}</MenuItem>
            <MenuItem value="professor">{t('admin.users.professor')}</MenuItem>
            <MenuItem value="student">{t('admin.users.student')}</MenuItem>
          </Select>
        </FormControl>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          {t('admin.users.createUser')}
        </Button>
        <Tooltip title={t('notifications.manage.tooltip')}>
          <Button variant="outlined" startIcon={<NotificationsIcon />} onClick={() => setManageNotificationsOpen(true)}>
            {t('notifications.manage.button')}
          </Button>
        </Tooltip>
        <Typography variant="body2" sx={{ ml: 'auto' }}>{t('admin.users.totalCount', { total })}</Typography>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell component="th" scope="col">
                <TableSortLabel
                  active={sortBy === 'name'}
                  direction={sortBy === 'name' ? sortDirection : 'asc'}
                  onClick={() => handleSort('name')}
                >
                  {t('admin.users.name')}
                </TableSortLabel>
              </TableCell>
              <TableCell component="th" scope="col">
                <TableSortLabel
                  active={sortBy === 'email'}
                  direction={sortBy === 'email' ? sortDirection : 'asc'}
                  onClick={() => handleSort('email')}
                >
                  {t('admin.users.email')}
                </TableSortLabel>
              </TableCell>
              <TableCell component="th" scope="col">
                <TableSortLabel
                  active={sortBy === 'verified'}
                  direction={sortBy === 'verified' ? sortDirection : 'asc'}
                  onClick={() => handleSort('verified')}
                >
                  {t('admin.users.verified')}
                </TableSortLabel>
              </TableCell>
              <TableCell component="th" scope="col">
                <TableSortLabel
                  active={sortBy === 'lastLogin'}
                  direction={sortBy === 'lastLogin' ? sortDirection : 'desc'}
                  onClick={() => handleSort('lastLogin')}
                >
                  {t('admin.users.lastLogin')}
                </TableSortLabel>
              </TableCell>
              <TableCell component="th" scope="col">
                <TableSortLabel
                  active={sortBy === 'role'}
                  direction={sortBy === 'role' ? sortDirection : 'asc'}
                  onClick={() => handleSort('role')}
                >
                  {t('admin.users.role')}
                </TableSortLabel>
              </TableCell>
              <TableCell component="th" scope="col" align="right">{t('admin.users.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : users.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center">{t('admin.users.noUsersFound')}</TableCell></TableRow>
            ) : (
               users.map((u) => {
                 const userPropertiesLabel = t('admin.users.openUserProperties', { name: getFullName(u) });
                 return (
                <TableRow key={u._id}>
                  <TableCell component="th" scope="row">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                      <Box
                        component="button"
                        type="button"
                        onClick={() => {
                          if (u.profile?.profileImage) {
                            setImageViewUser(u);
                          }
                        }}
                        sx={{
                          p: 0,
                          border: 0,
                          bgcolor: 'transparent',
                          display: 'inline-flex',
                          borderRadius: '50%',
                          lineHeight: 0,
                          cursor: u.profile?.profileImage ? 'pointer' : 'default',
                          '&:focus-visible': {
                            outline: '2px solid',
                            outlineColor: 'primary.main',
                            outlineOffset: 2,
                          },
                        }}
                        aria-label={u.profile?.profileImage ? t('admin.users.viewProfileImageAria', { name: getFullName(u) }) : t('admin.users.noProfileImageAria', { name: getFullName(u) })}
                      >
                        <Avatar
                          alt={getFullName(u)}
                          src={u.profile?.profileThumbnail || u.profile?.profileImage || ''}
                          slotProps={{
                            img: {
                              alt: getFullName(u),
                            },
                          }}
                          sx={{ width: 34, height: 34 }}
                        >
                          {getInitials(u)}
                        </Avatar>
                      </Box>
                       <Tooltip title={userPropertiesLabel}>
                         <ButtonBase
                           onClick={() => openPropertiesModal(u)}
                           aria-label={userPropertiesLabel}
                           sx={{
                             justifyContent: 'flex-start',
                             color: 'text.primary',
                             typography: 'body2',
                             fontWeight: 400,
                             borderRadius: 1,
                             px: 0.5,
                             py: 0.25,
                           }}
                         >
                           {getFullName(u)}
                         </ButtonBase>
                       </Tooltip>
                       {u.disabled && (
                         <Chip
                           size="small"
                           color="warning"
                           variant="outlined"
                           label={t('admin.users.disabled')}
                         />
                       )}
                     </Box>
                   </TableCell>
                  <TableCell>{u.emails?.[0]?.address}</TableCell>
                  <TableCell>
                    {u.emails?.[0]?.verified ? (
                      <Tooltip title={t('admin.users.verified')}>
                        <CheckCircle color="success" fontSize="small" />
                      </Tooltip>
                    ) : (
                      <Tooltip title={t('admin.users.clickToVerify')}>
                        <IconButton size="small" aria-label={t('common.verifyEmail')} onClick={() => handleVerifyEmail(u._id)}>
                          <Cancel color="error" fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.lastLogin
                      ? formatDisplayDateTime(u.lastLogin)
                      : t('admin.users.never')}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={u._id === currentUserId ? t('admin.users.cannotChangeOwnRole') : ''}>
                      <span>
                        <Select
                          size="small"
                          value={u.profile?.roles?.[0] ?? 'student'}
                          onChange={(e) => handleRoleChange(u._id, e.target.value)}
                          disabled={u._id === currentUserId}
                        >
                          <MenuItem value="admin">{t('admin.users.admin')}</MenuItem>
                          <MenuItem value="professor">{t('admin.users.professor')}</MenuItem>
                          <MenuItem value="student">{t('admin.users.student')}</MenuItem>
                        </Select>
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={u.disabled ? t('admin.users.restoreUser') : t('admin.users.disableUser')}>
                      <span>
                        <IconButton
                          color={u.disabled ? 'success' : 'warning'}
                          size="small"
                          aria-label={u.disabled ? t('admin.users.restoreUser') : t('admin.users.disableUser')}
                          onClick={() => handleToggleDisabled(u)}
                          disabled={u._id === currentUserId}
                        >
                          {u.disabled ? <RestoreIcon fontSize="small" /> : <BlockIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                    <IconButton color="error" size="small" aria-label={t('common.deleteUser')} onClick={() => setDeleteTarget(u)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
                 );
               })
             )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 20, 50]}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('admin.users.confirmDelete')}</DialogTitle>
        <DialogContent>
          <span dangerouslySetInnerHTML={{ __html: t('admin.users.confirmDeleteMessage', { name: `${deleteTarget?.profile?.firstname || ''} ${deleteTarget?.profile?.lastname || ''}`.trim(), email: deleteTarget?.emails?.[0]?.address || '' }) }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>{t('common.delete')}</Button>
        </DialogActions>
      </Dialog>

      {/* Create user dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('admin.users.createUser')}</DialogTitle>
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            handleCreate();
          }}
        >
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
            <TextField label={t('admin.users.email')} type="email" required value={newUser.email} onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))} />
            <TextField label={t('admin.users.password')} type="password" required value={newUser.password} onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))} />
            <TextField label={t('admin.users.firstName')} required value={newUser.firstname} onChange={(e) => setNewUser((s) => ({ ...s, firstname: e.target.value }))} />
            <TextField label={t('admin.users.lastName')} required value={newUser.lastname} onChange={(e) => setNewUser((s) => ({ ...s, lastname: e.target.value }))} />
            <FormControl>
              <InputLabel>{t('admin.users.role')}</InputLabel>
              <Select value={newUser.role} label={t('admin.users.role')} onChange={(e) => setNewUser((s) => ({ ...s, role: e.target.value }))}>
                <MenuItem value="admin">{t('admin.users.admin')}</MenuItem>
                <MenuItem value="professor">{t('admin.users.professor')}</MenuItem>
                <MenuItem value="student">{t('admin.users.student')}</MenuItem>
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="contained">{t('common.create')}</Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={!!imageViewUser} onClose={() => setImageViewUser(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{getFullName(imageViewUser || {})}</DialogTitle>
        <DialogContent sx={{ textAlign: 'center' }}>
          {imageViewUser?.profile?.profileImage ? (
            <img
              src={imageViewUser.profile.profileImage}
              alt={`${getFullName(imageViewUser)} profile`}
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">{t('admin.users.noProfileImage')}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImageViewUser(null)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={propertiesOpen} onClose={closePropertiesModal} maxWidth="sm" fullWidth>
        <DialogTitle>{t('admin.users.userPropertiesTitle', { name: getFullName(selectedUser || {}) })}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          {propertiesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                {selectedUser?.emails?.[0]?.address}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('admin.users.userPropertiesHelp')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  label={selectedUserIsDisabled ? t('admin.users.disabled') : t('admin.users.active')}
                  color={selectedUserIsDisabled ? 'warning' : 'success'}
                  variant={selectedUserIsDisabled ? 'filled' : 'outlined'}
                />
                {selectedUser?.isSSOCreatedUser && (
                  <Chip size="small" label={t('admin.users.ssoCreatedAccount')} color="info" variant="outlined" />
                )}
                {ssoEnabled && selectedUser?.allowEmailLogin === false && (
                  <Chip size="small" label={t('admin.users.emailLoginDisabled')} color="warning" variant="outlined" />
                )}
                <Chip
                  size="small"
                  label={hasActiveSessions ? t('admin.users.loggedInNow') : t('admin.users.notLoggedInNow')}
                  color={hasActiveSessions ? 'success' : 'default'}
                  variant={hasActiveSessions ? 'filled' : 'outlined'}
                />
              </Box>
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={!!userProperties.disabled}
                    disabled={selectedUser?._id === currentUserId}
                    onChange={(event) => setUserProperties((current) => ({ ...current, disabled: event.target.checked }))}
                  />
                )}
                label={t('admin.users.disableLogin')}
              />
              <Typography variant="caption" color="text.secondary">
                {selectedUser?._id === currentUserId
                  ? t('admin.users.cannotDisableOwnAccount')
                  : t('admin.users.disableLoginHelp')}
              </Typography>
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t('admin.users.sessionActivity')}
                </Typography>
                {hasActiveSessions ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      {t('admin.users.currentSessionsCount', { count: activeSessions.length })}
                    </Typography>
                    {activeSessions.map((session, index) => (
                      <Paper key={`${session.sessionId}-${index}`} variant="outlined" sx={{ p: 1.25 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {t('admin.users.sessionNumber', { number: index + 1 })}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          {t('admin.users.sessionLoggedInAt', { value: formatDisplayDateTime(session.createdAt) || t('admin.users.unknownTime') })}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          {t('admin.users.sessionLastSeenAt', { value: formatDisplayDateTime(session.lastUsedAt || session.createdAt) || t('admin.users.unknownTime') })}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          {t('admin.users.sessionExpiresAt', { value: formatDisplayDateTime(session.expiresAt) || t('admin.users.unknownTime') })}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          {t('admin.users.ipAddressValue', { value: session.ipAddress || t('admin.users.ipUnavailable') })}
                        </Typography>
                      </Paper>
                    ))}
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Typography variant="body2">
                      {t('admin.users.lastLoginValue', {
                        value: selectedUser?.lastLogin ? formatDisplayDateTime(selectedUser.lastLogin) : t('admin.users.never'),
                      })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('admin.users.ipAddressValue', { value: selectedUser?.lastLoginIp || t('admin.users.ipUnavailable') })}
                    </Typography>
                  </Box>
                )}
              </Paper>
              {(selectedUser?.profile?.roles || []).includes('student') || studentCourses.length > 0 ? (
                renderCourseSection(
                  t('admin.users.studentCourses'),
                  studentCourses,
                  t('admin.users.noStudentCourses')
                )
              ) : null}
              {selectedUserRoles.includes('professor') || selectedUserRoles.includes('admin') || instructorCourses.length > 0 ? (
                renderCourseSection(
                  selectedUserIsStudentOnly ? t('admin.users.taCourses') : t('admin.users.instructorCourses'),
                  instructorCourses,
                  selectedUserIsStudentOnly ? t('admin.users.noTaCourses') : t('admin.users.noInstructorCourses')
                )
              ) : null}
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={!!userProperties.canPromote}
                    disabled={selectedUserIsStudentOnly}
                    onChange={(event) => setUserProperties((current) => ({ ...current, canPromote: event.target.checked }))}
                  />
                )}
                label={t('admin.users.canPromote')}
              />
              {selectedUserIsStudentOnly ? (
                <Typography variant="caption" color="text.secondary">
                  {t('admin.users.canPromoteStudentDisabled')}
                </Typography>
              ) : null}
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={selectedUserIsAdmin ? true : !!userProperties.allowEmailLogin}
                    disabled={!ssoEnabled || selectedUserIsAdmin}
                    onChange={(event) => setUserProperties((current) => ({ ...current, allowEmailLogin: event.target.checked }))}
                  />
                )}
                label={t('admin.users.allowEmailLogin')}
              />
              <Typography variant="caption" color="text.secondary">
                {!ssoEnabled
                  ? t('admin.users.allowEmailLoginDisabledUntilSso')
                  : selectedUserIsAdmin
                    ? t('admin.users.allowEmailLoginAdminAlwaysEnabled')
                    : t('admin.users.allowEmailLoginHelp')}
              </Typography>
              <Box sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography variant="subtitle2">
                  {t('admin.users.resetPassword')}
                </Typography>
                <TextField
                  label={t('admin.users.newPassword')}
                  type="password"
                  name="admin-user-local-password"
                  value={resetPasswordValues.password}
                  onChange={(event) => setResetPasswordValues((current) => ({ ...current, password: event.target.value }))}
                  autoComplete="section-admin-user-password-new new-password"
                  slotProps={{
                    htmlInput: {
                      ...adminResetPasswordInputProps,
                      autoComplete: 'section-admin-user-password-new new-password',
                    },
                  }}
                  fullWidth
                />
                <TextField
                  label={t('admin.users.confirmNewPassword')}
                  type="password"
                  name="admin-user-local-password-confirmation"
                  value={resetPasswordValues.confirmPassword}
                  onChange={(event) => setResetPasswordValues((current) => ({ ...current, confirmPassword: event.target.value }))}
                  autoComplete="section-admin-user-password-confirm new-password"
                  slotProps={{
                    htmlInput: {
                      ...adminResetPasswordInputProps,
                      autoComplete: 'section-admin-user-password-confirm new-password',
                    },
                  }}
                  fullWidth
                />
                <Typography variant="caption" color="text.secondary">
                  {ssoEnabled && !selectedUserIsAdmin && !userProperties.allowEmailLogin
                    ? t('admin.users.resetPasswordNeedsEmailLogin')
                    : t('admin.users.resetPasswordHelp')}
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <Button
                    variant="outlined"
                    onClick={handleResetPassword}
                    disabled={propertiesLoading || resetPasswordSaving}
                  >
                    {resetPasswordSaving ? t('common.saving') : t('admin.users.resetPasswordAction')}
                  </Button>
                </Box>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePropertiesModal}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSaveProperties} disabled={propertiesLoading || propertiesSaving || resetPasswordSaving}>
            {propertiesSaving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={4000} onClose={() => setMsg(null)}>
        {msg ? <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert> : undefined}
      </Snackbar>

      <ManageNotificationsDialog
        open={manageNotificationsOpen}
        onClose={() => setManageNotificationsOpen(false)}
        scopeType="system"
        title={t('notifications.manage.systemDialogTitle')}
        use24Hour={timeFormat !== '12h'}
      />
    </Box>
  );
}

// ── Storage Tab ─────────────────────────────────────────────────────────────
function StorageTab() {
  const { t } = useTranslation();
  const [storageType, setStorageType] = useState('local');
  const [maxImageWidth, setMaxImageWidth] = useState(getDefaultMaxImageWidth());
  const [avatarThumbnailSize, setAvatarThumbnailSize] = useState(getDefaultAvatarThumbnailSize());
  const [s3, setS3] = useState({
    AWS_bucket: '',
    AWS_region: '',
    AWS_accessKeyId: '',
    AWS_secretAccessKey: '',
    AWS_endpoint: '',
    AWS_forcePathStyle: false,
  });
  const [azure, setAzure] = useState({ Azure_storageAccount: '', Azure_storageAccessKey: '', Azure_storageContainer: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    apiClient.get('/settings').then(({ data }) => {
      if (!mounted) return;
      setStorageType(VALID_STORAGE_TYPES.has(data.storageType) ? data.storageType : 'local');
      setMaxImageWidth(data.maxImageWidth ?? getDefaultMaxImageWidth());
      setAvatarThumbnailSize(data.avatarThumbnailSize ?? getDefaultAvatarThumbnailSize());
      setS3({
        AWS_bucket: data.AWS_bucket ?? '',
        AWS_region: data.AWS_region ?? '',
        AWS_accessKeyId: data.resolvedAWSAccessKeyId ?? data.AWS_accessKeyId ?? data.AWS_accessKey ?? '',
        AWS_secretAccessKey: data.resolvedAWSSecretAccessKey ?? data.AWS_secretAccessKey ?? data.AWS_secret ?? '',
        AWS_endpoint: data.AWS_endpoint ?? data.S3_endpoint ?? '',
        AWS_forcePathStyle: !!(data.AWS_forcePathStyle ?? data.S3_forcePathStyle ?? false),
      });
      setAzure({
        Azure_storageAccount: data.resolvedAzureStorageAccount ?? data.Azure_storageAccount ?? data.Azure_accountName ?? '',
        Azure_storageAccessKey: data.resolvedAzureStorageAccessKey ?? data.Azure_storageAccessKey ?? data.Azure_accountKey ?? '',
        Azure_storageContainer: data.resolvedAzureStorageContainer ?? data.Azure_storageContainer ?? data.Azure_containerName ?? '',
      });
    }).catch(() => {
      if (mounted) {
        setSaveStatus('error');
        setSaveError(t('admin.failedLoadSettings'));
      }
    }).finally(() => {
      if (mounted) {
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }

    const timer = setTimeout(async () => {
      setSaving(true);
      setSaveStatus('saving');
      setSaveError('');
      try {
        const payload = {
          storageType,
          maxImageWidth: Math.max(1, parseInt(maxImageWidth, 10) || getDefaultMaxImageWidth()),
          avatarThumbnailSize: Math.max(64, parseInt(avatarThumbnailSize, 10) || getDefaultAvatarThumbnailSize()),
        };
        if (storageType === 's3') Object.assign(payload, s3);
        if (storageType === 'azure') Object.assign(payload, azure);
        await apiClient.patch('/settings', payload);
        clearPublicSettingsCache();
        setSaveStatus('success');
      } catch (err) {
        setSaveStatus('error');
        const message = err.response?.data?.message || t('admin.failedSaveStorageSettings');
        setSaveError(`${message} ${t('profile.lastChangeNotRecorded')}`);
      } finally {
        setSaving(false);
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [storageType, s3, azure, maxImageWidth, avatarThumbnailSize, loading]);

  if (loading) return <CircularProgress />;

  const approxImageSize = formatApproximateFileSize(
    approximate16x9JpegSizeBytes(Math.max(1, parseInt(maxImageWidth, 10) || getDefaultMaxImageWidth())),
  );
  const approxAvatarSize = formatApproximateFileSize(
    approximateSquareJpegSizeBytes(Math.max(64, parseInt(avatarThumbnailSize, 10) || getDefaultAvatarThumbnailSize())),
  );

  return (
    <Box sx={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <AutoSaveStatus status={saving ? 'saving' : saveStatus} errorText={saveError} />
      <Alert severity="info">{t('admin.storage.databaseManagedHelp')}</Alert>
      <TextField
        label={t('admin.storage.maxImageWidth')}
        type="number"
        value={maxImageWidth}
        onChange={(e) => setMaxImageWidth(e.target.value)}
        helperText={t('admin.storage.maxImageWidthHelp', { size: approxImageSize })}
        inputProps={{ min: 1 }}
        fullWidth
      />
      <TextField
        label={t('admin.storage.avatarThumbnailSize')}
        type="number"
        value={avatarThumbnailSize}
        onChange={(e) => setAvatarThumbnailSize(e.target.value)}
        helperText={t('admin.storage.avatarThumbnailSizeHelp', { size: approxAvatarSize })}
        inputProps={{ min: 64 }}
        fullWidth
      />
      <FormControl fullWidth>
        <InputLabel>{t('admin.storage.storageType')}</InputLabel>
        <Select value={storageType} label={t('admin.storage.storageType')} onChange={(e) => setStorageType(e.target.value)}>
          <MenuItem value="local">{t('admin.storage.local')}</MenuItem>
          <MenuItem value="s3">{t('admin.storage.s3')}</MenuItem>
          <MenuItem value="azure">{t('admin.storage.azure')}</MenuItem>
        </Select>
      </FormControl>

      {storageType === 's3' && (
        <>
          <TextField label={t('admin.storage.bucket')} value={s3.AWS_bucket} onChange={(e) => setS3((s) => ({ ...s, AWS_bucket: e.target.value }))} fullWidth />
          <TextField label={t('admin.storage.region')} value={s3.AWS_region} onChange={(e) => setS3((s) => ({ ...s, AWS_region: e.target.value }))} fullWidth />
          <TextField label={t('admin.storage.accessKeyId')} value={s3.AWS_accessKeyId} onChange={(e) => setS3((s) => ({ ...s, AWS_accessKeyId: e.target.value }))} fullWidth />
          <TextField label={t('admin.storage.secretAccessKey')} type="password" value={s3.AWS_secretAccessKey} onChange={(e) => setS3((s) => ({ ...s, AWS_secretAccessKey: e.target.value }))} fullWidth />
          <TextField
            label={t('admin.storage.endpoint')}
            value={s3.AWS_endpoint}
            onChange={(e) => setS3((s) => ({ ...s, AWS_endpoint: e.target.value }))}
            fullWidth
          />
          <FormControlLabel
            control={<Checkbox checked={!!s3.AWS_forcePathStyle} onChange={(e) => setS3((s) => ({ ...s, AWS_forcePathStyle: e.target.checked }))} />}
            label={t('admin.storage.forcePathStyle')}
          />
        </>
      )}

      {storageType === 'azure' && (
        <>
          <TextField label={t('admin.storage.storageAccount')} value={azure.Azure_storageAccount} onChange={(e) => setAzure((s) => ({ ...s, Azure_storageAccount: e.target.value }))} fullWidth />
          <TextField label={t('admin.storage.storageAccessKey')} type="password" value={azure.Azure_storageAccessKey} onChange={(e) => setAzure((s) => ({ ...s, Azure_storageAccessKey: e.target.value }))} fullWidth />
          <TextField label={t('admin.storage.storageContainer')} value={azure.Azure_storageContainer} onChange={(e) => setAzure((s) => ({ ...s, Azure_storageContainer: e.target.value }))} fullWidth />
        </>
      )}
    </Box>
  );
}

// ── SSO Tab ─────────────────────────────────────────────────────────────────
function SSOTab() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(DEFAULT_SSO_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    apiClient.get('/settings').then(({ data }) => {
      if (!mounted) return;
      setSettings(buildSsoSettingsState(data));
    }).catch(() => {
      if (mounted) {
        setSaveStatus('error');
        setSaveError(t('admin.failedLoadSettings'));
      }
    }).finally(() => {
      if (mounted) {
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }

    const timer = setTimeout(async () => {
      setSaving(true);
      setSaveStatus('saving');
      setSaveError('');
      try {
        const parsedClockSkew = Number.parseInt(settings.SSO_acceptedClockSkewMs, 10);
        const payload = buildSsoSettingsPatchPayload(settings);
        await apiClient.patch('/settings', {
          ...payload,
          SSO_acceptedClockSkewMs: Number.isFinite(parsedClockSkew) ? parsedClockSkew : 60000,
        });
        setSaveStatus('success');
      } catch (err) {
        setSaveStatus('error');
        const message = err.response?.data?.message || t('admin.failedSaveSSOSettings');
        setSaveError(`${message} ${t('profile.lastChangeNotRecorded')}`);
      } finally {
        setSaving(false);
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [settings, loading]);

  if (loading) return <CircularProgress />;

  const renderField = (field) => {
    const label = (
      <FieldLabel
        label={t(field.labelKey)}
        tooltip={field.helpKey ? t(field.helpKey) : ''}
      />
    );

    if (field.type === 'checkbox') {
      return (
        <Box key={field.key}>
          <FormControlLabel
            control={(
              <Checkbox
                checked={!!settings[field.key]}
                onChange={(event) => setSettings((current) => ({ ...current, [field.key]: event.target.checked }))}
              />
            )}
            label={label}
          />
        </Box>
      );
    }

    if (field.type === 'textarea') {
      return (
        <TextField
          key={field.key}
          label={label}
          value={settings[field.key]}
          onChange={(event) => setSettings((current) => ({ ...current, [field.key]: event.target.value }))}
          multiline
          minRows={field.key === 'SSO_authnContext' ? 2 : 4}
          helperText={field.helpKey ? t(field.helpKey) : undefined}
          fullWidth
        />
      );
    }

    if (field.type === 'select') {
      return (
        <FormControl key={field.key} fullWidth>
          <InputLabel>{label}</InputLabel>
          <Select
            value={settings[field.key]}
            label={label}
            onChange={(event) => setSettings((current) => ({ ...current, [field.key]: event.target.value }))}
          >
            {field.options.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }

    return (
      <TextField
        key={field.key}
        label={label}
        type={field.type === 'number' ? 'number' : 'text'}
        value={settings[field.key]}
        onChange={(event) => setSettings((current) => ({ ...current, [field.key]: event.target.value }))}
        helperText={field.helpKey ? t(field.helpKey) : undefined}
        inputProps={field.type === 'number' ? { min: -1 } : undefined}
        fullWidth
      />
    );
  };

  return (
    <Box sx={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <AutoSaveStatus status={saving ? 'saving' : saveStatus} errorText={saveError} />
      {SSO_BASIC_FIELDS.map(renderField)}
      <Button variant="outlined" onClick={() => setAdvancedOpen((current) => !current)}>
        {advancedOpen ? t('admin.sso.hideAdvanced') : t('admin.sso.showAdvanced')}
      </Button>
      {advancedOpen ? (
        <>
          <Alert severity="warning">{t('admin.sso.advancedWarning')}</Alert>
          {SSO_ADVANCED_FIELDS.map(renderField)}
        </>
      ) : null}
    </Box>
  );
}

// ── Video/Jitsi Tab ─────────────────────────────────────────────────────────
function VideoTab() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState({
    Jitsi_Enabled: false,
    Jitsi_Domain: '',
    Jitsi_EnabledCourses: [],
  });
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [enabledSearch, setEnabledSearch] = useState('');
  const [disabledSearch, setDisabledSearch] = useState('');
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      apiClient.get('/settings'),
      apiClient.get('/courses', { params: { limit: 500, view: 'all' } }).catch(() => ({ data: { courses: [] } })),
    ]).then(([settingsRes, coursesRes]) => {
      if (!mounted) return;
      const data = settingsRes.data;
      setSettings({
        Jitsi_Enabled: data.Jitsi_Enabled ?? false,
        Jitsi_Domain: data.Jitsi_Domain ?? '',
        Jitsi_EnabledCourses: data.Jitsi_EnabledCourses ?? [],
      });
      setCourses(coursesRes.data.courses || []);
    }).catch(() => {
      if (mounted) {
        setSaveStatus('error');
        setSaveError(t('admin.failedLoadSettings'));
      }
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }

    const timer = setTimeout(async () => {
      setSaving(true);
      setSaveStatus('saving');
      setSaveError('');
      try {
        await apiClient.patch('/settings', settings);
        setSaveStatus('success');
      } catch (err) {
        setSaveStatus('error');
        const message = err.response?.data?.message || t('admin.failedSaveVideoSettings');
        setSaveError(`${message} ${t('profile.lastChangeNotRecorded')}`);
      } finally {
        setSaving(false);
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [settings, loading]);

  const sortedCourses = useMemo(() => sortCoursesByTitle(courses), [courses]);
  const enabledCourseIds = useMemo(
    () => new Set((settings.Jitsi_EnabledCourses || []).map((courseId) => String(courseId))),
    [settings.Jitsi_EnabledCourses]
  );
  const coursesWithVideo = useMemo(
    () => sortedCourses.filter((course) => enabledCourseIds.has(String(course._id))),
    [enabledCourseIds, sortedCourses]
  );
  const coursesWithoutVideo = useMemo(
    () => sortedCourses.filter((course) => !enabledCourseIds.has(String(course._id))),
    [enabledCourseIds, sortedCourses]
  );
  const filterCourseList = useCallback((items, searchValue) => {
    const searchTerm = String(searchValue || '').trim().toLowerCase();
    if (!searchTerm) return items;
    return items.filter((course) => buildCourseSearchIndex(course).includes(searchTerm));
  }, []);
  const visibleEnabledCourses = useMemo(
    () => filterCourseList(coursesWithVideo, enabledSearch),
    [coursesWithVideo, enabledSearch, filterCourseList]
  );
  const visibleDisabledCourses = useMemo(
    () => filterCourseList(coursesWithoutVideo, disabledSearch),
    [coursesWithoutVideo, disabledSearch, filterCourseList]
  );

  const toggleCourse = useCallback((courseId) => {
    setSettings((current) => {
      const currentIds = Array.isArray(current.Jitsi_EnabledCourses) ? current.Jitsi_EnabledCourses : [];
      const normalizedCourseId = String(courseId);
      const hasCourse = currentIds.some((value) => String(value) === normalizedCourseId);
      return {
        ...current,
        Jitsi_EnabledCourses: hasCourse
          ? currentIds.filter((value) => String(value) !== normalizedCourseId)
          : [...currentIds, courseId],
      };
    });
  }, []);

  const renderCourseColumn = (title, searchValue, onSearchChange, items) => (
    <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25, minHeight: 420 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {title} ({items.length})
      </Typography>
      <TextField
        size="small"
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={t('admin.video.searchCourses')}
        fullWidth
      />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0, maxHeight: 440, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('admin.video.noCourses')}
          </Typography>
        ) : (
          items.map((course) => (
            <ButtonBase
              key={course._id}
              onClick={() => toggleCourse(course._id)}
              sx={{ width: '100%', textAlign: 'left', borderRadius: 1.5 }}
            >
              <Paper
                variant="outlined"
                sx={{
                  width: '100%',
                  p: 1.25,
                  borderRadius: 1.5,
                  transition: 'border-color 120ms ease, box-shadow 120ms ease, background-color 120ms ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'action.hover',
                    boxShadow: 1,
                  },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {buildCourseTitle(course, 'long')}
                </Typography>
              </Paper>
            </ButtonBase>
          ))
        )}
      </Box>
    </Paper>
  );

  if (loading) return <CircularProgress />;

  return (
    <Box sx={{ maxWidth: 980, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <AutoSaveStatus status={saving ? 'saving' : saveStatus} errorText={saveError} />
      <FormControlLabel
        control={
          <Checkbox
            checked={settings.Jitsi_Enabled}
            onChange={(e) => setSettings((s) => ({ ...s, Jitsi_Enabled: e.target.checked }))}
          />
        }
        label={t('admin.video.enableJitsi')}
      />
      {settings.Jitsi_Enabled ? (
        <>
          <TextField
            label={t('admin.video.jitsiDomain')}
            value={settings.Jitsi_Domain}
            onChange={(e) => setSettings((s) => ({ ...s, Jitsi_Domain: e.target.value }))}
            placeholder={t('admin.video.jitsiDomainPlaceholder')}
            fullWidth
          />
          <Typography variant="body2" color="text.secondary">
            {t('admin.video.enabledCoursesHelp')}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
            }}
          >
            {renderCourseColumn(t('admin.video.enabledCourses'), enabledSearch, setEnabledSearch, visibleEnabledCourses)}
            {renderCourseColumn(t('admin.video.coursesWithoutVideo'), disabledSearch, setDisabledSearch, visibleDisabledCourses)}
          </Box>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {t('admin.video.jitsiNotEnabled')}
        </Typography>
      )}
    </Box>
  );
}

// ── Courses Tab ─────────────────────────────────────────────────────────────
function CoursesTab() {
  const INITIAL_COURSE_COUNT = 50;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAllCourses, setShowAllCourses] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    fetchAllCourses(apiClient, { view: 'all' }).then((allCourses) => {
      if (mounted) {
        setCourses(allCourses);
      }
    }).catch((error) => {
      if (mounted) {
        setMessage(error.response?.data?.message || t('admin.courses.failedLoadCourses'));
      }
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [t]);

  const matchingCourses = useMemo(() => {
    const searchTerm = String(search || '').trim().toLowerCase();
    const baseCourses = sortCoursesByRecent(courses);
    if (!searchTerm) return baseCourses;
    return baseCourses.filter((course) => buildCourseSearchIndex(course).includes(searchTerm));
  }, [courses, search]);
  const hasSearch = String(search || '').trim().length > 0;
  const shouldLimitVisibleCourses = !hasSearch && !showAllCourses;
  const visibleCourses = useMemo(
    () => (shouldLimitVisibleCourses ? matchingCourses.slice(0, INITIAL_COURSE_COUNT) : matchingCourses),
    [INITIAL_COURSE_COUNT, matchingCourses, shouldLimitVisibleCourses]
  );
  const hasHiddenCourses = shouldLimitVisibleCourses && matchingCourses.length > INITIAL_COURSE_COUNT;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('admin.courses.searchPlaceholder')}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
          sx={{ minWidth: 280 }}
        />
        <Typography variant="body2" color="text.secondary">
          {t('admin.courses.totalCount', { total: matchingCourses.length })}
        </Typography>
      </Box>

      {loading ? (
        <CircularProgress />
      ) : message ? (
        <Alert severity="error">{message}</Alert>
      ) : visibleCourses.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('admin.courses.noCoursesFound')}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {visibleCourses.map((course) => (
            <SessionListCard
              key={course._id}
              onClick={() => navigate(`/prof/course/${course._id}`)}
              title={buildCourseTitle(course, 'medium')}
              badges={<Chip size="small" label={course.inactive ? t('admin.courses.inactive') : t('admin.courses.active')} color={course.inactive ? 'default' : 'success'} />}
              subtitle={buildCourseOptionLabel(course)}
            />
          ))}
          {hasHiddenCourses ? (
            <Button variant="outlined" onClick={() => setShowAllCourses(true)} sx={{ alignSelf: 'center' }}>
              {t('admin.courses.showAllCount', { total: matchingCourses.length })}
            </Button>
          ) : null}
        </Box>
      )}
    </Box>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [tab, setTab] = useState(0);
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>{t('admin.title')}</Typography>
      <ResponsiveTabsNavigation
        value={tab}
        onChange={setTab}
        ariaLabel={t('common.view')}
        dropdownLabel={t('common.view')}
        dropdownSx={{ mb: 1.5 }}
        tabs={[
          { value: 0, label: t('admin.tabs.settings') },
          { value: 1, label: t('admin.tabs.backup') },
          { value: 2, label: t('admin.tabs.users') },
          { value: 3, label: t('admin.tabs.courses') },
          { value: 4, label: t('admin.tabs.storage') },
          { value: 5, label: t('admin.tabs.sso') },
          { value: 6, label: t('admin.tabs.video') },
        ]}
      />
      <TabPanel value={tab} index={0}><SettingsTab /></TabPanel>
      <TabPanel value={tab} index={1}><BackupTab /></TabPanel>
      <TabPanel value={tab} index={2}><UsersTab currentUserId={user?._id} /></TabPanel>
      <TabPanel value={tab} index={3}><CoursesTab /></TabPanel>
      <TabPanel value={tab} index={4}><StorageTab /></TabPanel>
      <TabPanel value={tab} index={5}><SSOTab /></TabPanel>
      <TabPanel value={tab} index={6}><VideoTab /></TabPanel>
    </Box>
  );
}
