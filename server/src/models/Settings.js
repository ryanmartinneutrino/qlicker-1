import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema(
  {
    _id: { type: String },
    restrictDomain: { type: Boolean, default: false },
    allowedDomains: { type: [String], default: [] },
    requireVerified: { type: Boolean, default: false },
    adminEmail: { type: String, default: '' },

    // SSO fields
    SSO_enabled: { type: Boolean, default: false },
    SSO_entrypoint: { type: String, default: '' },
    SSO_cert: { type: String, default: '' },
    SSO_privCert: { type: String, default: '' },
    SSO_privKey: { type: String, default: '' },
    SSO_EntityId: { type: String, default: '' },
    SSO_logoutUrl: { type: String, default: '' },
    SSO_identifierFormat: { type: String, default: '' },
    SSO_emailIdentifier: { type: String, default: '' },
    SSO_firstNameIdentifier: { type: String, default: '' },
    SSO_lastNameIdentifier: { type: String, default: '' },
    SSO_studentNumberIdentifier: { type: String, default: '' },
    SSO_institutionName: { type: String, default: '' },
    SSO_roleIdentifier: { type: String, default: '' },
    SSO_roleProfName: { type: String, default: '' },

    // Storage config (flat fields matching admin UI)
    storageType: {
      type: String,
      enum: ['local', 's3', 'azure'],
      default: 'local',
    },
    // AWS S3 config
    AWS_bucket: { type: String, default: '' },
    AWS_region: { type: String, default: '' },
    AWS_accessKeyId: { type: String, default: '' },
    AWS_secretAccessKey: { type: String, default: '' },
    // Azure Blob Storage config
    Azure_storageAccount: { type: String, default: '' },
    Azure_storageAccessKey: { type: String, default: '' },
    Azure_storageContainer: { type: String, default: '' },
  },
  {
    collection: 'settings',
    timestamps: false,
  }
);

const Settings = mongoose.model('Settings', SettingsSchema);

export default Settings;
