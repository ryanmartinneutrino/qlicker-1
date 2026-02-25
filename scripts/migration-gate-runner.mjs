#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return defaultValue
}

function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  return `${(sec / 60).toFixed(1)}m`
}

async function runCommand(command) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(command, {
      shell: true,
      stdio: 'inherit',
      env: process.env,
    })

    child.on('exit', (code, signal) => {
      const durationMs = Date.now() - startedAt
      resolve({
        code: code ?? (signal ? 1 : 0),
        signal: signal || null,
        durationMs,
      })
    })

    child.on('error', () => {
      const durationMs = Date.now() - startedAt
      resolve({ code: 1, signal: 'spawn_error', durationMs })
    })
  })
}

async function writeSummary(outputPath, summary) {
  if (!outputPath) return
  const dir = path.dirname(outputPath)
  await mkdir(dir, { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
}

async function run() {
  const skipBuild = toBool(process.env.QCLICKER_GATE_SKIP_BUILD, false)
  const skipRuntime = toBool(process.env.QCLICKER_GATE_SKIP_RUNTIME, false)
  const includeDbCompat = toBool(process.env.QCLICKER_GATE_INCLUDE_DB_COMPAT, false)
  const includeDbParity = toBool(process.env.QCLICKER_GATE_INCLUDE_DB_PARITY, false)
  const includeLegacyBackup = toBool(process.env.QCLICKER_GATE_INCLUDE_LEGACY_BACKUP, false)
  const continueOnError = toBool(process.env.QCLICKER_GATE_CONTINUE_ON_ERROR, false)
  const summaryOutput = process.env.QCLICKER_GATE_OUTPUT || ''
  const summaryLabel = process.env.QCLICKER_GATE_LABEL || 'migration-gate'

  const plan = []

  if (!skipBuild) {
    plan.push({ key: 'build', command: 'npm run build' })
  }

  if (!skipRuntime) {
    plan.push({ key: 'smoke', command: 'npm run test:migration-smoke' })
    plan.push({ key: 'authz', command: 'npm run test:migration-authz' })
    plan.push({ key: 'realtime-authz', command: 'npm run test:migration-realtime-authz' })
    plan.push({ key: 'load', command: 'npm run test:migration-load' })
  }

  if (includeDbCompat) {
    plan.push({ key: 'db-compat', command: 'npm run test:migration-db-compat' })
  }

  if (includeDbParity) {
    plan.push({ key: 'db-parity', command: 'npm run test:migration-db-parity' })
  }

  if (includeLegacyBackup) {
    plan.push({ key: 'legacy-backup', command: 'npm run test:migration-legacy-backup' })
  }

  if (plan.length < 1) {
    throw new Error('No migration gate steps selected. Check gate environment flags.')
  }

  console.log('[migration-gate] plan:')
  for (const step of plan) {
    console.log(`- ${step.key}: ${step.command}`)
  }

  const startedAt = Date.now()
  const results = []

  for (const step of plan) {
    console.log(`\n[migration-gate] running: ${step.key}`)
    const result = await runCommand(step.command)
    results.push({
      key: step.key,
      command: step.command,
      ...result,
    })

    if (result.code !== 0 && !continueOnError) {
      break
    }
  }

  const failed = results.filter((result) => result.code !== 0)
  const totalDurationMs = Date.now() - startedAt
  const summary = {
    checkedAt: new Date().toISOString(),
    label: summaryLabel,
    config: {
      skipBuild,
      skipRuntime,
      includeDbCompat,
      includeDbParity,
      includeLegacyBackup,
      continueOnError,
    },
    plannedSteps: plan.map((step) => ({ key: step.key, command: step.command })),
    results: results.map((result) => ({
      key: result.key,
      command: result.command,
      code: result.code,
      signal: result.signal,
      durationMs: result.durationMs,
      status: result.code === 0 ? 'pass' : 'fail',
    })),
    totals: {
      durationMs: totalDurationMs,
      passed: results.filter((result) => result.code === 0).length,
      failed: failed.length,
    },
    status: failed.length > 0 ? 'fail' : 'pass',
  }
  await writeSummary(summaryOutput, summary)

  console.log('\n[migration-gate] summary:')
  for (const result of results) {
    const status = result.code === 0 ? 'PASS' : 'FAIL'
    console.log(`- ${status} ${result.key} (${formatMs(result.durationMs)}) :: ${result.command}`)
  }

  console.log(`[migration-gate] total duration: ${formatMs(totalDurationMs)}`)
  if (summaryOutput) {
    console.log(`[migration-gate] summary artifact: ${summaryOutput}`)
  }

  if (failed.length > 0) {
    const failedKeys = failed.map((result) => result.key).join(', ')
    throw new Error(`Migration gate failed: ${failedKeys}`)
  }

  console.log('[migration-gate] all selected checks passed.')
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
