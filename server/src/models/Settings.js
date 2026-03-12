import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema(
  {
    _id: { type: String },
    restrictDomain: { type: Boolean, default: false },
    allowedDomains: { type: [String], default: [] },
    requireVerified: { type: Boolean, default: false },
    adminEmail: { type: String, default: '' },
    // Legacy field name (Meteor used 'email' instead of 'adminEmail')
    email: { type: String, default: '' },

    // SSO fields (field names match between legacy and new)
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
    // AWS S3 config (new field names)
    AWS_bucket: { type: String, default: '' },
    AWS_region: { type: String, default: '' },
    AWS_accessKeyId: { type: String, default: '' },
    AWS_secretAccessKey: { type: String, default: '' },
    AWS_endpoint: { type: String, default: '' },
    AWS_forcePathStyle: { type: Boolean, default: false },
    // AWS S3 legacy field names (Meteor used different names)
    AWS_accessKey: { type: String, default: '' },
    AWS_secret: { type: String, default: '' },
    // Azure Blob Storage config (new field names)
    Azure_storageAccount: { type: String, default: '' },
    Azure_storageAccessKey: { type: String, default: '' },
    Azure_storageContainer: { type: String, default: '' },
    // Azure legacy field names (Meteor used different names)
    Azure_accountName: { type: String, default: '' },
    Azure_accountKey: { type: String, default: '' },
    Azure_containerName: { type: String, default: '' },

    // Token expiry (minutes). Default 120 = 2 hours. Adjustable in admin panel.
    tokenExpiryMinutes: { type: Number, default: 120 },

    // i18n / locale settings
    locale: { type: String, default: 'en' },
    dateFormat: { type: String, default: 'DD-MMM-YYYY' },

    // Legacy extra fields (preserved so they aren't stripped on save)
    maxImageSize: { type: Number, default: 0 },
    maxImageWidth: { type: Number, default: 0 },
  },
  {
    collection: 'settings',
    timestamps: false,
    strict: false,
  }
);

// Virtual getters that resolve new or legacy field names for AWS/Azure/email
SettingsSchema.virtual('resolvedAdminEmail').get(function () {
  return this.adminEmail || this.email || '';
});
SettingsSchema.virtual('resolvedAWSAccessKeyId').get(function () {
  return this.AWS_accessKeyId || this.AWS_accessKey || '';
});
SettingsSchema.virtual('resolvedAWSSecretAccessKey').get(function () {
  return this.AWS_secretAccessKey || this.AWS_secret || '';
});
SettingsSchema.virtual('resolvedAzureStorageAccount').get(function () {
  return this.Azure_storageAccount || this.Azure_accountName || '';
});
SettingsSchema.virtual('resolvedAzureStorageAccessKey').get(function () {
  return this.Azure_storageAccessKey || this.Azure_accountKey || '';
});
SettingsSchema.virtual('resolvedAzureStorageContainer').get(function () {
  return this.Azure_storageContainer || this.Azure_containerName || '';
});

SettingsSchema.set('toJSON', { virtuals: true });
SettingsSchema.set('toObject', { virtuals: true });

const Settings = mongoose.model('Settings', SettingsSchema);

export default Settings;
