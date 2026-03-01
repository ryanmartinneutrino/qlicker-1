import mongoose from 'mongoose';

const S3ConfigSchema = new mongoose.Schema(
  {
    bucket: { type: String, default: '' },
    region: { type: String, default: '' },
    accessKeyId: { type: String, default: '' },
    secretAccessKey: { type: String, default: '' },
  },
  { _id: false }
);

const AzureConfigSchema = new mongoose.Schema(
  {
    storageAccount: { type: String, default: '' },
    storageAccessKey: { type: String, default: '' },
    storageContainer: { type: String, default: '' },
  },
  { _id: false }
);

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

    // Storage config
    storageType: {
      type: String,
      enum: ['local', 's3', 'azure'],
      default: 'local',
    },
    s3Config: { type: S3ConfigSchema, default: () => ({}) },
    azureConfig: { type: AzureConfigSchema, default: () => ({}) },
  },
  {
    collection: 'settings',
    timestamps: false,
  }
);

const Settings = mongoose.model('Settings', SettingsSchema);

export default Settings;
