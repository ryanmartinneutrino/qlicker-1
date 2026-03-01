import Settings from '../models/Settings.js';

export default async function settingsRoutes(app) {
  const { authenticate, requireRole } = app;

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

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ _id: 'settings', ...updates });
    } else {
      Object.assign(settings, updates);
      await settings.save();
    }
    return settings.toObject();
  });

  // GET /public (no auth)
  app.get('/public', async (request, reply) => {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ _id: 'settings' });
    }
    return {
      SSO_enabled: settings.SSO_enabled || false,
      restrictDomain: settings.restrictDomain || false,
      requireVerified: settings.requireVerified || false,
    };
  });
}
