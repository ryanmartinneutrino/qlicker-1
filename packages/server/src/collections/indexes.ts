// Centralized index creation — mirrors the _ensureIndex calls in server/main.js
// plus additional compound indexes for performance.
import { initCourses } from './courses'
import { initSessions } from './sessions'
import { initQuestions } from './questions'
import { initResponses } from './responses'
import { initGrades } from './grades'
import { initImages } from './images'
import { initSettings } from './settings'
import { initUsers } from './users'

export async function initAllCollections(): Promise<void> {
  await Promise.all([
    initCourses(),
    initSessions(),
    initQuestions(),
    initResponses(),
    initGrades(),
    initImages(),
    initSettings(),
    initUsers(),
  ])
  console.log('All collection indexes ensured.')
}
