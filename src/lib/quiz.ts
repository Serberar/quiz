import type { Question, Subject } from './data'

export type Mode = 'random' | 'smart' | 'exam'
/** c: aciertos, w: fallos, l: si la última respuesta fue correcta (no existe en progreso antiguo) */
export type QStat = { c: number; w: number; l?: boolean }
export type Progress = Record<string, QStat>
/** Progreso de todas las asignaturas, por nombre */
export type AllProgress = Record<string, Progress>
export type QuizQuestion = Question & { subject: string; shuffled: string[] }
/** sel === null: pregunta saltada (solo en examen) */
export type Answer = { q: QuizQuestion; sel: string | null; ok: boolean }
export type Status = 'new' | 'failed' | 'ok'
export type Filter = 'all' | 'new' | 'failed'

export const EXAM_SIZE = 30
export const REVIEW_SIZE = 60
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

/** Fallada = la última vez se respondió mal (en progreso antiguo sin "l": más fallos que aciertos). */
export function status(p: QStat | undefined): Status {
  if (!p || p.c + p.w === 0) return 'new'
  const lastOk = p.l ?? p.c >= p.w
  return lastOk ? 'ok' : 'failed'
}

export function filterQuestions(questions: Question[], progress: Progress, filter: Filter): Question[] {
  return filter === 'all' ? questions : questions.filter(q => status(progress[q.id]) === filter)
}

/** Elige n preguntas sin repetir, con más probabilidad las nunca vistas y las falladas. */
export function smartSelect(questions: Question[], progress: Progress, n: number): Question[] {
  const weighted: Question[] = []
  for (const q of questions) {
    const p = progress[q.id]
    const s = status(p)
    const ratio = p && p.c + p.w ? p.w / (p.c + p.w) : 0
    const w = s === 'new' ? 4 : s === 'failed' ? 5 + Math.round(ratio * 3) : 1 + Math.round(ratio * 3)
    for (let i = 0; i < w; i++) weighted.push(q)
  }
  const picked = new Map<number, Question>()
  for (const q of shuffle(weighted)) {
    if (picked.size >= n) break
    picked.set(q.id, q)
  }
  return [...picked.values()]
}

export function buildQuiz(subject: string, questions: Question[], progress: Progress, mode: Mode, n: number): QuizQuestion[] {
  const count = Math.min(mode === 'exam' ? EXAM_SIZE : n, questions.length)
  const base = mode === 'smart' ? smartSelect(questions, progress, count) : shuffle(questions).slice(0, count)
  return base.map(q => ({ ...q, subject, shuffled: shuffle(q.options) }))
}

/**
 * Repaso general: n preguntas repartidas a partes iguales entre las asignaturas
 * (lo que no quepa en una asignatura pequeña pasa a las demás), mezcladas al final.
 */
export function buildReview(subjects: Subject[], all: AllProgress, n: number, prioritize: boolean): QuizQuestion[] {
  const quota = new Map(subjects.map(s => [s.name, 0]))
  let left = Math.min(n, subjects.reduce((t, s) => t + s.questions.length, 0))
  while (left > 0) {
    for (const s of shuffle(subjects)) {
      if (left === 0) break
      if (quota.get(s.name)! < s.questions.length) {
        quota.set(s.name, quota.get(s.name)! + 1)
        left--
      }
    }
  }
  const picked = subjects.flatMap(s => {
    const k = quota.get(s.name)!
    const p = all[s.name] ?? {}
    const qs = prioritize ? smartSelect(s.questions, p, k) : shuffle(s.questions).slice(0, k)
    return qs.map(q => ({ ...q, subject: s.name, shuffled: shuffle(q.options) }))
  })
  return shuffle(picked)
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

/** Nota de examen de cada asignatura de un repaso, ordenadas por nombre. */
export function gradeBySubject(answers: Answer[]) {
  const groups = new Map<string, Answer[]>()
  for (const a of answers) groups.set(a.q.subject, [...(groups.get(a.q.subject) ?? []), a])
  return [...groups]
    .map(([subject, list]) => ({ subject, ...grade(list, 'exam') }))
    .sort((a, b) => a.subject.localeCompare(b.subject, 'es'))
}

export function subjectStats(questions: Question[], progress: Progress) {
  let seen = 0, hits = 0, tries = 0, failed = 0
  for (const q of questions) {
    const p = progress[q.id]
    const s = status(p)
    if (s === 'new') continue
    seen++
    hits += p.c
    tries += p.c + p.w
    if (s === 'failed') failed++
  }
  return { total: questions.length, seen, failed, accuracy: tries ? Math.round((hits / tries) * 100) : null }
}

/** Resumen sin cargar las preguntas: total viene del manifest. */
export function progressSummary(progress: Progress, total: number) {
  let seen = 0, failed = 0
  for (const p of Object.values(progress)) {
    const s = status(p)
    if (s !== 'new') seen++
    if (s === 'failed') failed++
  }
  seen = Math.min(seen, total)
  return { total, seen, failed, ok: seen - failed, unseen: total - seen }
}

export function record(progress: Progress, id: number, ok: boolean): Progress {
  const p = progress[id] ?? { c: 0, w: 0 }
  return { ...progress, [id]: ok ? { c: p.c + 1, w: p.w, l: true } : { c: p.c, w: p.w + 1, l: false } }
}
