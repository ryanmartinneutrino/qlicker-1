import Course from '../models/Course.js';
import Settings from '../models/Settings.js';
import { normalizeSettingsPayload } from '../utils/authPolicy.js';
import { stringParamsSchema } from '../utils/apiDocs.js';

async function getOrCreateSettings() {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({ _id: 'settings' });
  }
  return settings;
}

function buildBackupRequestId() {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const updateSettingsSchema = {
  body: {
    type: 'object',
    properties: {
      restrictDomain: { type: 'boolean' },
      allowedDomains: { type: 'array', items: { type: 'string' } },
      requireVerified: { type: 'boolean' },
      adminEmail: { type: 'string' },
      email: { type: 'string' },
      SSO_enabled: { type: 'boolean' },
      SSO_entrypoint: { type: 'string' },
      SSO_cert: { type: 'string' },
      SSO_privCert: { type: 'string' },
      SSO_privKey: { type: 'string' },
      SSO_EntityId: { type: 'string' },
      SSO_logoutUrl: { type: 'string' },
      SSO_identifierFormat: { type: 'string' },
      SSO_emailIdentifier: { type: 'string' },
      SSO_firstNameIdentifier: { type: 'string' },
      SSO_lastNameIdentifier: { type: 'string' },
      SSO_studentNumberIdentifier: { type: 'string' },
      SSO_institutionName: { type: 'string' },
      SSO_roleIdentifier: { type: 'string' },
      SSO_roleProfName: { type: 'string' },
      SSO_wantAssertionsSigned: { type: 'boolean' },
      SSO_wantAuthnResponseSigned: { type: 'boolean' },
      SSO_acceptedClockSkewMs: { type: 'number', minimum: -1 },
      SSO_disableRequestedAuthnContext: { type: 'boolean' },
      SSO_authnContext: { type: 'string' },
      SSO_routeMode: { type: 'string', enum: ['legacy', 'api_v1'] },
      storageType: { type: 'string', enum: ['local', 's3', 'azure'] },
      AWS_bucket: { type: 'string' },
      AWS_region: { type: 'string' },
      AWS_accessKeyId: { type: 'string' },
      AWS_secretAccessKey: { type: 'string' },
      AWS_endpoint: { type: 'string' },
      AWS_forcePathStyle: { type: 'boolean' },
      AWS_accessKey: { type: 'string' },
      AWS_secret: { type: 'string' },
      Azure_storageAccount: { type: 'string' },
      Azure_storageAccessKey: { type: 'string' },
      Azure_storageContainer: { type: 'string' },
      Azure_accountName: { type: 'string' },
      Azure_accountKey: { type: 'string' },
      Azure_containerName: { type: 'string' },
      tokenExpiryMinutes: { type: 'number', minimum: 1 },
      backupEnabled: { type: 'boolean' },
      backupTimeLocal: { type: 'string', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$' },
      backupRetentionDaily: { type: 'number', minimum: 0 },
      backupRetentionWeekly: { type: 'number', minimum: 0 },
      backupRetentionMonthly: { type: 'number', minimum: 0 },
      backupLastRunAt: { type: 'string', format: 'date-time' },
      backupLastRunType: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'manual'] },
      backupLastRunStatus: { type: 'string', enum: ['idle', 'running', 'success', 'failed'] },
      backupLastRunFilename: { type: 'string' },
      backupLastRunMessage: { type: 'string' },
      Jitsi_Enabled: { type: 'boolean' },
      Jitsi_Domain: { type: 'string' },
      Jitsi_EtherpadDomain: { type: 'string' },
      Jitsi_EnabledCourses: { type: 'array', items: { type: 'string' } },
      locale: { type: 'string' },
      dateFormat: { type: 'string' },
      timeFormat: { type: 'string', enum: ['24h', '12h'] },
      maxImageSize: { type: 'number', minimum: 0 },
      maxImageWidth: { type: 'number', minimum: 1 },
      avatarThumbnailSize: { type: 'number', minimum: 64 },
    },
    additionalProperties: false,
  },
};

const courseIdParamsSchema = {
  params: stringParamsSchema(['courseId']),
};

