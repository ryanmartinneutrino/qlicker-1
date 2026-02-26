#!/usr/bin/env node

import {
  assertQlickerApiReachable,
  resolveApiBaseUrl,
  resolveClientBaseUrl,
  resolveMongoPort,
  resolveMongoUrl,
} from './migration-runtime-utils.mjs'

async function run() {
  const apiBaseUrl = resolveApiBaseUrl()
  const clientBaseUrl = resolveClientBaseUrl()
  const mongoPort = resolveMongoPort()
  const mongoUrl = resolveMongoUrl()

  const health = await assertQlickerApiReachable({ baseUrl: apiBaseUrl, requireFingerprint: true })

  console.log('[migration-runtime-preflight] ok')
  console.log(`- API_BASE_URL: ${apiBaseUrl}`)
  console.log(`- CLIENT_BASE_URL: ${clientBaseUrl}`)
  if (mongoUrl) {
    console.log(`- MONGO_URL: ${mongoUrl}`)
  } else {
    console.log('- MONGO_URL: (not set)')
  }
  if (mongoPort) {
    console.log(`- MONGO_PORT: ${mongoPort}`)
  } else {
    console.log('- MONGO_PORT: (not set)')
  }
  console.log(`- health fingerprint: header=${health.headerFingerprint} payload=${health.payloadFingerprint}`)
}

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
