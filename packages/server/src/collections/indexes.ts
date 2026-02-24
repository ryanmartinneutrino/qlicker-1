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
  const tasks: Array<[string, () => Promise<unknown>]> = [
    ['courses', initCourses],
    ['sessions', initSessions],
    ['questions', initQuestions],
    ['responses', initResponses],
    ['grades', initGrades],
    ['images', initImages],
    ['settings', initSettings],
    ['users', initUsers],
  ]

  const results = await Promise.allSettled(tasks.map(([, init]) => init()))
  results.forEach((result, index) => {
    const [name] = tasks[index]
    if (result.status === 'fulfilled') {
      console.log(`Indexes ensured for ${name}.`)
      return
    }
    console.error(`Failed to ensure indexes for ${name}:`, result.reason)
  })
}
