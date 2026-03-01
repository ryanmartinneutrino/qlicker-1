import fp from 'fastify-plugin';
import { SAML } from '@node-saml/node-saml';
import Settings from '../models/Settings.js';

async function samlPlugin(fastify) {
  fastify.decorate('getSamlProvider', async function getSamlProvider() {
    const settings = await Settings.findOne();
    if (!settings?.SSO_enabled) {
      return null;
    }

    const callbackUrl = `${fastify.config.rootUrl}/api/v1/auth/sso/callback`;

    const saml = new SAML({
      entryPoint: settings.SSO_entrypoint,
      issuer: settings.SSO_EntityId,
      cert: settings.SSO_cert,
      callbackUrl,
      logoutUrl: settings.SSO_logoutUrl || undefined,
      wantAssertionsSigned: true,
    });

    return saml;
  });
}

export default fp(samlPlugin, { name: 'saml' });
