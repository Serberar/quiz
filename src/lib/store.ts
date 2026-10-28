// Persistencia: localStorage siempre (funciona sin conexión) y Supabase si hay sesión.
// Progreso: gana el servidor al cargar, salvo que haya cambios locales sin subir.
// Intentos: se guardan en local y se suben con un id propio, así reintentar no duplica.
import type { Mode, Progress } from './quiz'
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

const progressKey = (subject: string) => 'quiz_' + subject // misma clave que la versión anterior: se conserva el progreso
const DIRTY = 'quiz_dirty'
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

function setDirty(subject: string, dirty: boolean) {
  const set = new Set(read<string[]>(DIRTY, []))
  if (dirty) set.add(subject)
  else set.delete(subject)
  write(DIRTY, [...set])
}

async function pushProgress(subject: string, data: Progress) {
  if (!sb) return
  const { error } = await sb
    .from('progress')
    .upsert({ subject, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,subject' })
  if (error) throw error
  setDirty(subject, false)
}

export async function loadProgress(subject: string): Promise<Progress> {
  const local = read<Progress>(progressKey(subject), {})
  if (!sb) return local
  try {
    if (read<string[]>(DIRTY, []).includes(subject)) {
      await pushProgress(subject, local)
      return local
    }
    const { data, error } = await sb.from('progress').select('data').eq('subject', subject).maybeSingle()
    if (error) throw error
    if (!data) {
      // Primera vez en el servidor: sube lo que hubiera en este navegador
      await pushProgress(subject, local)
      return local
    }
    write(progressKey(subject), data.data)
    return data.data as Progress
  } catch {
    return local // sin conexión: se trabaja en local y se sube en la próxima carga
  }
}

export function saveProgress(subject: string, progress: Progress) {
  write(progressKey(subject), progress)
  if (!sb) return
  setDirty(subject, true)
  pushProgress(subject, progress).catch(() => {})
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
