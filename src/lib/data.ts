export type Question = {
  id: number
  unit?: string
  question: string
  options: string[]
  correct: string
  explicacion?: string
  traduccion?: { pregunta: string; opciones: string[]; correcta: string }
}

export type SubjectMeta = { name: string; file: string; semester: number; count: number }
export type Subject = { name: string; questions: Question[] }

const DATA = import.meta.env.BASE_URL + 'data/'

async function getJSON<T>(file: string): Promise<T> {
  // no-cache: revalida con el servidor para que una asignatura nueva aparezca sin esperar
  const r = await fetch(DATA + file, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
  return r.json()
}

export async function fetchManifest(): Promise<SubjectMeta[]> {
  return (await getJSON<{ subjects: SubjectMeta[] }>('manifest.json')).subjects
}

export async function fetchSubject(meta: SubjectMeta): Promise<Subject> {
  const data = await getJSON<{ subject?: string; questions: Question[] }>(meta.file)
  return { name: data.subject ?? meta.name, questions: data.questions }
}
