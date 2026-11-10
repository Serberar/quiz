import type { Question, Subject } from './data'
import { examDate } from './settings'

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
/** Preguntas de cada asignatura en un bloque de Estudiar */
export const PER_SUBJECT = 5
export const PASS_GRADE = 5
/** Las preguntas nuevas se planifican para estar vistas 2 semanas antes del examen. */
const NEW_BUFFER_DAYS = 14
/** Respuestas que necesita de media cada pregunta antes del examen: la primera y unos 5 repasos */
const ANSWERS_PER_QUESTION = 6
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
export function dueAt(p: QStat | undefined, exam: number): number | null {
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

export function daysUntilExam(now: number, exam: number) {
  return Math.max(0, Math.round((exam - startOfDay(now)) / DAY))
}

export function filterQuestions(questions: Question[], progress: Progress, filter: Filter, flagged?: Set<number>): Question[] {
  if (filter === 'all') return questions
  if (filter === 'flagged') return questions.filter(q => flagged?.has(q.id))
  return questions.filter(q => status(progress[q.id]) === filter)
}

/**
 * Elige n preguntas sin repetir, con más probabilidad las nunca vistas, las falladas y las de temas
 * flojos. `all` son todas las preguntas de la asignatura, para medir los temas aunque se filtre.
 */
export function smartSelect(questions: Question[], progress: Progress, n: number, all: Question[] = questions): Question[] {
  const units = unitWeights(all, progress)
  const weighted: Question[] = []
  for (const q of questions) {
    const p = progress[q.id]
    const s = status(p)
    const ratio = p && p.c + p.w ? p.w / (p.c + p.w) : 0
    const base = s === 'new' ? 4 : s === 'failed' ? 5 + Math.round(ratio * 3) : 1 + Math.round(ratio * 3)
    const w = Math.max(1, Math.round(base * (units.get(q.unit ?? '') ?? 1)))
    for (let i = 0; i < w; i++) weighted.push(q)
  }
  const picked = new Map<number, Question>()
  for (const q of shuffle(weighted)) {
    if (picked.size >= n) break
    picked.set(q.id, q)
  }
  return [...picked.values()]
}

/**
 * Peso de cada tema (unidad) de 1 a 3: sube con la proporción de falladas entre lo visto y,
 * un poco, con lo que queda por ver. Así salen más los temas flojos dentro de cada asignatura.
 */
export function unitWeights(questions: Question[], progress: Progress) {
  const acc = new Map<string, { total: number; seen: number; failed: number }>()
  for (const q of questions) {
    const u = acc.get(q.unit ?? '') ?? { total: 0, seen: 0, failed: 0 }
    const s = status(progress[q.id])
    acc.set(q.unit ?? '', { total: u.total + 1, seen: u.seen + (s === 'new' ? 0 : 1), failed: u.failed + (s === 'failed' ? 1 : 0) })
  }
  const weights = new Map<string, number>()
  for (const [unit, u] of acc) {
    const failRate = u.seen ? u.failed / u.seen : 0
    weights.set(unit, 1 + failRate * 1.5 + (1 - u.seen / u.total) * 0.5)
  }
  return weights
}

/** Temas con más falladas (de los que se han visto al menos 5 preguntas), peor primero. */
export function weakUnits(subjects: { name: string; questions: Question[]; progress: Progress }[], limit = 5) {
  const rows: { subject: string; unit: string; seen: number; failed: number; rate: number }[] = []
  for (const s of subjects) {
    const acc = new Map<string, { seen: number; failed: number }>()
    for (const q of s.questions) {
      if (!q.unit) continue
      const st = status(s.progress[q.id])
      if (st === 'new') continue
      const u = acc.get(q.unit) ?? { seen: 0, failed: 0 }
      acc.set(q.unit, { seen: u.seen + 1, failed: u.failed + (st === 'failed' ? 1 : 0) })
    }
    for (const [unit, u] of acc) if (u.seen >= 5 && u.failed > 0) rows.push({ subject: s.name, unit, ...u, rate: u.failed / u.seen })
  }
  return rows.sort((a, b) => b.rate - a.rate || b.failed - a.failed).slice(0, limit)
}

/** Posición de cada tema en el temario (orden en que aparece en la asignatura). */
function unitOrder(questions: Question[]) {
  const order = new Map<string, number>()
  for (const q of questions) if (!order.has(q.unit ?? '')) order.set(q.unit ?? '', order.size)
  return order
}

/** Ordena por tema según el temario; dentro de cada tema, al azar. */
function byUnit<T>(items: T[], unitIndex: (x: T) => number): T[] {
  return shuffle(items).sort((a, b) => unitIndex(a) - unitIndex(b))
}

const toQuiz = (subject: string) => (q: Question): QuizQuestion => ({ ...q, subject, shuffled: shuffle(q.options) })

export function buildQuiz(subject: string, questions: Question[], progress: Progress, mode: Mode, n: number, all: Question[] = questions): QuizQuestion[] {
  const count = Math.min(mode === 'exam' ? EXAM_SIZE : n, questions.length)
  const base = mode === 'smart' ? smartSelect(questions, progress, count, all) : shuffle(questions).slice(0, count)
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
export function dailyPlan(
  subjects: { name: string; total: number; progress: Progress }[],
  now = Date.now(),
  exam = examDate().getTime(),
) {
  const today = startOfDay(now)
  let due = 0, unseen = 0, newToday = 0, doneToday = 0, work = 0
  for (const s of subjects) {
    let seen = 0
    for (const p of Object.values(s.progress)) {
      if (status(p) === 'new') continue
      seen++
      const isDue = dueAt(p, exam)! <= now
      if (isDue) due++
      // Lo que le falta a esta pregunta; si toca repasarla, al menos esa respuesta
      work += Math.max(isDue ? 1 : 0, ANSWERS_PER_QUESTION - p.c - p.w)
      if ((p.f ?? 0) >= today) newToday++
      if ((p.t ?? 0) >= today) doneToday++
    }
    unseen += Math.max(0, s.total - seen)
  }
  work += unseen * ANSWERS_PER_QUESTION
  // Preguntas al día para llegar al examen con todo visto y repasado; cuenta las de hoy para que no cambie mientras estudias
  const perDay = Math.ceil((work + doneToday) / Math.max(1, daysUntilExam(now, exam)))
  const daysForNew = Math.max(1, daysUntilExam(now, exam) - NEW_BUFFER_DAYS)
  // Se calcula con lo que quedaba al empezar el día para que el objetivo no cambie mientras estudias
  const newTarget = Math.min(unseen + newToday, Math.ceil((unseen + newToday) / daysForNew))
  return { due, unseen, newToday, newTarget, newLeft: Math.max(0, newTarget - newToday), doneToday, perDay, leftToday: Math.max(0, perDay - doneToday), daysLeft: daysUntilExam(now, exam) }
}

/**
 * Parte del temario que debería estar ya dominada para acabarlo NEW_BUFFER_DAYS antes del examen,
 * a ritmo constante desde el primer día de estudio (contando hoy). null si aún no se ha empezado.
 */
export function expectedProgress(firstAt: number | null, now = Date.now(), exam = examDate().getTime()) {
  if (firstAt === null) return null
  const start = startOfDay(firstAt)
  const end = exam - NEW_BUFFER_DAYS * DAY
  if (end <= start) return 1
  return Math.min(1, Math.max(0, (startOfDay(now) + DAY - start) / (end - start)))
}

/** Nuevas de una asignatura sin ver, tema a tema en el orden del temario (al azar dentro de cada tema). */
function freshOf(p: Pool, exclude: Set<string>) {
  const order = unitOrder(p.questions)
  const fresh = p.questions.filter(q => status(p.progress[q.id]) === 'new' && !exclude.has(p.name + ':' + q.id))
  return byUnit(fresh, q => order.get(q.unit ?? '')!).map(toQuiz(p.name))
}

/** Repasos que tocan en una asignatura: falladas primero, luego las más atrasadas (antes las de temas flojos). */
function dueOf(p: Pool, now: number, exam: number) {
  const units = unitWeights(p.questions, p.progress)
  const due: { q: QuizQuestion; key: number }[] = []
  for (const q of p.questions) {
    const d = dueAt(p.progress[q.id], exam)
    if (d === null || d > now) continue
    const uw = units.get(q.unit ?? '') ?? 1
    const key = d === 0 ? -1e15 + Math.random() : d - (uw - 1) * 2 * DAY + Math.random() * DAY
    due.push({ q: toQuiz(p.name)(q), key })
  }
  return due.sort((a, b) => a.key - b.key)
}

/**
 * Bloque de la sesión diaria: el mismo número de preguntas de cada asignatura. En cada una, como
 * mucho la mitad son repasos (falladas primero) y el resto temario nuevo en orden; si a una no le
 * queda nada, su hueco lo cubren repasos y nuevas de las demás y, con todo al día, las menos asentadas.
 */
export function buildDaily(pools: Pool[], now = Date.now(), perSubject = PER_SUBJECT, exam = examDate().getTime()): QuizQuestion[] {
  const size = perSubject * pools.length
  const block: QuizQuestion[] = []
  const used = new Set<string>()
  const add = (qs: QuizQuestion[]) => qs.forEach(q => (block.push(q), used.add(q.subject + ':' + q.id)))
  const due = pools.map(p => dueOf(p, now, exam))
  pools.forEach((p, i) => {
    const fresh = freshOf(p, used)
    const nNew = Math.min(fresh.length, perSubject - Math.min(Math.floor(perSubject / 2), due[i].length))
    add(due[i].slice(0, perSubject - nNew).map(d => d.q))
    add(fresh.slice(0, nNew))
  })
  if (block.length < size) {
    const rest = due.flat().filter(d => !used.has(d.q.subject + ':' + d.q.id)).sort((a, b) => a.key - b.key)
    add(rest.slice(0, size - block.length).map(d => d.q))
  }
  for (const p of pools) if (block.length < size) add(freshOf(p, used).slice(0, size - block.length))
  if (block.length < size) {
    // Todo visto y nada pendiente: se sigue repasando, 5 de cada asignatura, las menos asentadas
    // (menos aciertos seguidos) primero y al azar entre las igual de asentadas
    const rest = pools.map(pool =>
      pool.questions
        .filter(q => !used.has(pool.name + ':' + q.id))
        .map(q => ({ q: toQuiz(pool.name)(q), key: streak(pool.progress[q.id] ?? { c: 0, w: 0 }) + Math.random() }))
        .sort((a, b) => a.key - b.key)
        .map(r => r.q),
    )
    pools.forEach((p, i) => add(rest[i].slice(0, Math.max(0, perSubject - block.filter(q => q.subject === p.name).length))))
    if (block.length < size) add(rest.flat().filter(q => !used.has(q.subject + ':' + q.id)).slice(0, size - block.length))
  }
  // Agrupadas por asignatura y tema (repasos junto a las nuevas del mismo tema) para no saltar de un tema a otro
  const subjects = new Map(pools.map((p, i) => [p.name, { i, order: unitOrder(p.questions) }]))
  const pos = (q: QuizQuestion) => {
    const s = subjects.get(q.subject)!
    return s.i * 1e4 + s.order.get(q.unit ?? '')!
  }
  return byUnit(block, pos)
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

export type Level = 'good' | 'warn' | 'bad'

/**
 * ¿Cómo voy? Tres indicadores con su nivel:
 * - ritmo: nuevas al día (media de 7 días) frente a las que pide el plan,
 * - retención: de lo visto, cuánto se acertó la última vez,
 * - repasos atrasados: frente a lo que se hace en un día.
 * Veredicto: bien sin ningún "mal" y como mucho un "justo"; mal con dos o más "mal".
 */
export function assess(subjects: { name: string; total: number; progress: Progress }[], now = Date.now(), exam = examDate().getTime()) {
  const plan = dailyPlan(subjects, now, exam)
  const week = now - 7 * DAY
  let total = 0, seen = 0, ok = 0, newWeek = 0
  for (const s of subjects) {
    total += s.total
    for (const p of Object.values(s.progress)) {
      const st = status(p)
      if (st === 'new') continue
      seen++
      if (st === 'ok') ok++
      if ((p.f ?? 0) >= week) newWeek++
    }
  }
  seen = Math.min(seen, total)
  const perDay = Math.round((newWeek / 7) * 10) / 10
  const needed = Math.max(1, plan.newTarget)
  const retention = seen ? ok / seen : 0
  /** Día en que se habrá visto todo al ritmo actual (null si el ritmo es 0) */
  const finishAt = plan.unseen === 0 ? now : perDay > 0 ? startOfDay(now) + Math.ceil(plan.unseen / perDay) * DAY : null
  const deadline = exam - NEW_BUFFER_DAYS * DAY

  const pace: Level = plan.unseen === 0 || perDay >= needed ? 'good' : perDay >= needed * 0.6 ? 'warn' : 'bad'
  const memory: Level = seen < 20 ? 'warn' : retention >= 0.75 ? 'good' : retention >= 0.6 ? 'warn' : 'bad'
  const backlog: Level = plan.due <= needed * 2 ? 'good' : plan.due <= needed * 6 ? 'warn' : 'bad'
  const levels = [pace, memory, backlog]
  const bads = levels.filter(l => l === 'bad').length
  const warns = levels.filter(l => l === 'warn').length
  const verdict: Level = bads === 0 && warns <= 1 ? 'good' : bads >= 2 ? 'bad' : 'warn'

  return { verdict, pace, memory, backlog, perDay, needed, retention, seen, total, finishAt, deadline, plan }
}
