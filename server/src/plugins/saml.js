import fp from 'fastify-plugin';
import { SAML } from '@node-saml/node-saml';
import Settings from '../models/Settings.js';
import { normalizeCertificatePem, normalizePrivateKeyPem } from '../utils/certificate.js';

async function samlPlugin(fastify) {
  fastify.decorate('getSamlProvider', async function getSamlProvider(options = {}) {
    const settings = await Settings.findOne();
    if (!settings?.SSO_enabled) {
      return null;
    }

    if (!settings.SSO_emailIdentifier || !settings.SSO_entrypoint || !settings.SSO_EntityId) {
      fastify.log.warn('SSO enabled but missing required fields (entrypoint, emailIdentifier, EntityId)');
      return null;
    }

    const callbackPath = options.callbackPath || '/api/v1/auth/sso/callback';
    const logoutCallbackPath = options.logoutCallbackPath || '/api/v1/auth/sso/logout';
    const callbackUrl = callbackPath.startsWith('http')
      ? callbackPath
      : `${fastify.config.rootUrl}${callbackPath}`;
    const logoutCallbackUrl = logoutCallbackPath.startsWith('http')
      ? logoutCallbackPath
      : `${fastify.config.rootUrl}${logoutCallbackPath}`;

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
      const normalizedPrivateKey = normalizePrivateKeyPem(settings.SSO_privKey);
      samlOptions.decryptionPvk = normalizedPrivateKey;
      samlOptions.privateKey = normalizedPrivateKey;
    }

    const saml = new SAML(samlOptions);

    // Attach settings for use in routes (to generate metadata with SP cert)
    saml._qlickerSettings = settings;
    saml._qlickerCallbackPath = callbackPath;
    saml._qlickerLogoutCallbackPath = logoutCallbackPath;

    return saml;
  });
}

export default fp(samlPlugin, { name: 'saml' });
