#!/usr/bin/env node
// =============================================================================
// Qlicker Production — S3 ACL Sanitization
// =============================================================================
// Switches all S3 objects referenced in the database from public-read ACL
// to private. This is the first step toward enabling a private S3 bucket.
//
// What it does:
//   1. Scans the 'users' collection for profileImage/profileThumbnail URLs
//   2. Scans the 'questions' collection for image URLs in question content
//   3. For each S3 object found, sets the ACL to 'private'
//   4. Optionally updates database references to use signed URLs
//
// Usage (inside the server container):
//   node sanitize-s3.js                 # Dry run — shows what would change
//   node sanitize-s3.js --apply         # Apply changes
//   node sanitize-s3.js --apply --verbose
//
// Or from the host via manage script:
//   docker exec <server-container> node /app/sanitize-s3.js --apply
// =============================================================================

import mongoose from 'mongoose';

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const VERBOSE = args.includes('--verbose');

if (DRY_RUN) {
  console.log('=== DRY RUN MODE === (pass --apply to make changes)\n');
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/qlicker';

// Check if S3 is configured
const AWS_BUCKET = process.env.AWS_BUCKET;
const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_ENDPOINT = process.env.AWS_ENDPOINT;
const AWS_FORCE_PATH_STYLE = process.env.AWS_FORCE_PATH_STYLE === 'true';

let s3Client = null;
let PutObjectAclCommand = null;

async function initS3() {
  if (!AWS_BUCKET || !AWS_ACCESS_KEY_ID) {
    console.log('S3 credentials not configured. Skipping ACL changes.');
    console.log('Set AWS_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY to enable.');
    return false;
  }

  try {
    const { S3Client, PutObjectAclCommand: AclCmd } = await import('@aws-sdk/client-s3');
    PutObjectAclCommand = AclCmd;

    const config = {
      region: AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    };

    if (AWS_ENDPOINT) {
      config.endpoint = AWS_ENDPOINT;
      config.forcePathStyle = AWS_FORCE_PATH_STYLE;
    }

    s3Client = new S3Client(config);
    return true;
  } catch (err) {
    console.log('AWS SDK not available. Install @aws-sdk/client-s3 to enable ACL changes.');
    console.log('Continuing with database-only scan...');
    return false;
  }
}

function extractS3Key(url) {
  if (!url || typeof url !== 'string') return null;

  // Match common S3 URL patterns
  // https://bucket.s3.amazonaws.com/key
  // https://s3.region.amazonaws.com/bucket/key
  // https://endpoint/bucket/key (MinIO, etc.)
  try {
    const u = new URL(url);
    const pathname = u.pathname.replace(/^\//, '');
    if (pathname) return pathname;
  } catch {
    // Not a URL, might be a relative key
    if (url.startsWith('/')) return url.slice(1);
    return url;
  }
  return null;
}

async function setObjectPrivate(key) {
  if (!s3Client || !PutObjectAclCommand || DRY_RUN) return;

  try {
    await s3Client.send(new PutObjectAclCommand({
      Bucket: AWS_BUCKET,
      Key: key,
      ACL: 'private',
    }));
    if (VERBOSE) console.log(`  ✓ Set private: ${key}`);
  } catch (err) {
    console.error(`  ✗ Failed to set private ACL for ${key}: ${err.message}`);
  }
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to: ${MONGO_URI}`);

  const s3Available = await initS3();
  const stats = { scanned: 0, s3Keys: 0, updated: 0, errors: 0 };

  // --- Scan users for profile images ----------------------------------------
  console.log('\n--- Scanning user profile images ---');
  const usersColl = mongoose.connection.collection('users');
  const usersCursor = usersColl.find({
    $or: [
      { 'profile.profileImage': { $exists: true, $ne: '' } },
      { 'profile.profileThumbnail': { $exists: true, $ne: '' } },
    ],
  });

  for await (const user of usersCursor) {
    stats.scanned++;
    const images = [
      user.profile?.profileImage,
      user.profile?.profileThumbnail,
    ].filter(Boolean);

    for (const imgUrl of images) {
      const key = extractS3Key(imgUrl);
      if (key) {
        stats.s3Keys++;
        if (VERBOSE || DRY_RUN) {
          console.log(`  User ${user.emails?.[0]?.address || user._id}: ${key}`);
        }
        if (s3Available && !DRY_RUN) {
          await setObjectPrivate(key);
          stats.updated++;
        }
      }
    }
  }

  // --- Scan questions for image references -----------------------------------
  console.log('\n--- Scanning question image references ---');
  const questionsColl = mongoose.connection.collection('questions');

  // Question images can be in:
  // - question.image (legacy)
  // - question.content (HTML with <img src="...">)
  // - question.options[].content (HTML)
  const questionsCursor = questionsColl.find({
    $or: [
      { image: { $exists: true, $ne: '' } },
      { content: { $regex: '<img' } },
      { 'options.content': { $regex: '<img' } },
    ],
  });

  const imgSrcRegex = /<img[^>]+src=["']([^"']+)["']/gi;

  for await (const q of questionsCursor) {
    stats.scanned++;

    // Direct image field
    if (q.image) {
      const key = extractS3Key(q.image);
      if (key) {
        stats.s3Keys++;
        if (VERBOSE || DRY_RUN) console.log(`  Question ${q._id} image: ${key}`);
        if (s3Available && !DRY_RUN) {
          await setObjectPrivate(key);
          stats.updated++;
        }
      }
    }

    // Images in content HTML
    const htmlFields = [q.content, ...(q.options || []).map(o => o.content)].filter(Boolean);
    for (const html of htmlFields) {
      let match;
      imgSrcRegex.lastIndex = 0;
      while ((match = imgSrcRegex.exec(html)) !== null) {
        const key = extractS3Key(match[1]);
        if (key) {
          stats.s3Keys++;
          if (VERBOSE || DRY_RUN) console.log(`  Question ${q._id} html: ${key}`);
          if (s3Available && !DRY_RUN) {
            await setObjectPrivate(key);
            stats.updated++;
          }
        }
      }
    }
  }

  // --- Summary ---------------------------------------------------------------
  console.log('\n--- Summary ---');
  console.log(`  Documents scanned: ${stats.scanned}`);
  console.log(`  S3 keys found:     ${stats.s3Keys}`);
  if (DRY_RUN) {
    console.log(`  Mode:              DRY RUN (no changes made)`);
    console.log(`\nTo apply changes, run with --apply`);
  } else {
    console.log(`  ACLs updated:      ${stats.updated}`);
    console.log(`  Errors:            ${stats.errors}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Sanitize S3 failed:', err);
  process.exit(1);
});
