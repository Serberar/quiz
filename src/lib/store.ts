// Persistencia. Con sesión, Supabase es la fuente de verdad:
// - Cada respuesta es una fila de "answers" (solo se insertan), así varios dispositivos no se pisan.
// - El progreso = base antigua de "progress" + agregado de "answers" (vista question_stats).
// localStorage es solo caché para ver el progreso al instante y cola de lo que falta por subir
// (para poder estudiar sin conexión). Sin Supabase, localStorage es el único almacenamiento.
import { record, type Mode, type Progress, type QStat } from './quiz'
import { sb } from './supabase'

export type Attempt = {
  id: string
  subject: string
  mode: Mode
  total: number
  correct: number
  wrong: number
  skipped: number
  grade: number
  created_at: string
  /** nota de cada asignatura en tests mixtos */
  details?: { subject: string; total: number; correct: number; wrong: number; skipped: number; grade: number }[] | null
}

type PendingAnswer = { id: string; subject: string; question_id: number; ok: boolean; created_at: string }

/** Sin conexión lo pendiente se queda en el dispositivo y se reintenta; aquí solo se deja constancia. */
export const logError = (err: unknown) => console.warn('Sincronización pendiente:', err)

const progressKey = (subject: string) => 'quiz_' + subject // misma clave que la versión anterior
const LEGACY_DIRTY = 'quiz_dirty' // versión anterior: asignaturas con progreso sin subir
const OUTBOX = 'quiz_outbox'
const ATTEMPTS = 'quiz_attempts'
const UNSYNCED = 'quiz_unsynced'
const FLAGS = 'quiz_flags'
const FLAGS_PENDING = 'quiz_flags_pending'
const PAGE = 1000

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))

const pendingFor = (subject: string) => read<PendingAnswer[]>(OUTBOX, []).filter(a => a.subject === subject)

