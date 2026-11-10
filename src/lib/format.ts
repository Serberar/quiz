import { PASS_GRADE } from './quiz'

/** Nota con una cifra decimal y coma, como en español */
export const fmt = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 1 })

/** Clase de color según la nota: verde a partir de 7, ámbar desde el aprobado */
export const tone = (g: number | null) => (g === null ? 'muted' : g >= 7 ? 'good' : g >= PASS_GRADE ? 'warn' : 'bad')

/** Porcentaje redondeado de una parte sobre un total (0 si no hay total) */
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

/** Día y mes en español, por ejemplo "3 de mayo" */
export const day = (t: number) => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'long' })

/** Texto de un error de Supabase o de JavaScript */
export const messageOf = (err: unknown) => (typeof err === 'object' && err && 'message' in err ? String(err.message) : 'Algo ha fallado.')
