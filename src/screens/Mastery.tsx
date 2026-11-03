/** Barra apilada: acertadas (verde), falladas (rojo), sin ver (fondo) */
export default function Mastery({ total, ok, failed }: { total: number; ok: number; failed: number }) {
  if (!total) return null
  return (
    <div className="meter stacked" role="img" aria-label={`${ok} acertadas, ${failed} falladas de ${total}`}>
      <div className="good" style={{ width: (ok / total) * 100 + '%' }} />
      <div className="bad" style={{ width: (failed / total) * 100 + '%' }} />
    </div>
  )
}