/** Sube las respuestas pendientes. Es idempotente: reintentar no duplica. */
export async function flushAnswers() {
  const pending = read<PendingAnswer[]>(OUTBOX, [])
  if (!sb || pending.length === 0) return
  const { error } = await sb.from('answers').upsert(pending, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw error
  const done = new Set(pending.map(a => a.id))
  write(OUTBOX, read<PendingAnswer[]>(OUTBOX, []).filter(a => !done.has(a.id)))
}

/**
 * Versión anterior: si quedó progreso sin subir, se sube una vez como base. Se descuentan las
 * respuestas que ya están en la cola nueva para no contarlas dos veces.
 */
async function uploadLegacy(subject: string) {
  if (!sb || !read<string[]>(LEGACY_DIRTY, []).includes(subject)) return
  let base = read<Progress>(progressKey(subject), {})
  for (const a of pendingFor(subject)) {
    const p = base[a.question_id]
    if (p) base = { ...base, [a.question_id]: a.ok ? { ...p, c: Math.max(0, p.c - 1) } : { ...p, w: Math.max(0, p.w - 1) } }
  }
  const { error } = await sb
    .from('progress')
    .upsert({ subject, data: base, updated_at: new Date().toISOString() }, { onConflict: 'user_id,subject' })
  if (error) throw error
  write(LEGACY_DIRTY, read<string[]>(LEGACY_DIRTY, []).filter(s => s !== subject))
}

export async function loadProgress(subject: string): Promise<Progress> {
  const local = read<Progress>(progressKey(subject), {})
  if (!sb) return local
  try {
    await uploadLegacy(subject)
    await flushAnswers().catch(logError) // si falla, lo pendiente se suma abajo desde la cola
    const [base, stats] = await Promise.all([
      sb.from('progress').select('data').eq('subject', subject).maybeSingle(),
      // Una fila por pregunta: cabe en el límite de 1000 filas de Supabase (la mayor asignatura tiene 540)
      sb.from('question_stats').select('question_id,c,w,l,s,t,f').eq('subject', subject),
    ])
    if (base.error) throw base.error
    if (stats.error) throw stats.error

    const progress: Progress = { ...((base.data?.data as Progress | undefined) ?? {}) }
    type Row = { question_id: number; c: number; w: number; l: boolean; s: number; t: string; f: string }
    for (const r of stats.data as Row[]) {
      const p: QStat | undefined = progress[r.question_id]
      progress[r.question_id] = {
        c: (p?.c ?? 0) + r.c,
        w: (p?.w ?? 0) + r.w,
        l: r.l,
        s: r.s,
        t: Date.parse(r.t),
        f: p && p.c + p.w > 0 ? 0 : Date.parse(r.f), // vista antes de guardarse respuestas: antigua
      }
    }
    // Lo que aún no se ha podido subir (sin conexión) se suma encima
    let merged = progress
    for (const a of pendingFor(subject)) merged = record(merged, a.question_id, a.ok, Date.parse(a.created_at))
    write(progressKey(subject), merged)
    return merged
  } catch {
    return local // sin conexión: se usa la caché, que ya incluye lo pendiente
  }
}

/** Guarda una respuesta. `next` es el progreso ya actualizado (para la caché). */
export function saveAnswer(subject: string, questionId: number, ok: boolean, next: Progress) {
  write(progressKey(subject), next)
  if (!sb) return
  const a: PendingAnswer = { id: crypto.randomUUID(), subject, question_id: questionId, ok, created_at: new Date().toISOString() }
  write(OUTBOX, [...read<PendingAnswer[]>(OUTBOX, []), a])
  flushAnswers().catch(logError)
}

/** Borra el progreso de una asignatura en todos los dispositivos. Con Supabase necesita conexión. */
export async function resetProgress(subject: string) {
  if (sb) {
    const [answers, base] = await Promise.all([
      sb.from('answers').delete().eq('subject', subject),
      sb.from('progress').delete().eq('subject', subject),
    ])
    if (answers.error) throw answers.error
    if (base.error) throw base.error
    write(OUTBOX, read<PendingAnswer[]>(OUTBOX, []).filter(a => a.subject !== subject))
    write(LEGACY_DIRTY, read<string[]>(LEGACY_DIRTY, []).filter(s => s !== subject))
  }
  write(progressKey(subject), {})
}

export function addAttempt(a: Omit<Attempt, 'id' | 'created_at'>) {
  const attempt: Attempt = { ...a, id: crypto.randomUUID(), created_at: new Date().toISOString() }
  write(ATTEMPTS, [...read<Attempt[]>(ATTEMPTS, []), attempt])
  if (!sb) return
  write(UNSYNCED, [...read<string[]>(UNSYNCED, []), attempt.id])
  flushAttempts().catch(logError)
}

export async function flushAttempts() {
  const ids = new Set(read<string[]>(UNSYNCED, []))
  if (!sb || ids.size === 0) return
  const pending = read<Attempt[]>(ATTEMPTS, []).filter(a => ids.has(a.id))
  const { error } = await sb.from('attempts').upsert(pending, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw error
  const done = new Set(pending.map(a => a.id))
  write(UNSYNCED, read<string[]>(UNSYNCED, []).filter(id => !done.has(id)))
}

/** Historial completo, del más antiguo al más reciente. */
export async function loadAttempts(): Promise<Attempt[]> {
  const local = read<Attempt[]>(ATTEMPTS, [])
  if (!sb) return local
  try {
    await flushAttempts()
    // Supabase devuelve como mucho 1000 filas por consulta: se pide por páginas
    const rows: Attempt[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from('attempts')
        .select('id,subject,mode,total,correct,wrong,skipped,grade,created_at,details')
        .order('created_at')
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw error
      rows.push(...(data as Attempt[]))
      if (data.length < PAGE) break
    }
    // grade es numeric en Postgres: se normaliza a number
    return rows.map(a => ({ ...a, grade: Number(a.grade) }))
  } catch {
    return local
  }
}

// Dudosas. Clave "asignatura:id". Los cambios sin subir se guardan aparte y se aplican encima
// de lo que diga el servidor hasta que se suben.
const flagKey = (subject: string, id: number) => subject + ':' + id

export async function flushFlags() {
  const pending = read<Record<string, boolean>>(FLAGS_PENDING, {})
  if (!sb || Object.keys(pending).length === 0) return
  for (const [key, on] of Object.entries(pending)) {
    const f = parseFlag(key)
    const row = { subject: f.subject, question_id: f.id }
    const { error } = on
      ? await sb.from('flags').upsert(row, { onConflict: 'user_id,subject,question_id', ignoreDuplicates: true })
      : await sb.from('flags').delete().eq('subject', row.subject).eq('question_id', row.question_id)
    if (error) throw error
    const left = read<Record<string, boolean>>(FLAGS_PENDING, {})
    if (left[key] === on) delete left[key] // si se ha vuelto a cambiar mientras tanto, se queda
    write(FLAGS_PENDING, left)
  }
}

export async function loadFlags(): Promise<Set<string>> {
  const local = new Set(read<string[]>(FLAGS, []))
  if (!sb) return local
  try {
    await flushFlags().catch(logError)
    const { data, error } = await sb.from('flags').select('subject,question_id')
    if (error) throw error
    const set = new Set(data.map(r => flagKey(r.subject, r.question_id)))
    for (const [key, on] of Object.entries(read<Record<string, boolean>>(FLAGS_PENDING, {}))) {
      if (on) set.add(key)
      else set.delete(key)
    }
    write(FLAGS, [...set])
    return set
  } catch {
    return local
  }
}

const FLAGS_EVENT = 'quiz-flags'

/** Avisa de cada cambio de dudosas (para que todas las pantallas muestren lo mismo). Devuelve la baja. */
export function onFlagsChange(cb: (flags: Set<string>) => void) {
  const handler = () => cb(new Set(read<string[]>(FLAGS, [])))
  window.addEventListener(FLAGS_EVENT, handler)
  return () => window.removeEventListener(FLAGS_EVENT, handler)
}

export function setFlag(subject: string, id: number, on: boolean) {
  const next = new Set(read<string[]>(FLAGS, []))
  if (on) next.add(flagKey(subject, id))
  else next.delete(flagKey(subject, id))
  write(FLAGS, [...next])
  window.dispatchEvent(new Event(FLAGS_EVENT))
  if (sb) {
    write(FLAGS_PENDING, { ...read<Record<string, boolean>>(FLAGS_PENDING, {}), [flagKey(subject, id)]: on })
    flushFlags().catch(logError)
  }
}

/** Separa una clave "asignatura:id" */
export function parseFlag(key: string) {
  const i = key.lastIndexOf(':')
  return { subject: key.slice(0, i), id: Number(key.slice(i + 1)) }
}

/** Ids marcados de una asignatura */
export function flaggedIds(flags: Set<string>, subject: string) {
  const ids = new Set<number>()
  for (const key of flags) if (key.startsWith(subject + ':')) ids.add(Number(key.slice(subject.length + 1)))
  return ids
}

/** Días seguidos con algún test terminado, contando hasta hoy (o hasta ayer si hoy aún no). */
export function studyStreak(attempts: Attempt[], now = new Date()) {
  const days = new Set(attempts.map(a => new Date(a.created_at).toDateString()))
  const d = new Date(now)
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(d.toDateString())) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/**
 * Antes de cerrar sesión: sube lo pendiente y borra los datos locales, para que otra cuenta en
 * este navegador no herede (ni suba) el progreso. Devuelve false si queda algo sin subir.
 */
export async function prepareSignOut(force = false) {
  try {
    await Promise.all([flushAnswers(), flushAttempts(), flushFlags()])
    for (const subject of read<string[]>(LEGACY_DIRTY, [])) await uploadLegacy(subject)
  } catch {
    if (!force) return false
  }
  for (const key of Object.keys(localStorage)) if (key.startsWith('quiz_')) localStorage.removeItem(key)
  return true
}