export default async function settingsRoutes(app) {
  const { authenticate, requireRole } = app;
  const settingsRateLimit = {
    rateLimit: { max: 30, timeWindow: '1 minute' },
    config: {
      rateLimit: { max: 30, timeWindow: '1 minute' },
    },
  };

  // GET / (admin only)
  app.get('/', { preHandler: requireRole(['admin']) }, async (request, reply) => {
    const settings = await getOrCreateSettings();
    return normalizeSettingsPayload(settings.toObject());
  });

  // Whitelist of fields that may be updated via the admin settings PATCH endpoint.
  // Prevents injection of unexpected fields into the settings document.
  const ALLOWED_SETTINGS_FIELDS = new Set([
    'restrictDomain', 'allowedDomains', 'requireVerified', 'adminEmail', 'email',
    'SSO_enabled', 'SSO_entrypoint', 'SSO_cert', 'SSO_privCert', 'SSO_privKey',
    'SSO_EntityId', 'SSO_logoutUrl', 'SSO_identifierFormat', 'SSO_emailIdentifier',
    'SSO_firstNameIdentifier', 'SSO_lastNameIdentifier', 'SSO_studentNumberIdentifier',
    'SSO_institutionName', 'SSO_roleIdentifier', 'SSO_roleProfName',
    'SSO_wantAssertionsSigned', 'SSO_wantAuthnResponseSigned', 'SSO_acceptedClockSkewMs',
    'SSO_disableRequestedAuthnContext', 'SSO_authnContext', 'SSO_routeMode',
    'storageType', 'AWS_bucket', 'AWS_region', 'AWS_accessKeyId', 'AWS_secretAccessKey',
    'AWS_endpoint', 'AWS_forcePathStyle', 'AWS_accessKey', 'AWS_secret',
    'Azure_storageAccount', 'Azure_storageAccessKey', 'Azure_storageContainer',
    'Azure_accountName', 'Azure_accountKey', 'Azure_containerName',
    'tokenExpiryMinutes',
    'backupEnabled', 'backupTimeLocal', 'backupRetentionDaily', 'backupRetentionWeekly',
    'backupRetentionMonthly',
    'Jitsi_Enabled', 'Jitsi_Domain', 'Jitsi_EtherpadDomain', 'Jitsi_EnabledCourses',
    'locale', 'dateFormat', 'timeFormat',
    'maxImageSize', 'maxImageWidth', 'avatarThumbnailSize',
  ]);

  // PATCH / (admin only)
  app.patch('/', { preHandler: requireRole(['admin']), schema: updateSettingsSchema, ...settingsRateLimit }, async (request, reply) => {
    const rawUpdates = request.body || {};
    // Filter to allowed fields only
    const updates = {};
    for (const key of Object.keys(rawUpdates)) {
      if (ALLOWED_SETTINGS_FIELDS.has(key)) {
        updates[key] = rawUpdates[key];
      }
    }

    try {
      let settings = await Settings.findOne().select('_id');
      if (!settings) {
        settings = await Settings.create({ _id: 'settings' });
      }

      const updatedSettings = await Settings.findByIdAndUpdate(
        settings._id,
        { $set: updates },
        {
          returnDocument: 'after',
          runValidators: true,
        }
      );

      return normalizeSettingsPayload(updatedSettings.toObject());
    } catch (err) {
      request.log.error({ err }, 'Failed to update settings');
      return reply.code(400).send({
        error: 'Bad Request',
        message: err.message || 'Failed to update settings',
      });
    }
  });

  app.post('/backup-now', { preHandler: requireRole(['admin']), ...settingsRateLimit }, async (request, reply) => {
    const requestId = buildBackupRequestId();

    try {
      let settings = await Settings.findOne().select('_id');
      if (!settings) {
        settings = await Settings.create({ _id: 'settings' });
      }

      const updatedSettings = await Settings.findByIdAndUpdate(
        settings._id,
        {
          $set: {
            backupManualRequestId: requestId,
            backupLastRunStatus: 'running',
            backupLastRunType: 'manual',
            backupLastRunMessage: 'Manual backup requested.',
          },
        },
        {
          returnDocument: 'after',
          runValidators: true,
        }
      );

      return normalizeSettingsPayload(updatedSettings.toObject());
    } catch (err) {
      request.log.error({ err }, 'Failed to queue manual backup');
      return reply.code(400).send({
        error: 'Bad Request',
        message: err.message || 'Failed to queue manual backup',
      });
    }
  });

  // GET /public (no auth)
  app.get('/public', async (request, reply) => {
    const settings = await getOrCreateSettings();
    const normalizedSettings = normalizeSettingsPayload(settings.toObject());
    return {
      SSO_enabled: normalizedSettings.SSO_enabled || false,
      SSO_institutionName: normalizedSettings.SSO_institutionName || '',
      restrictDomain: normalizedSettings.restrictDomain || false,
      requireVerified: normalizedSettings.requireVerified || false,
      Jitsi_Enabled: normalizedSettings.Jitsi_Enabled || false,
      timeFormat: normalizedSettings.timeFormat || '24h',
      maxImageWidth: normalizedSettings.maxImageWidth,
      avatarThumbnailSize: normalizedSettings.avatarThumbnailSize,
    };
  });

  // GET /jitsi-course/:courseId (authenticated) — returns whether Jitsi is enabled for a specific course
  app.get('/jitsi-course/:courseId', { preHandler: authenticate, schema: courseIdParamsSchema, ...settingsRateLimit }, async (request, reply) => {
    const { courseId } = request.params;
    const course = await Course.findById(courseId).select('_id instructors students inactive');
    if (!course) {
      return reply.code(404).send({ error: 'Not Found', message: 'Course not found' });
    }

    const roles = request.user.roles || [];
    const userId = request.user.userId;
    const isAdmin = roles.includes('admin');
    const isInstructor = (course.instructors || []).includes(userId);
    const isStudent = (course.students || []).includes(userId);

    if (!isAdmin && !isInstructor && !isStudent) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Not enrolled in this course' });
    }
    if (!isAdmin && isStudent && !isInstructor && course.inactive) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Course is inactive for students' });
    }

    const settings = await getOrCreateSettings();
    const enabledCourses = settings.Jitsi_EnabledCourses || [];

    return {
      enabled: Boolean(settings.Jitsi_Enabled && enabledCourses.includes(courseId)),
    };
  });

  // GET /jitsi-domain (authenticated) — returns Jitsi server info for video chat
  app.get('/jitsi-domain', { preHandler: authenticate, ...settingsRateLimit }, async (request, reply) => {
    const settings = await getOrCreateSettings();
    if (!settings.Jitsi_Enabled) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Jitsi is not enabled' });
    }
    return {
      domain: settings.Jitsi_Domain || '',
      etherpad: settings.Jitsi_EtherpadDomain || '',
    };
  });
}
