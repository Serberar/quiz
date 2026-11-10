// Asignaturas añadidas desde la app. Con sesión van a la tabla custom_subjects (sincronizada entre
// dispositivos); sin Supabase, a localStorage.
import type { Question, Subject } from './data'
import { sb } from './supabase'

export type CustomMeta = { name: string; count: number }

const LOCAL = 'custom_subjects'

function localAll(): Record<string, Subject> {
  return JSON.parse(localStorage.getItem(LOCAL) ?? '{}')
}

/** Valida un JSON de asignatura. Lanza un Error con el motivo en español. */
export function parseSubject(text: string, fileName: string): Subject {
  let raw: { subject?: unknown; questions?: unknown }
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('El archivo no es un JSON válido.')
  }
  const list: unknown = raw.questions
  if (!Array.isArray(list) || list.length === 0) throw new Error('Falta "questions" con al menos una pregunta.')
  const ids = new Set<number>()
  const questions = (list as Question[]).map((q, i) => {
    const where = `Pregunta ${i + 1}`
    if (!Number.isInteger(q.id) || ids.has(q.id)) throw new Error(`${where}: "id" debe ser un número entero y no repetido.`)
    ids.add(q.id)
    if (typeof q.question !== 'string' || !q.question.trim()) throw new Error(`${where}: falta "question".`)
    if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(o => typeof o === 'string'))
      throw new Error(`${where}: "options" necesita al menos 2 textos.`)
    if (!q.options.includes(q.correct)) throw new Error(`${where}: "correct" debe ser exactamente una de las opciones.`)
    return q
  })
  const name = typeof raw.subject === 'string' && raw.subject.trim() ? raw.subject.trim() : fileName.replace(/\.json$/i, '')
  return { name, questions }
}

export async function listCustom(): Promise<CustomMeta[]> {
  if (!sb) return Object.values(localAll()).map(s => ({ name: s.name, count: s.questions.length }))
  const { data, error } = await sb.from('custom_subjects').select('name,count').order('name')
  if (error) throw error
  return data
}

export async function getCustom(name: string): Promise<Subject> {
  if (!sb) {
    const s = localAll()[name]
    if (!s) throw new Error(`No existe la asignatura "${name}".`)
    return s
  }
  const { data, error } = await sb.from('custom_subjects').select('data').eq('name', name).single()
  if (error) throw error
  return data.data as Subject
}

export async function addCustom(s: Subject) {
  if (!sb) {
    localStorage.setItem(LOCAL, JSON.stringify({ ...localAll(), [s.name]: s }))
    return
  }
  const { error } = await sb.from('custom_subjects').insert({ name: s.name, count: s.questions.length, data: s })
  if (error) throw error
}

export async function removeCustom(name: string) {
  if (!sb) {
    const all = localAll()
    delete all[name]
    localStorage.setItem(LOCAL, JSON.stringify(all))
    return
  }
  const { error } = await sb.from('custom_subjects').delete().eq('name', name)
  if (error) throw error
}
