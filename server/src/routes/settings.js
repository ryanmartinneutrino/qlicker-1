import Course from '../models/Course.js';
import Settings from '../models/Settings.js';

async function getOrCreateSettings() {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({ _id: 'settings' });
  }
  return settings;
}

export default async function settingsRoutes(app) {
  const { authenticate, requireRole } = app;

  // GET / (admin only)
  app.get('/', { preHandler: requireRole(['admin']) }, async (request, reply) => {
    const settings = await getOrCreateSettings();
    return settings.toObject();
  });

  // Whitelist of fields that may be updated via the admin settings PATCH endpoint.
  // Prevents injection of unexpected fields into the settings document.
  const ALLOWED_SETTINGS_FIELDS = new Set([
    'restrictDomain', 'allowedDomains', 'requireVerified', 'adminEmail', 'email',
    'SSO_enabled', 'SSO_entrypoint', 'SSO_cert', 'SSO_privCert', 'SSO_privKey',
    'SSO_EntityId', 'SSO_logoutUrl', 'SSO_identifierFormat', 'SSO_emailIdentifier',
    'SSO_firstNameIdentifier', 'SSO_lastNameIdentifier', 'SSO_studentNumberIdentifier',
    'SSO_institutionName', 'SSO_roleIdentifier', 'SSO_roleProfName',
    'storageType', 'AWS_bucket', 'AWS_region', 'AWS_accessKeyId', 'AWS_secretAccessKey',
    'AWS_endpoint', 'AWS_forcePathStyle', 'AWS_accessKey', 'AWS_secret',
    'Azure_storageAccount', 'Azure_storageAccessKey', 'Azure_storageContainer',
    'Azure_accountName', 'Azure_accountKey', 'Azure_containerName',
    'tokenExpiryMinutes',
    'Jitsi_Enabled', 'Jitsi_Domain', 'Jitsi_EtherpadDomain', 'Jitsi_EnabledCourses',
    'locale', 'dateFormat',
    'maxImageSize', 'maxImageWidth',
  ]);

  // PATCH / (admin only)
  app.patch('/', { preHandler: requireRole(['admin']) }, async (request, reply) => {
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
          new: true,
          runValidators: true,
        }
      );

      return updatedSettings.toObject();
    } catch (err) {
      request.log.error({ err }, 'Failed to update settings');
      return reply.code(400).send({
        error: 'Bad Request',
        message: err.message || 'Failed to update settings',
      });
    }
  });

  // GET /public (no auth)
  app.get('/public', async (request, reply) => {
    const settings = await getOrCreateSettings();
    return {
      SSO_enabled: settings.SSO_enabled || false,
      SSO_institutionName: settings.SSO_institutionName || '',
      restrictDomain: settings.restrictDomain || false,
      requireVerified: settings.requireVerified || false,
      Jitsi_Enabled: settings.Jitsi_Enabled || false,
    };
  });

  // GET /jitsi-course/:courseId (authenticated) — returns whether Jitsi is enabled for a specific course
  app.get('/jitsi-course/:courseId', { preHandler: authenticate }, async (request, reply) => {
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
  app.get('/jitsi-domain', { preHandler: authenticate }, async (request, reply) => {
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
