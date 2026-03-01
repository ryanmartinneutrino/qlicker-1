#!/usr/bin/env node

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
config({ path: join(projectRoot, '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/qlicker';
const args = process.argv.slice(2);
const shouldReset = args.includes('--reset');

async function main() {
  console.log(`Connecting to MongoDB: ${MONGO_URI}`);
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  // Import User model from server
  const { default: User } = await import(join(projectRoot, 'server', 'src', 'models', 'User.js'));

  if (shouldReset) {
    console.log('Resetting database — dropping all collections...');
    const collections = await mongoose.connection.db.listCollections().toArray();
    for (const col of collections) {
      await mongoose.connection.db.dropCollection(col.name);
      console.log(`  Dropped: ${col.name}`);
    }
    console.log('All collections dropped.');
  }

  console.log('Seeding users...');

  const users = [
    {
      email: 'admin@qlicker.com',
      password: 'admin123',
      firstname: 'Admin',
      lastname: 'User',
      roles: ['admin'],
    },
    {
      email: 'prof@qlicker.com',
      password: 'prof123',
      firstname: 'Professor',
      lastname: 'User',
      roles: ['professor'],
    },
    {
      email: 'student@qlicker.com',
      password: 'student123',
      firstname: 'Student',
      lastname: 'User',
      roles: ['student'],
    },
  ];

  for (const u of users) {
    const existing = await User.findOne({ 'emails.address': u.email });
    if (existing) {
      console.log(`  [SKIP] ${u.email} already exists`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(u.password, 10);

    const user = new User({
      emails: [{ address: u.email, verified: true }],
      services: {
        password: { bcrypt: hashedPassword },
      },
      profile: {
        firstname: u.firstname,
        lastname: u.lastname,
        roles: u.roles,
      },
    });

    await user.save();
    console.log(`  [OK] Created ${u.email} (${u.roles.join(', ')})`);
  }

  console.log('');
  console.log('Seed complete!');
  console.log('');
  console.log('  admin@qlicker.com   / admin123    (admin)');
  console.log('  prof@qlicker.com    / prof123     (professor)');
  console.log('  student@qlicker.com / student123  (student)');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
