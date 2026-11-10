import { getCustom, listCustom } from './custom'
import { hiddenSubjects } from './settings'

export type Question = {
  id: number
  unit?: string
  question: string
  options: string[]
  correct: string
  explicacion?: string
  traduccion?: { pregunta: string; opciones: string[]; correcta: string }
}

export type SubjectMeta = { name: string; file: string; count: number; custom?: boolean }
export type Subject = { name: string; questions: Question[] }

const DATA = import.meta.env.BASE_URL + 'data/'
/** Prefijo de `file` en las asignaturas añadidas desde la app (no están en public/data) */
const CUSTOM = 'custom:'

async function getJSON<T>(file: string): Promise<T> {
  // no-cache: revalida con el servidor para que una asignatura nueva aparezca sin esperar
  const r = await fetch(DATA + file, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
  return r.json()
}

/** Asignaturas de public/data (menos las ocultas) más las añadidas desde Ajustes */
export async function fetchManifest(): Promise<SubjectMeta[]> {
  const [base, custom] = await Promise.all([
    getJSON<{ subjects: SubjectMeta[] }>('manifest.json').then(m => m.subjects),
    listCustom().catch(() => []),
  ])
  const hidden = hiddenSubjects()
  return [
    ...base.filter(m => !hidden.includes(m.name)),
    ...custom.map(c => ({ name: c.name, file: CUSTOM + c.name, count: c.count, custom: true })),
  ]
}

export async function fetchSubject(meta: SubjectMeta): Promise<Subject> {
  if (meta.file.startsWith(CUSTOM)) return getCustom(meta.name)
  const data = await getJSON<{ subject?: string; questions: Question[] }>(meta.file)
  return { name: data.subject ?? meta.name, questions: data.questions }
}
