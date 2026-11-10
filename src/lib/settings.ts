// Ajustes de la cuenta, guardados en la tabla user_settings (clave/valor). Sin Supabase se guardan
// en localStorage. Las funciones síncronas leen una copia en memoria que loadSettings() rellena al
// entrar, para que quiz.ts y data.ts no tengan que esperar.
import { sb } from './supabase'

type Values = { exam_date: string; hidden_subjects: string[] }
const cache: Values = { exam_date: '2027-01-28', hidden_subjects: [] }

/** Fecha del examen en formato AAAA-MM-DD */
export function examIso() {
  return cache.exam_date
}

/** Fecha del examen a medianoche local */
export function examDate() {
  const [y, m, d] = cache.exam_date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Asignaturas del temario ocultas en esta cuenta (el archivo sigue en el repositorio) */
export function hiddenSubjects() {
  return cache.hidden_subjects
}

const localKey = (key: keyof Values) => 'settings_' + key // sin "quiz_": cerrar sesión no lo borra

export async function loadSettings() {
  if (!sb) {
    for (const key of Object.keys(cache) as (keyof Values)[]) {
      const raw = localStorage.getItem(localKey(key))
      if (raw !== null) Object.assign(cache, { [key]: JSON.parse(raw) })
    }
    return
  }
  const { data, error } = await sb.from('user_settings').select('key,value')
  if (error) throw error
  for (const row of data) if (row.key in cache) Object.assign(cache, { [row.key]: row.value })
}

async function save<K extends keyof Values>(key: K, value: Values[K]) {
  if (!sb) {
    localStorage.setItem(localKey(key), JSON.stringify(value))
  } else {
    const { error } = await sb.from('user_settings').upsert({ key, value }, { onConflict: 'user_id,key' })
    if (error) throw error
  }
  cache[key] = value
}

export const setExamIso = (iso: string) => save('exam_date', iso)
export const setHiddenSubjects = (list: string[]) => save('hidden_subjects', list)
