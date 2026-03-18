import fp from 'fastify-plugin';
import { SAML } from '@node-saml/node-saml';
import Settings from '../models/Settings.js';
import { normalizeCertificatePem } from '../utils/certificate.js';

async function samlPlugin(fastify) {
  fastify.decorate('getSamlProvider', async function getSamlProvider() {
    const settings = await Settings.findOne();
    if (!settings?.SSO_enabled) {
      return null;
    }

    if (!settings.SSO_emailIdentifier || !settings.SSO_entrypoint || !settings.SSO_EntityId) {
      fastify.log.warn('SSO enabled but missing required fields (entrypoint, emailIdentifier, EntityId)');
      return null;
    }

    const callbackUrl = `${fastify.config.rootUrl}/api/v1/auth/sso/callback`;
    const logoutCallbackUrl = `${fastify.config.rootUrl}/api/v1/auth/sso/logout`;

    const samlOptions = {
      entryPoint: settings.SSO_entrypoint,
      issuer: settings.SSO_EntityId,
      idpCert: normalizeCertificatePem(settings.SSO_cert),
      callbackUrl,
      logoutCallbackUrl,
      logoutUrl: settings.SSO_logoutUrl || undefined,
      wantAssertionsSigned: true,
      disableRequestedAuthnContext: true, // Required for Active Directory (MS) SSO
    };

    // Identifier format (e.g. urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress)
    if (settings.SSO_identifierFormat) {
      samlOptions.identifierFormat = settings.SSO_identifierFormat;
    }

    // Private key for decryption of encrypted assertions/logout requests
    if (settings.SSO_privKey) {
      samlOptions.decryptionPvk = settings.SSO_privKey;
      samlOptions.privateKey = settings.SSO_privKey;
    }

    const saml = new SAML(samlOptions);

    // Attach settings for use in routes (to generate metadata with SP cert)
    saml._qlickerSettings = settings;

    return saml;
  });
}

export default fp(samlPlugin, { name: 'saml' });
