import { ChevronRight, CircleCheck, CircleX, RotateCcw, SkipForward } from 'lucide-react'
import { useEffect, useState } from 'react'
import { grade, gradeBySubject, type Answer, type Mode } from '../lib/quiz'
import Ring from './Ring'

type Props = {
  title: string
  subtitle: string
  mode: Mode
  /** test con varias asignaturas: nota de cada una */
  review: boolean
  /** sesión diaria: "Repetir" pasa a ser "Siguiente bloque" */
  next?: boolean
  answers: Answer[]
  onRepeat: () => void
  onClose: () => void
}

export default function Results({ title, subtitle, mode, review, next, answers, onRepeat, onClose }: Props) {
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
  const list = onlyMistakes ? answers.filter(a => !a.ok) : answers
  const exam = mode === 'exam'
  const subjects = review ? gradeBySubject(answers, mode) : []
  const passedAll = subjects.filter(s => s.passed).length

  return (
    <>
      <header className="page-head">
        <p className="muted small">
          {title} · {subtitle}
        </p>
      </header>

      <section className="card result-hero">
        <Ring value={r.grade / 10} tone={color} size={148}>
          <strong>{r.grade.toLocaleString('es', { maximumFractionDigits: 2 })}</strong>
          <span>/ 10</span>
        </Ring>
        <p className="result-msg">
          {review && exam ? `${passedAll} de ${subjects.length} asignaturas aprobadas` : message}
        </p>
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
          {next ? (
            <>
              <button className="btn ghost" onClick={onClose}>
                Terminar
              </button>
              <button className="btn primary" onClick={onRepeat}>
                Siguiente bloque <ChevronRight size={18} />
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={onRepeat}>
                <RotateCcw size={18} /> Repetir
              </button>
              <button className="btn primary" onClick={onClose}>
                Terminar
              </button>
            </>
          )}
        </div>
      </section>

      {review && (
        <section className="card">
          <h2>Por asignatura</h2>
          {subjects.map(s => (
            <div key={s.subject} className="subject-row">
              <div>
                <div className="list-title">{s.subject}</div>
                <div className="muted small">
                  {s.correct} bien · {s.wrong} mal{s.skipped > 0 && ` · ${s.skipped} sin responder`} de {s.total}
                </div>
              </div>
              <div className="subject-grade">
                <strong className={s.grade >= 7 ? 'good' : s.passed ? 'warn' : 'bad'}>
                  {s.grade.toLocaleString('es', { maximumFractionDigits: 2 })}
                </strong>
                {exam && <span className={'pill ' + (s.passed ? 'good' : 'bad')}>{s.passed ? 'Aprobado' : 'Suspenso'}</span>}
              </div>
            </div>
          ))}
        </section>
      )}

      {!review && units.size > 1 && (
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
        {list.length === 0 && <p className="muted center">Sin fallos. Nada que repasar.</p>}
        <div className="list">
          {list.map((a, i) => (
            <div key={i} className="review">
              <div className="review-q">
                {a.ok ? (
                  <CircleCheck size={18} className="good" />
                ) : a.sel === null ? (
                  <SkipForward size={18} className="muted" />
                ) : (
                  <CircleX size={18} className="bad" />
                )}
                <span>
                  {review && <span className="tag accent inline">{a.q.subject}</span>}
                  {a.q.question}
                </span>
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
