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
}

type PendingAnswer = { id: string; subject: string; question_id: number; ok: boolean; created_at: string }

const progressKey = (subject: string) => 'quiz_' + subject // misma clave que la versión anterior
const LEGACY_DIRTY = 'quiz_dirty' // versión anterior: asignaturas con progreso sin subir
const OUTBOX = 'quiz_outbox'
const ATTEMPTS = 'quiz_attempts'
const UNSYNCED = 'quiz_unsynced'

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
    await flushAnswers().catch(() => {}) // si falla, lo pendiente se suma abajo desde la cola
    const [base, stats] = await Promise.all([
      sb.from('progress').select('data').eq('subject', subject).maybeSingle(),
      sb.from('question_stats').select('question_id,c,w,l').eq('subject', subject),
    ])
    if (base.error) throw base.error
    if (stats.error) throw stats.error

    const progress: Progress = { ...((base.data?.data as Progress | undefined) ?? {}) }
    for (const s of stats.data as { question_id: number; c: number; w: number; l: boolean }[]) {
      const p: QStat = progress[s.question_id] ?? { c: 0, w: 0 }
      progress[s.question_id] = { c: p.c + s.c, w: p.w + s.w, l: s.l }
    }
    // Lo que aún no se ha podido subir (sin conexión) se suma encima
    let merged = progress
    for (const a of pendingFor(subject)) merged = record(merged, a.question_id, a.ok)
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
  flushAnswers().catch(() => {})
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
  flushAttempts().catch(() => {})
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
    const { data, error } = await sb
      .from('attempts')
      .select('id,subject,mode,total,correct,wrong,skipped,grade,created_at')
      .order('created_at')
    if (error) throw error
    // grade es numeric en Postgres: se normaliza a number
    return data.map(a => ({ ...a, grade: Number(a.grade) }) as Attempt)
  } catch {
    return local
  }
}
