import type { Question, Subject } from './data'

export type Mode = 'random' | 'smart' | 'exam'
/**
 * Estado de una pregunta. Solo c y w existen siempre (progreso antiguo):
 * c aciertos, w fallos, l última respuesta correcta, s aciertos seguidos al final,
 * t última respuesta y f primera respuesta (ms; 0 = antes de guardarse fechas).
 */
export type QStat = { c: number; w: number; l?: boolean; s?: number; t?: number; f?: number }
export type Progress = Record<string, QStat>
/** Progreso de todas las asignaturas, por nombre */
export type AllProgress = Record<string, Progress>
/** retry: repetición de una fallada en la misma sesión (no cuenta para la nota) */
export type QuizQuestion = Question & { subject: string; shuffled: string[]; retry?: boolean }
/** sel === null: pregunta saltada (solo en examen) */
export type Answer = { q: QuizQuestion; sel: string | null; ok: boolean }
export type Status = 'new' | 'failed' | 'ok'
export type Filter = 'all' | 'new' | 'failed' | 'flagged'
export type Pool = { name: string; questions: Question[]; progress: Progress }

export const EXAM_SIZE = 30
export const REVIEW_SIZE = 60
export const BLOCK_SIZE = 20
export const PASS_GRADE = 5
/** Fecha del examen (28 de enero). Las preguntas nuevas se planifican para estar vistas 2 semanas antes. */
export const EXAM_DATE = new Date(2027, 0, 28)
const NEW_BUFFER_DAYS = 14
const DAY = 86_400_000
/** Días hasta volver a preguntar según los aciertos seguidos (0 = fallada: ya) */
const INTERVALS = [0, 1, 3, 7, 14, 30, 45]

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

/** Aciertos seguidos. En progreso antiguo se supone 1 si la última fue bien. */
const streak = (p: QStat) => p.s ?? (status(p) === 'ok' ? 1 : 0)

/**
 * Cuándo toca repasar una pregunta vista (null si es nueva). El intervalo nunca pasa de la mitad
 * del tiempo que queda hasta el examen, para que todo vuelva a salir antes.
 */
export function dueAt(p: QStat | undefined, exam = EXAM_DATE.getTime()): number | null {
  if (status(p) === 'new') return null
  if (status(p) === 'failed') return 0
  const t = p!.t ?? 0
  const days = INTERVALS[Math.min(streak(p!), INTERVALS.length - 1)]
  return t + Math.min(days * DAY, Math.max(DAY, (exam - t) / 2))
}

