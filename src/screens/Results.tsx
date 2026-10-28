import { CircleCheck, CircleX, RotateCcw, SkipForward } from 'lucide-react'
import { useEffect, useState } from 'react'
import { grade, MODE_LABEL, type Answer, type Mode } from '../lib/quiz'

type Props = { subject: string; mode: Mode; answers: Answer[]; onRepeat: () => void; onClose: () => void }

export default function Results({ subject, mode, answers, onRepeat, onClose }: Props) {
  const r = grade(answers, mode)
  const [onlyMistakes, setOnlyMistakes] = useState(true)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const color = r.grade >= 7 ? 'good' : r.grade >= 5 ? 'warn' : 'bad'
  const message =
    r.grade >= 9 ? '¡Excelente!' : r.grade >= 7 ? '¡Muy bien!' : r.passed ? 'Aprobado' : 'Suspenso, a seguir practicando'

  const units = new Map<string, { c: number; t: number }>()
  for (const a of answers) {
    const u = units.get(a.q.unit ?? 'General') ?? { c: 0, t: 0 }
    units.set(a.q.unit ?? 'General', { c: u.c + (a.ok ? 1 : 0), t: u.t + 1 })
  }
  const review = onlyMistakes ? answers.filter(a => !a.ok) : answers

  return (
    <>
      <header className="page-head">
        <p className="muted small">
          {subject} · {MODE_LABEL[mode]}
        </p>
      </header>

      <section className="card result-hero">
        <div className={'ring ' + color}>
          <strong>{r.grade.toLocaleString('es', { maximumFractionDigits: 2 })}</strong>
          <span>/ 10</span>
        </div>
        <p className="result-msg">{message}</p>
        <div className="stats plain">
          <div>
            <strong className="good">{r.correct}</strong>
            <span>Correctas</span>
          </div>
          <div>
            <strong className="bad">{r.wrong}</strong>
            <span>Fallos</span>
          </div>
          {mode === 'exam' && (
            <div>
              <strong className="muted">{r.skipped}</strong>
              <span>Sin responder</span>
            </div>
          )}
        </div>
        {mode === 'exam' && (
          <p className="muted small">
            Puntuación: {r.correct} − {r.wrong}/3 = {r.points.toLocaleString('es', { maximumFractionDigits: 2 })} de {r.total}
          </p>
        )}
        <div className="row gap">
          <button className="btn ghost" onClick={onRepeat}>
            <RotateCcw size={18} /> Repetir
          </button>
          <button className="btn primary" onClick={onClose}>
            Terminar
          </button>
        </div>
      </section>

      {units.size > 1 && (
        <section className="card">
          <h2>Por unidad</h2>
          {[...units].sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true })).map(([u, s]) => {
            const pct = Math.round((s.c / s.t) * 100)
            return (
              <div key={u} className="unit-row">
                <span>{u}</span>
                <div className="meter">
                  <div className={pct >= 80 ? 'good' : pct >= 60 ? 'warn' : 'bad'} style={{ width: pct + '%' }} />
                </div>
                <span className="small muted">
                  {s.c}/{s.t}
                </span>
              </div>
            )
          })}
        </section>
      )}

      <section>
        <div className="segmented">
          <button className={onlyMistakes ? 'active' : ''} onClick={() => setOnlyMistakes(true)}>
            Fallos ({answers.length - r.correct})
          </button>
          <button className={onlyMistakes ? '' : 'active'} onClick={() => setOnlyMistakes(false)}>
            Todas ({answers.length})
          </button>
        </div>
        {review.length === 0 && <p className="muted center">Sin fallos. Nada que repasar.</p>}
        <div className="list">
          {review.map((a, i) => (
            <div key={i} className="review">
              <div className="review-q">
                {a.ok ? (
                  <CircleCheck size={18} className="good" />
                ) : a.sel === null ? (
                  <SkipForward size={18} className="muted" />
                ) : (
                  <CircleX size={18} className="bad" />
                )}
                <span>{a.q.question}</span>
              </div>
              {!a.ok && a.sel !== null && <p className="bad small">Tu respuesta: {a.sel}</p>}
              <p className="good small">Correcta: {a.q.correct}</p>
              {a.q.explicacion && <p className="explanation">{a.q.explicacion}</p>}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
