import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

// Sin configuración la app funciona solo en local: sin login y con el progreso en localStorage
export const sb = url && key ? createClient(url, key) : null
