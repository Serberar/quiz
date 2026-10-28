import { describe, expect, it } from 'vitest'
import type { Question } from './data'
import { buildQuiz, grade, record, smartSelect, subjectStats, type Answer, type QuizQuestion } from './quiz'

const qs: Question[] = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  unit: i < 20 ? 'UT1' : 'UT2',
  question: `P${i + 1}`,
  options: ['a', 'b', 'c', 'd'],
  correct: 'a',
}))
const q = { ...qs[0], shuffled: qs[0].options } as QuizQuestion
const ans = (ok: number, wrong: number, skipped: number): Answer[] => [
  ...Array(ok).fill({ q, sel: 'a', ok: true }),
  ...Array(wrong).fill({ q, sel: 'b', ok: false }),
  ...Array(skipped).fill({ q, sel: null, ok: false }),
]

describe('grade', () => {
  it('examen: cada 3 fallos restan 1 acierto, saltadas no penalizan', () => {
    const r = grade(ans(18, 6, 6), 'exam')
    expect(r).toMatchObject({ correct: 18, wrong: 6, skipped: 6, points: 16, grade: 5.33, passed: true })
  })
  it('examen: la puntuación no baja de 0', () => {
    expect(grade(ans(1, 29, 0), 'exam').grade).toBe(0)
  })
  it('práctica: nota = aciertos / total', () => {
    expect(grade(ans(4, 6, 0), 'random')).toMatchObject({ grade: 4, passed: false })
  })
})

describe('selección', () => {
  it('smartSelect devuelve n preguntas distintas', () => {
    const picked = smartSelect(qs, {}, 25)
    expect(new Set(picked.map(p => p.id)).size).toBe(25)
  })
  it('examen usa 30 preguntas aunque se pida otro número', () => {
    expect(buildQuiz(qs, {}, 'exam', 5)).toHaveLength(30)
    expect(buildQuiz(qs.slice(0, 10), {}, 'exam', 5)).toHaveLength(10)
  })
  it('las opciones barajadas son las mismas', () => {
    for (const b of buildQuiz(qs, {}, 'random', 10)) expect([...b.shuffled].sort()).toEqual(b.options)
  })
})

describe('progreso', () => {
  it('record y subjectStats', () => {
    let p = record({}, 1, true)
    p = record(p, 2, false)
    p = record(p, 2, false)
    expect(subjectStats(qs, p)).toEqual({ total: 40, seen: 2, weak: 1, accuracy: 33 })
  })
})
