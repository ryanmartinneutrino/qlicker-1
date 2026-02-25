#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return defaultValue
}

async function assertReadable(filePath, label) {
  try {
    await access(filePath, fsConstants.R_OK)
  } catch {
    throw new Error(`${label} not found or unreadable: ${filePath}`)
  }
}

async function readJson(filePath, label) {
  await assertReadable(filePath, label)
  const raw = await readFile(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`${label} is not valid JSON: ${filePath}`)
  }
}

function findStep(results, key) {
  if (!Array.isArray(results)) return null
  return results.find((result) => result?.key === key || result?.step === key) || null
}

function passedStep(results, key) {
  const step = findStep(results, key)
  if (!step) return false
  if (typeof step.status === 'string') return step.status === 'pass'
  return Number(step.code ?? 1) === 0
}

function pushCheck(checks, key, pass, details) {
  checks.push({ key, status: pass ? 'pass' : 'fail', details })
}

async function run() {
  const runtimePath =
    process.env.QCLICKER_PILOT_RUNTIME_GATE_JSON || 'artifacts/migration-gate-runtime.json'
  const legacyPath =
    process.env.QCLICKER_PILOT_LEGACY_SUMMARY_JSON || 'artifacts/legacy-backup-summary.json'
  const outputPath =
    process.env.QCLICKER_PILOT_OUTPUT || path.join(path.dirname(runtimePath), 'pilot-checklist-summary.json')
  const requireRealtimeChurn = toBool(process.env.QCLICKER_PILOT_REQUIRE_REALTIME_CHURN, true)

  const runtime = await readJson(runtimePath, 'Runtime migration gate summary')
  const legacy = await readJson(legacyPath, 'Legacy backup validation summary')

  const checks = []
  pushCheck(
    checks,
    'runtime-gate-pass',
    runtime?.status === 'pass',
    runtime?.status === 'pass' ? 'Runtime migration gate passed.' : `Runtime gate status: ${runtime?.status || 'unknown'}`
  )

  const requiredRuntimeSteps = ['smoke', 'authz', 'realtime-authz', 'load']
  if (requireRealtimeChurn) requiredRuntimeSteps.push('realtime-churn')
  for (const step of requiredRuntimeSteps) {
    pushCheck(
      checks,
      `runtime-step-${step}`,
      passedStep(runtime?.results, step),
      passedStep(runtime?.results, step)
        ? `Runtime stage '${step}' passed.`
        : `Runtime stage '${step}' missing or failed.`
    )
  }

  pushCheck(
    checks,
    'legacy-backup-pass',
    legacy?.status === 'pass',
    legacy?.status === 'pass'
      ? 'Legacy backup compatibility/parity validation passed.'
      : `Legacy validation status: ${legacy?.status || 'unknown'}`
  )

  const requiredLegacySteps = ['db-compat-baseline', 'db-compat-candidate', 'db-parity']
  for (const step of requiredLegacySteps) {
    pushCheck(
      checks,
      `legacy-step-${step}`,
      passedStep(legacy?.steps, step),
      passedStep(legacy?.steps, step)
        ? `Legacy stage '${step}' passed.`
        : `Legacy stage '${step}' missing or failed.`
    )
  }

  const reportsPresent =
    Boolean(legacy?.reports?.baselineCompat) &&
    Boolean(legacy?.reports?.candidateCompat) &&
    Boolean(legacy?.reports?.parity)
  pushCheck(
    checks,
    'legacy-reports-present',
    reportsPresent,
    reportsPresent
      ? 'Legacy compatibility/parity report paths are present in summary.'
      : 'Legacy report paths are missing in summary payload.'
  )

  const failed = checks.filter((check) => check.status !== 'pass')
  const summary = {
    checkedAt: new Date().toISOString(),
    inputs: {
      runtimePath,
      legacyPath,
      requireRealtimeChurn,
    },
    checks,
    totals: {
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    status: failed.length === 0 ? 'pass' : 'fail',
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

  console.log('[migration-pilot-checklist] summary:')
  for (const check of checks) {
    const marker = check.status === 'pass' ? 'PASS' : 'FAIL'
    console.log(`- ${marker} ${check.key}: ${check.details}`)
  }
  console.log(`[migration-pilot-checklist] summary artifact: ${outputPath}`)

  if (failed.length > 0) {
    throw new Error(
      `Pilot checklist failed: ${failed.map((entry) => entry.key).join(', ')}`
    )
  }

  console.log('[migration-pilot-checklist] pilot gate evidence is complete.')
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
