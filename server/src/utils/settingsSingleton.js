import Settings from '../models/Settings.js';

export const SETTINGS_DOCUMENT_ID = 'settings';

async function seedCanonicalDocumentFromDuplicate(logger) {
  const fallback = await Settings.findOne({ _id: { $ne: SETTINGS_DOCUMENT_ID } }).lean();
  if (!fallback) return false;

  const seeded = { ...fallback, _id: SETTINGS_DOCUMENT_ID };
  delete seeded.__v;

  await Settings.updateOne(
    { _id: SETTINGS_DOCUMENT_ID },
    { $setOnInsert: seeded },
    { upsert: true }
  );

  if (logger?.warn) {
    logger.warn(
      { sourceSettingsId: String(fallback._id || '') },
      'Seeded canonical settings document from a legacy duplicate settings record.'
    );
  }

  return true;
}

export async function ensureSettingsSingleton(logger) {
  if (Settings.db?.readyState !== 1) {
    return { skipped: true, removedDuplicates: 0, seededFromDuplicate: false };
  }

  let canonicalExists = Boolean(await Settings.exists({ _id: SETTINGS_DOCUMENT_ID }));
  const duplicateIds = await Settings.find({ _id: { $ne: SETTINGS_DOCUMENT_ID } })
    .select('_id')
    .lean();

  if (!canonicalExists && duplicateIds.length === 0) {
    return { skipped: false, removedDuplicates: 0, seededFromDuplicate: false };
  }

  let seededFromDuplicate = false;

  if (!canonicalExists) {
    seededFromDuplicate = await seedCanonicalDocumentFromDuplicate(logger);
    canonicalExists = Boolean(await Settings.exists({ _id: SETTINGS_DOCUMENT_ID }));
  }

  if (!canonicalExists) {
    await Settings.updateOne(
      { _id: SETTINGS_DOCUMENT_ID },
      { $setOnInsert: { _id: SETTINGS_DOCUMENT_ID } },
      { upsert: true }
    );
  }

  if (duplicateIds.length === 0) {
    return { skipped: false, removedDuplicates: 0, seededFromDuplicate };
  }

  const deleteResult = await Settings.deleteMany({ _id: { $ne: SETTINGS_DOCUMENT_ID } });
  const removedDuplicates = Number(deleteResult?.deletedCount || 0);

  if (logger?.warn) {
    logger.warn(
      {
        removedDuplicates,
        duplicateSettingsIds: duplicateIds.map((entry) => String(entry._id || '')),
      },
      'Removed duplicate settings documents. Only _id="settings" is supported.'
    );
  }

  return { skipped: false, removedDuplicates, seededFromDuplicate };
}

export async function getOrCreateSettingsDocument({ select = '', lean = false } = {}) {
  let query = Settings.findById(SETTINGS_DOCUMENT_ID);
  if (select) query = query.select(select);
  if (lean) query = query.lean();

  let settings = await query;
  if (settings) return settings;

  await Settings.updateOne(
    { _id: SETTINGS_DOCUMENT_ID },
    { $setOnInsert: { _id: SETTINGS_DOCUMENT_ID } },
    { upsert: true }
  );

  query = Settings.findById(SETTINGS_DOCUMENT_ID);
  if (select) query = query.select(select);
  if (lean) query = query.lean();
  settings = await query;

  return settings;
}
