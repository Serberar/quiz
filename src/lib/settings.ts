// Ajustes de la cuenta. La fecha del examen está en la tabla user_settings (sincronizada entre
// dispositivos). Sin Supabase se guarda en localStorage. examIso() lee una copia en memoria que
// loadSettings() rellena al entrar, para que quiz.ts pueda seguir usando funciones síncronas.
import { sb } from './supabase'

const DEFAULT_EXAM = '2027-01-28'
const LOCAL_KEY = 'settings_exam_date' // sin prefijo "quiz_": cerrar sesión no lo borra
let exam = DEFAULT_EXAM

/** Fecha del examen en formato AAAA-MM-DD */
export function examIso() {
  return exam
}

/** Fecha del examen a medianoche local */
export function examDate() {
  const [y, m, d] = exam.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export async function loadSettings() {
  if (!sb) {
    exam = localStorage.getItem(LOCAL_KEY) ?? DEFAULT_EXAM
    return
  }
  const { data, error } = await sb.from('user_settings').select('value').eq('key', 'exam_date').maybeSingle()
  if (error) throw error
  if (data) exam = data.value as string
}

export async function setExamIso(iso: string) {
  if (!sb) {
    localStorage.setItem(LOCAL_KEY, iso)
  } else {
    const { error } = await sb.from('user_settings').upsert({ key: 'exam_date', value: iso }, { onConflict: 'user_id,key' })
    if (error) throw error
  }
  exam = iso
}
