#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return defaultValue
}

function quote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function buildDbMongoUri(rootUri, dbName) {
  const parsed = new URL(rootUri)
  parsed.pathname = `/${dbName}`
  return parsed.toString()
}

function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  return `${(sec / 60).toFixed(1)}m`
}

async function runCommand(step, command, env = process.env) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(command, {
      shell: true,
      stdio: 'inherit',
      env,
    })

    child.on('exit', (code, signal) => {
      resolve({
        step,
        command,
        code: code ?? (signal ? 1 : 0),
        signal: signal || null,
        durationMs: Date.now() - startedAt,
      })
    })

    child.on('error', () => {
      resolve({
        step,
        command,
        code: 1,
        signal: 'spawn_error',
        durationMs: Date.now() - startedAt,
      })
    })
  })
}

async function assertPathExists(location, label) {
  try {
    await access(location, fsConstants.R_OK)
  } catch {
    throw new Error(`${label} not found or unreadable: ${location}`)
  }
}

async function run() {
  const mongoPort = Number(process.env.MONGO_PORT || process.env.QCLICKER_MONGO_PORT || 0)
  const mongoFromPort =
    Number.isFinite(mongoPort) && mongoPort > 0
      ? `mongodb://localhost:${Math.floor(mongoPort)}/?directConnection=true`
      : ''
  const backupDir = process.env.QCLICKER_LEGACY_BACKUP_DIR || 'legacydb/<backup-dir>'
  const backupNamespace = process.env.QCLICKER_LEGACY_BACKUP_NAMESPACE || 'qlickerdb'
  const mongoUri =
    process.env.QCLICKER_LEGACY_MONGO_URI ||
    process.env.QCLICKER_MONGO_URI ||
    process.env.MONGO_URL ||
    mongoFromPort ||
    'mongodb://localhost:27018/?directConnection=true'
  const baselineDb = process.env.QCLICKER_LEGACY_BASELINE_DB || 'qlicker_legacy_backup'
  const candidateDb = process.env.QCLICKER_LEGACY_CANDIDATE_DB || 'qlicker_candidate'
  const artifactDir = process.env.QCLICKER_LEGACY_ARTIFACT_DIR || '/tmp/qlicker-migration-artifacts'
  const summaryOutput =
    process.env.QCLICKER_LEGACY_SUMMARY_OUTPUT ||
    path.join(artifactDir, `legacy-backup-summary-${baselineDb}-vs-${candidateDb}.json`)
  const skipRestore = toBool(process.env.QCLICKER_LEGACY_SKIP_RESTORE, false)
  const strictCompat = toBool(process.env.QCLICKER_DB_COMPAT_STRICT, false)
  const failOnDiff = toBool(process.env.QCLICKER_PARITY_FAIL_ON_DIFF, false)

  if (!skipRestore) {
    await assertPathExists(backupDir, 'Legacy backup directory')
    await assertPathExists(path.join(backupDir, backupNamespace), 'Legacy backup namespace directory')
  }

  const baselineCompatOutput = path.join(artifactDir, `db-compat-${baselineDb}.json`)
  const candidateCompatOutput = path.join(artifactDir, `db-compat-${candidateDb}.json`)
  const parityOutput = path.join(artifactDir, `db-parity-${baselineDb}-vs-${candidateDb}.json`)
  const baselineMongoUrl = buildDbMongoUri(mongoUri, baselineDb)
  const candidateMongoUrl = buildDbMongoUri(mongoUri, candidateDb)

  const plan = []
  plan.push({
    step: 'prepare-artifact-dir',
    command: `mkdir -p ${quote(artifactDir)}`,
  })

  if (!skipRestore) {
    plan.push({
      step: 'drop-dbs',
      command: `mongosh ${quote(mongoUri)} --quiet --eval ${quote(
        `db.getSiblingDB("${baselineDb}").dropDatabase(); db.getSiblingDB("${candidateDb}").dropDatabase();`
      )}`,
    })
    plan.push({
      step: 'restore-baseline',
      command: `mongorestore --uri ${quote(mongoUri)} --drop --nsInclude ${quote(
        `${backupNamespace}.*`
      )} --nsFrom ${quote(`${backupNamespace}.*`)} --nsTo ${quote(`${baselineDb}.*`)} ${quote(backupDir)}`,
    })
    plan.push({
      step: 'restore-candidate',
      command: `mongorestore --uri ${quote(mongoUri)} --drop --nsInclude ${quote(
        `${backupNamespace}.*`
      )} --nsFrom ${quote(`${backupNamespace}.*`)} --nsTo ${quote(`${candidateDb}.*`)} ${quote(backupDir)}`,
    })
  }

  plan.push({
    step: 'db-compat-baseline',
    command: 'npm run test:migration-db-compat',
    env: {
      ...process.env,
      QCLICKER_MONGO_URL: baselineMongoUrl,
      QCLICKER_DB_COMPAT_STRICT: strictCompat ? 'true' : 'false',
      QCLICKER_DB_COMPAT_OUTPUT: baselineCompatOutput,
    },
  })
  plan.push({
    step: 'db-compat-candidate',
    command: 'npm run test:migration-db-compat',
    env: {
      ...process.env,
      QCLICKER_MONGO_URL: candidateMongoUrl,
      QCLICKER_DB_COMPAT_STRICT: strictCompat ? 'true' : 'false',
      QCLICKER_DB_COMPAT_OUTPUT: candidateCompatOutput,
    },
  })
  plan.push({
    step: 'db-parity',
    command: 'npm run test:migration-db-parity',
    env: {
      ...process.env,
      QCLICKER_BASELINE_MONGO_URL: baselineMongoUrl,
      QCLICKER_CANDIDATE_MONGO_URL: candidateMongoUrl,
      QCLICKER_PARITY_FAIL_ON_DIFF: failOnDiff ? 'true' : 'false',
      QCLICKER_PARITY_OUTPUT: parityOutput,
    },
  })

  console.log('[legacy-backup-validate] plan:')
  for (const entry of plan) {
    console.log(`- ${entry.step}: ${entry.command}`)
  }

  const startedAt = Date.now()
  const results = []
  for (const entry of plan) {
    console.log(`\n[legacy-backup-validate] running: ${entry.step}`)
    const result = await runCommand(entry.step, entry.command, entry.env || process.env)
    results.push(result)
    if (result.code !== 0) {
      console.error(
        `[legacy-backup-validate] failed step: ${result.step} (${formatMs(result.durationMs)})`
      )
      break
    }
  }

  const failed = results.find((result) => result.code !== 0)
  console.log('\n[legacy-backup-validate] summary:')
  for (const result of results) {
    console.log(
      `- ${result.code === 0 ? 'PASS' : 'FAIL'} ${result.step} (${formatMs(result.durationMs)})`
    )
  }
  console.log(`[legacy-backup-validate] total duration: ${formatMs(Date.now() - startedAt)}`)

  const summary = {
    checkedAt: new Date().toISOString(),
    backupDir,
    backupNamespace,
    mongoUri,
    baselineDb,
    candidateDb,
    artifactDir,
    skipRestore,
    strictCompat,
    failOnDiff,
    baselineMongoUrl,
    candidateMongoUrl,
    reports: {
      baselineCompat: baselineCompatOutput,
      candidateCompat: candidateCompatOutput,
      parity: parityOutput,
    },
    steps: results.map((result) => ({
      step: result.step,
      command: result.command,
      code: result.code,
      signal: result.signal,
      durationMs: result.durationMs,
      status: result.code === 0 ? 'pass' : 'fail',
    })),
    totals: {
      durationMs: Date.now() - startedAt,
      passed: results.filter((result) => result.code === 0).length,
      failed: failed ? 1 : 0,
    },
    status: failed ? 'fail' : 'pass',
  }

  await mkdir(path.dirname(summaryOutput), { recursive: true })
  await writeFile(summaryOutput, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  console.log(`[legacy-backup-validate] summary artifact: ${summaryOutput}`)

  if (failed) {
    throw new Error(`Legacy backup validation failed at step: ${failed.step}`)
  }

  console.log('[legacy-backup-validate] completed successfully.')
  console.log(`[legacy-backup-validate] baseline compat report: ${baselineCompatOutput}`)
  console.log(`[legacy-backup-validate] candidate compat report: ${candidateCompatOutput}`)
  console.log(`[legacy-backup-validate] parity report: ${parityOutput}`)
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
