import type { Question } from './data'

export type Mode = 'random' | 'smart' | 'exam'
export type Progress = Record<string, { c: number; w: number }>
export type QuizQuestion = Question & { shuffled: string[] }
/** sel === null: pregunta saltada (solo en examen) */
export type Answer = { q: QuizQuestion; sel: string | null; ok: boolean }

export const EXAM_SIZE = 30
export const PASS_GRADE = 5

export const MODE_LABEL: Record<Mode, string> = { random: 'Aleatorio', smart: 'Refuerzo', exam: 'Examen' }

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Elige n preguntas sin repetir, con más probabilidad las nunca vistas y las más falladas. */
export function smartSelect(questions: Question[], progress: Progress, n: number): Question[] {
  const weighted: Question[] = []
  for (const q of questions) {
    const p = progress[q.id] ?? { c: 0, w: 0 }
    const seen = p.c + p.w
    const w = seen === 0 ? 2 : 1 + Math.round((p.w / seen) * 5)
    for (let i = 0; i < w; i++) weighted.push(q)
  }
  const picked = new Map<number, Question>()
  for (const q of shuffle(weighted)) {
    if (picked.size >= n) break
    picked.set(q.id, q)
  }
  return [...picked.values()]
}

export function buildQuiz(questions: Question[], progress: Progress, mode: Mode, n: number): QuizQuestion[] {
  const count = Math.min(mode === 'exam' ? EXAM_SIZE : n, questions.length)
  const base = mode === 'smart' ? smartSelect(questions, progress, count) : shuffle(questions).slice(0, count)
  return base.map(q => ({ ...q, shuffled: shuffle(q.options) }))
}

/** Nota sobre 10. En examen cada 3 fallos restan un acierto y las saltadas no penalizan. */
export function grade(answers: Answer[], mode: Mode) {
  const total = answers.length
  const correct = answers.filter(a => a.ok).length
  const skipped = answers.filter(a => a.sel === null).length
  const wrong = total - correct - skipped
  const points = mode === 'exam' ? Math.max(0, correct - wrong / 3) : correct
  const value = total ? Math.round((points / total) * 1000) / 100 : 0
  return { total, correct, wrong, skipped, points, grade: value, passed: value >= PASS_GRADE }
}

export function subjectStats(questions: Question[], progress: Progress) {
  let seen = 0, hits = 0, tries = 0, weak = 0
  for (const q of questions) {
    const p = progress[q.id]
    if (!p || p.c + p.w === 0) continue
    seen++
    hits += p.c
    tries += p.c + p.w
    if (p.w > p.c) weak++
  }
  return { total: questions.length, seen, weak, accuracy: tries ? Math.round((hits / tries) * 100) : null }
}

export function record(progress: Progress, id: number, ok: boolean): Progress {
  const p = progress[id] ?? { c: 0, w: 0 }
  return { ...progress, [id]: ok ? { ...p, c: p.c + 1 } : { ...p, w: p.w + 1 } }
}
