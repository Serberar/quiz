import { describe, expect, it } from 'vitest'
import type { Question } from './data'
import { buildQuiz, buildReview, filterQuestions, grade, gradeBySubject, record, smartSelect, status, subjectStats, type Answer, type QuizQuestion } from './quiz'

const qs: Question[] = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  unit: i < 20 ? 'UT1' : 'UT2',
  question: `P${i + 1}`,
  options: ['a', 'b', 'c', 'd'],
  correct: 'a',
}))
const q = { ...qs[0], subject: 'A', shuffled: qs[0].options } as QuizQuestion
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
    expect(buildQuiz('A', qs, {}, 'exam', 5)).toHaveLength(30)
    expect(buildQuiz('A', qs.slice(0, 10), {}, 'exam', 5)).toHaveLength(10)
  })
  it('las opciones barajadas son las mismas', () => {
    for (const b of buildQuiz('A', qs, {}, 'random', 10)) expect([...b.shuffled].sort()).toEqual(b.options)
  })
})

describe('progreso', () => {
  it('record y subjectStats', () => {
    let p = record({}, 1, true)
    p = record(p, 2, false)
    p = record(p, 2, false)
    expect(subjectStats(qs, p)).toEqual({ total: 40, seen: 2, failed: 1, accuracy: 33 })
  })
  it('fallada = última respuesta mal; progreso antiguo sin l usa fallos > aciertos', () => {
    let p = record({}, 1, false)
    p = record(p, 1, true)
    expect(status(p[1])).toBe('ok')
    expect(status(record(p, 1, false)[1])).toBe('failed')
    expect(status({ c: 1, w: 3 })).toBe('failed')
    expect(status(undefined)).toBe('new')
    const f = record(record({}, 1, true), 2, false)
    expect(filterQuestions(qs, f, 'failed').map(x => x.id)).toEqual([2])
    expect(filterQuestions(qs, f, 'new')).toHaveLength(38)
  })
})

describe('repaso general', () => {
  const big = { name: 'A', questions: qs }
  const small = { name: 'B', questions: qs.slice(0, 3) }
  const other = { name: 'C', questions: qs }
  it('reparte por igual y pasa lo que no cabe a las demás', () => {
    const r = buildReview([big, small, other], {}, 60, true)
    expect(r).toHaveLength(60)
    const per = (n: string) => r.filter(x => x.subject === n).length
    expect(per('B')).toBe(3)
    expect(per('A') + per('C')).toBe(57)
    expect(Math.abs(per('A') - per('C'))).toBeLessThanOrEqual(1)
    for (const n of ['A', 'B', 'C']) expect(new Set(r.filter(x => x.subject === n).map(x => x.id)).size).toBe(per(n))
  })
  it('nota de examen por asignatura', () => {
    const mk = (subject: string, ok: boolean, sel: string | null = ok ? 'a' : 'b'): Answer => ({ q: { ...q, subject }, sel, ok })
    const res = gradeBySubject([mk('B', true), mk('B', false), mk('B', false), mk('B', false), mk('A', true), mk('A', false, null)])
    expect(res.map(r => [r.subject, r.grade, r.passed])).toEqual([
      ['A', 5, true],
      ['B', 0, false],
    ])
  })
})
