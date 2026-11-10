import { LoaderCircle, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MODE_LABEL } from '../lib/quiz'
import { fmt, tone } from '../lib/format'
import { loadAttempts, type Attempt } from '../lib/store'
import HowAmI from './HowAmI'




export default function Metrics() {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null)

  useEffect(() => {
    // Los bloques diarios se guardaron como "Hoy" en la primera versión
    loadAttempts().then(list => setAttempts(list.map(a => (a.subject === 'Hoy' ? { ...a, subject: 'Sesión diaria' } : a))))
  }, [])

  if (!attempts) {
    return (
      <p className="muted center">
        <LoaderCircle className="spin" size={20} />
      </p>
    )
  }

  const recent = attempts.slice(-7).reverse()


  // Nota de cada asignatura en los repasos generales (simulacros), del más antiguo al más reciente
  const evolution = new Map<string, number[]>()
  for (const a of attempts) {
    if (a.mode !== 'exam' || !a.details) continue
    for (const d of a.details) evolution.set(d.subject, [...(evolution.get(d.subject) ?? []), d.grade])
  }
  const evo = [...evolution].sort(([a], [b]) => a.localeCompare(b, 'es'))

  return (
    <>
      <header className="page-head">
        <h1>Métricas</h1>
      </header>

      {attempts.length === 0 ? (
        <>
          <p className="muted center">Cuando termines tests aquí verás tu historial y tu evolución.</p>
          <HowAmI attempts={attempts} />
        </>
      ) : (
        <>
          <HowAmI attempts={attempts} />

          <div className="metrics-grid">
          {evo.length > 0 && (
            <section className="card">
              <h2>Repasos generales · nota por asignatura</h2>
              {evo.map(([name, grades]) => {
                const last = grades.at(-1)!
                const diff = grades.length > 1 ? last - grades.at(-2)! : 0
                return (
                  <div key={name} className="subject-row">
                    <div className="grow">
                      <div className="list-title">{name}</div>
                      <div className="grade-trail">
                        {grades.slice(-6).map((g, i) => (
                          <span key={i} className={'trail ' + tone(g)}>
                            {fmt(g)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="subject-grade">
                      <strong className={tone(last)}>{fmt(last)}</strong>
                      {diff !== 0 && (
                        <span className={'small ' + (diff > 0 ? 'good' : 'bad')}>
                          {diff > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {diff > 0 ? '+' : ''}
                          {fmt(diff)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          <section className="card">
            <h2>Últimos 7 tests</h2>
            <div className="list">
              {recent.map(a => (
                <div key={a.id} className="history-row">
                  <div>
                    <div className="list-title">{a.subject}</div>
                    <div className="muted small">
                      {MODE_LABEL[a.mode]} · {a.correct}/{a.total} ·{' '}
                      {new Date(a.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                  <strong className={tone(a.grade)}>{fmt(a.grade)}</strong>
                </div>
              ))}
            </div>
          </section>
          </div>

        </>
      )}

    </>
  )
}