export function startOfDay(now = Date.now()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function daysUntilExam(now = Date.now()) {
  return Math.max(0, Math.round((EXAM_DATE.getTime() - startOfDay(now)) / DAY))
}

export function filterQuestions(questions: Question[], progress: Progress, filter: Filter, flagged?: Set<number>): Question[] {
  if (filter === 'all') return questions
  if (filter === 'flagged') return questions.filter(q => flagged?.has(q.id))
  return questions.filter(q => status(progress[q.id]) === filter)
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

const toQuiz = (subject: string) => (q: Question): QuizQuestion => ({ ...q, subject, shuffled: shuffle(q.options) })

export function buildQuiz(subject: string, questions: Question[], progress: Progress, mode: Mode, n: number): QuizQuestion[] {
  const count = Math.min(mode === 'exam' ? EXAM_SIZE : n, questions.length)
  const base = mode === 'smart' ? smartSelect(questions, progress, count) : shuffle(questions).slice(0, count)
  return base.map(toQuiz(subject))
}

/**
 * Nota que sacarías hoy en un examen de la asignatura, según lo que tienes aprendido:
 * las nuevas se saltarían (0) y el resto se responde con más probabilidad de acierto cuantos
 * más aciertos seguidos lleve. Aplica la penalización de examen (3 fallos restan 1).
 */
export function estimateGrade(progress: Progress, total: number) {
  if (!total) return 0
  let points = 0
  for (const p of Object.values(progress)) {
    const s = status(p)
    if (s === 'new') continue
    const prob = s === 'failed' ? 0.25 : [0.25, 0.7, 0.85, 0.93, 0.97][Math.min(streak(p), 4)]
    points += Math.max(0, prob - (1 - prob) / 3)
  }
  return Math.min(10, Math.round((points / total) * 100) / 10)
}

/** Peso de 1 (va bien) a 2 (va muy mal): las asignaturas flojas reciben más preguntas. */
export function weakness(progress: Progress, total: number) {
  return 1 + Math.max(0, 7 - estimateGrade(progress, total)) / 7
}

/** Reparte n entre asignaturas según su peso, sin pasar de las disponibles de cada una. */
function allocate(items: { key: string; weight: number; cap: number }[], n: number) {
  const quota = new Map(items.map(i => [i.key, 0]))
  let left = Math.min(n, items.reduce((t, i) => t + i.cap, 0))
  while (left > 0) {
    const open = items.filter(i => quota.get(i.key)! < i.cap)
    // Siguiente pregunta para la que más lejos esté de su parte proporcional
    const sum = open.reduce((t, i) => t + i.weight, 0)
    const given = open.reduce((t, i) => t + quota.get(i.key)!, 0)
    let best = open[0]
    let bestGap = -Infinity
    for (const i of shuffle(open)) {
      const gap = ((given + 1) * i.weight) / sum - quota.get(i.key)!
      if (gap > bestGap) [best, bestGap] = [i, gap]
    }
    quota.set(best.key, quota.get(best.key)! + 1)
    left--
  }
  return quota
}

/**
 * Repaso general: n preguntas repartidas entre las asignaturas, mezcladas al final.
 * Priorizando, las asignaturas flojas reciben más preguntas y dentro de cada una salen más
 * las nuevas y falladas; si no, el reparto es a partes iguales (simulacro).
 */
export function buildReview(subjects: Subject[], all: AllProgress, n: number, prioritize: boolean): QuizQuestion[] {
  const quota = allocate(
    subjects.map(s => ({
      key: s.name,
      weight: prioritize ? weakness(all[s.name] ?? {}, s.questions.length) : 1,
      cap: s.questions.length,
    })),
    n,
  )
  const picked = subjects.flatMap(s => {
    const k = quota.get(s.name)!
    const p = all[s.name] ?? {}
    const qs = prioritize ? smartSelect(s.questions, p, k) : shuffle(s.questions).slice(0, k)
    return qs.map(toQuiz(s.name))
  })
  return shuffle(picked)
}

/** Plan del día: repasos que tocan y preguntas nuevas para tener todo visto antes del examen. */
export function dailyPlan(subjects: { name: string; total: number; progress: Progress }[], now = Date.now()) {
  const today = startOfDay(now)
  let due = 0, unseen = 0, newToday = 0, doneToday = 0
  for (const s of subjects) {
    let seen = 0
    for (const p of Object.values(s.progress)) {
      if (status(p) === 'new') continue
      seen++
      if (dueAt(p)! <= now) due++
      if ((p.f ?? 0) >= today) newToday++
      if ((p.t ?? 0) >= today) doneToday++
    }
    unseen += Math.max(0, s.total - seen)
  }
  const daysForNew = Math.max(1, daysUntilExam(now) - NEW_BUFFER_DAYS)
  // Se calcula con lo que quedaba al empezar el día para que el objetivo no cambie mientras estudias
  const newTarget = Math.min(unseen + newToday, Math.ceil((unseen + newToday) / daysForNew))
  return { due, unseen, newToday, newTarget, newLeft: Math.max(0, newTarget - newToday), doneToday, daysLeft: daysUntilExam(now) }
}

/** Nuevas repartidas entre asignaturas según lo que les queda y lo mal que van. */
function pickNew(pools: Pool[], n: number, exclude: Set<string>) {
  const unseen = pools.map(p => ({
    pool: p,
    qs: shuffle(p.questions.filter(q => status(p.progress[q.id]) === 'new' && !exclude.has(p.name + ':' + q.id))),
  }))
  const quota = allocate(
    unseen.map(u => ({ key: u.pool.name, weight: u.qs.length * weakness(u.pool.progress, u.pool.questions.length), cap: u.qs.length })),
    n,
  )
  return unseen.flatMap(u => u.qs.slice(0, quota.get(u.pool.name)).map(toQuiz(u.pool.name)))
}

/**
 * Bloque de la sesión diaria: primero las falladas y los repasos que tocan (los de asignaturas
 * flojas antes), más nuevas del objetivo del día. Cumplido el plan, sigue con nuevas
 * (adelantando temario) y después con las menos asentadas.
 */
export function buildDaily(pools: Pool[], now = Date.now(), size = BLOCK_SIZE): QuizQuestion[] {
  const plan = dailyPlan(pools.map(p => ({ name: p.name, total: p.questions.length, progress: p.progress })), now)
  const due: { q: QuizQuestion; key: number }[] = []
  for (const pool of pools) {
    const w = weakness(pool.progress, pool.questions.length)
    for (const q of pool.questions) {
      const d = dueAt(pool.progress[q.id])
      if (d === null || d > now) continue
      // Falladas primero; luego las más atrasadas, adelantando las de asignaturas flojas
      const key = d === 0 ? -1e15 + Math.random() : d - (w - 1) * 3 * DAY + Math.random() * DAY
      due.push({ q: toQuiz(pool.name)(q), key })
    }
  }
  due.sort((a, b) => a.key - b.key)

  // Siempre entra alguna nueva mientras quede objetivo, aunque haya muchos repasos
  const newCount = Math.min(plan.newLeft, Math.max(size - due.length, Math.round(size * 0.3)))
  const block = due.slice(0, size - newCount).map(d => d.q)
  const used = new Set(block.map(q => q.subject + ':' + q.id))
  const add = (qs: QuizQuestion[]) => qs.forEach(q => (block.push(q), used.add(q.subject + ':' + q.id)))
  add(pickNew(pools, newCount, used))
  if (block.length < size) add(pickNew(pools, size - block.length, used))
  if (block.length < size) {
    // Todo visto y nada pendiente: las de menos aciertos seguidos, de asignaturas flojas primero
    const rest = pools
      .flatMap(pool => {
        const w = weakness(pool.progress, pool.questions.length)
        return pool.questions
          .filter(q => !used.has(pool.name + ':' + q.id))
          .map(q => ({ q: toQuiz(pool.name)(q), key: streak(pool.progress[q.id] ?? { c: 0, w: 0 }) - w + Math.random() }))
      })
      .sort((a, b) => a.key - b.key)
    add(rest.slice(0, size - block.length).map(r => r.q))
  }
  return shuffle(block)
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

/** Nota de cada asignatura de un test mixto, ordenadas por nombre. */
export function gradeBySubject(answers: Answer[], mode: Mode) {
  const groups = new Map<string, Answer[]>()
  for (const a of answers) groups.set(a.q.subject, [...(groups.get(a.q.subject) ?? []), a])
  return [...groups]
    .map(([subject, list]) => ({ subject, ...grade(list, mode) }))
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
  failed = Math.min(failed, seen)
  return { total, seen, failed, ok: seen - failed, unseen: total - seen, estimate: estimateGrade(progress, total) }
}

export function record(progress: Progress, id: number, ok: boolean, now = Date.now()): Progress {
  const p = progress[id] ?? { c: 0, w: 0 }
  const first = p.c + p.w === 0 ? now : (p.f ?? 0)
  const next: QStat = ok
    ? { c: p.c + 1, w: p.w, l: true, s: (p.c + p.w ? streak(p) : 0) + 1, t: now, f: first }
    : { c: p.c, w: p.w + 1, l: false, s: 0, t: now, f: first }
  return { ...progress, [id]: next }
}
