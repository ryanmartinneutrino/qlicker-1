import Settings from '../models/Settings.js';

export default async function settingsRoutes(app) {
  const { requireRole } = app;

  // GET / (admin only)
  app.get('/', { preHandler: requireRole(['admin']) }, async (request, reply) => {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ _id: 'settings' });
    }
    return settings.toObject();
  });

  // PATCH / (admin only)
  app.patch('/', { preHandler: requireRole(['admin']) }, async (request, reply) => {
    const updates = request.body || {};
    // Don't allow changing _id
    delete updates._id;

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
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ _id: 'settings' });
    }
    return {
      SSO_enabled: settings.SSO_enabled || false,
      SSO_institutionName: settings.SSO_institutionName || '',
      restrictDomain: settings.restrictDomain || false,
      requireVerified: settings.requireVerified || false,
      Jitsi_Enabled: settings.Jitsi_Enabled || false,
    };
  });

  // GET /jitsi-domain (authenticated) — returns Jitsi server info for video chat
  app.get('/jitsi-domain', { preHandler: app.authenticate }, async (request, reply) => {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ _id: 'settings' });
    }
    if (!settings.Jitsi_Enabled) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Jitsi is not enabled' });
    }
    return {
      domain: settings.Jitsi_Domain || '',
      etherpad: settings.Jitsi_EtherpadDomain || '',
    };
  });
}
