"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupPassport = setupPassport;
exports.setupSamlStrategy = setupSamlStrategy;
const passport_1 = __importDefault(require("passport"));
const passport_local_1 = require("passport-local");
const bcrypt_1 = __importDefault(require("bcrypt"));
const users_1 = require("../collections/users");
const settings_1 = require("../collections/settings");
function setupPassport() {
    // ── Local Strategy ────────────────────────────────────────────────────────
    // Verifies against existing Meteor bcrypt hashes stored in
    // user.services.password.bcrypt — backwards compatible with the Meteor app.
    passport_1.default.use(new passport_local_1.Strategy({ usernameField: 'email', passwordField: 'password' }, async (email, password, done) => {
        try {
            const users = (0, users_1.getUsers)();
            const user = await users.findOne({ 'emails.address': email });
            if (!user) {
                return done(null, false, { message: 'Invalid email or password.' });
            }
            const hash = user.services?.password?.bcrypt;
            if (!hash) {
                return done(null, false, { message: 'No password set for this account.' });
            }
            const valid = await bcrypt_1.default.compare(password, hash);
            if (!valid) {
                return done(null, false, { message: 'Invalid email or password.' });
            }
            return done(null, user);
        }
        catch (err) {
            return done(err);
        }
    }));
    // ── SAML Strategy ─────────────────────────────────────────────────────────
    // Lazily configured based on Settings collection values, mirroring the
    // setup in server/saml_server.js.
    setupSamlStrategy();
    // ── Serialization ─────────────────────────────────────────────────────────
    passport_1.default.serializeUser((user, done) => {
        done(null, user._id);
    });
    passport_1.default.deserializeUser(async (id, done) => {
        try {
            const users = (0, users_1.getUsers)();
            const user = await users.findOne({ _id: id });
            done(null, user ?? false);
        }
        catch (err) {
            done(err);
        }
    });
}
async function setupSamlStrategy() {
    try {
        const settings = await (0, settings_1.getSettings)().findOne({});
        if (!settings?.SSO_enabled ||
            !settings.SSO_emailIdentifier ||
            !settings.SSO_entrypoint ||
            !settings.SSO_identifierFormat ||
            !settings.SSO_EntityId) {
            return; // SSO not configured
        }
        // Dynamic import to avoid hard dependency when SAML is not used
        const { Strategy: SamlStrategy } = await Promise.resolve().then(() => __importStar(require('passport-saml')));
        const rootUrl = process.env.ROOT_URL || 'http://localhost:3001';
        passport_1.default.use('saml', new SamlStrategy({
            callbackUrl: `${rootUrl}/api/auth/saml/callback`,
            logoutCallbackUrl: `${rootUrl}/api/auth/saml/logout`,
            entryPoint: settings.SSO_entrypoint,
            cert: settings.SSO_cert || '',
            identifierFormat: settings.SSO_identifierFormat,
            logoutUrl: settings.SSO_logoutUrl || '',
            decryptionPvk: settings.SSO_privKey || '',
            issuer: settings.SSO_EntityId,
            disableRequestedAuthnContext: true,
        }, (_profile, done) => {
            done(null, _profile);
        }));
    }
    catch (err) {
        console.warn('SAML strategy setup skipped:', err.message);
    }
}
//# sourceMappingURL=setup.js.map