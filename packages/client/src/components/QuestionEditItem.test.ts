import { describe, expect, it } from 'vitest'
import { QuestionType } from '@qlicker/shared'
import type { Question } from '@qlicker/shared'
import { transitionQuestionType } from './QuestionEditItem'

const baseQuestion: Question = {
  _id: 'q1',
  plainText: 'Question',
  content: '<p>Question</p>',
  type: QuestionType.MC,
  options: [
    { plainText: 'A', answer: 'A', content: 'A', correct: true },
    { plainText: 'B', answer: 'B', content: 'B', correct: false },
  ],
  creator: 'u1',
  owner: 'u1',
  public: false,
  createdAt: new Date('2024-01-01'),
  approved: false,
  tags: [],
}

describe('transitionQuestionType', () => {
  it('preserves options when toggling MC/MS', () => {
    const ms = transitionQuestionType(baseQuestion, QuestionType.MS)
    expect(ms.options.length).toBe(2)
    expect(ms.options[0].plainText).toBe('A')

    const backToMc = transitionQuestionType(ms, QuestionType.MC)
    expect(backToMc.options.length).toBe(2)
    expect(backToMc.options[0].correct).toBe(true)
    expect(backToMc.options[1].correct).toBe(false)
  })

  it('resets to True/False defaults', () => {
    const tf = transitionQuestionType(baseQuestion, QuestionType.TF)
    expect(tf.options).toEqual([
      { plainText: 'True', answer: 'True', content: 'True', correct: true },
      { plainText: 'False', answer: 'False', content: 'False', correct: false },
    ])
  })

  it('clears options for short answer and numerical', () => {
    const sa = transitionQuestionType(baseQuestion, QuestionType.SA)
    expect(sa.options).toEqual([])

    const nu = transitionQuestionType(baseQuestion, QuestionType.NU)
    expect(nu.options).toEqual([])
  })
})
