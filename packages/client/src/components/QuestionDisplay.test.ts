import { describe, expect, it } from 'vitest'
import { toggleMultiSelectAnswer, shouldShowCorrectMarkers } from './QuestionDisplay'

describe('toggleMultiSelectAnswer', () => {
  it('adds and removes values in sorted order', () => {
    expect(toggleMultiSelectAnswer('', 'B')).toEqual(['B'])
    expect(toggleMultiSelectAnswer(['B'], 'A')).toEqual(['A', 'B'])
    expect(toggleMultiSelectAnswer(['A', 'B'], 'A')).toEqual(['B'])
  })
})

describe('shouldShowCorrectMarkers', () => {
  it('always shows for instructor views', () => {
    expect(
      shouldShowCorrectMarkers({
        showCorrect: false,
        forReview: false,
        prof: true,
        sessionCorrect: false,
      })
    ).toBe(true)
  })

  it('requires explicit toggle for review mode students', () => {
    expect(
      shouldShowCorrectMarkers({
        showCorrect: false,
        forReview: true,
        prof: false,
        sessionCorrect: true,
      })
    ).toBe(false)

    expect(
      shouldShowCorrectMarkers({
        showCorrect: true,
        forReview: true,
        prof: false,
        sessionCorrect: false,
      })
    ).toBe(true)
  })

  it('respects session correct setting in non-review mode', () => {
    expect(
      shouldShowCorrectMarkers({
        showCorrect: false,
        forReview: false,
        prof: false,
        sessionCorrect: true,
      })
    ).toBe(true)
  })
})
