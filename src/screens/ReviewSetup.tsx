import { Brain, ChevronLeft, LoaderCircle, Shuffle } from 'lucide-react'
import { useState } from 'react'
import type { SubjectMeta } from '../lib/data'
import { progressSummary, REVIEW_SIZE, type AllProgress } from '../lib/quiz'

export const REVIEW_NAME = 'Repaso general'

export default function ReviewSetup({
  subjects,
  all,
  loading,
  onBack,
  onStart,
}: {
  subjects: SubjectMeta[]
  all: AllProgress
  loading: boolean
  onBack: () => void
  onStart: (n: number, prioritize: boolean) => void
}) {
  const max = Math.min(300, subjects.reduce((t, s) => t + s.count, 0))
  const [count, setCount] = useState(Math.min(REVIEW_SIZE, max))
  const [prioritize, setPrioritize] = useState(true)
  const totals = { ok: 0, failed: 0, unseen: 0 }
  for (const s of subjects) {
    const sum = progressSummary(all[s.name] ?? {}, s.count)
    totals.ok += sum.ok
    totals.failed += sum.failed
    totals.unseen += sum.unseen
  }

  return (
    <div className="setup">
      <header className="page-head with-back">
        <button className="icon-btn" onClick={onBack} aria-label="Volver">
          <ChevronLeft size={24} />
        </button>
        <h1>{REVIEW_NAME}</h1>
      </header>

      <div className="stats">
        <div>
          <strong className="good">{totals.ok}</strong>
          <span>Acertadas</span>
        </div>
        <div>
          <strong className="bad">{totals.failed}</strong>
          <span>Falladas</span>
        </div>
        <div>
          <strong>{totals.unseen}</strong>
          <span>Sin ver</span>
        </div>
      </div>

      <section className="card">
        <h2>Cómo funciona</h2>
        <p className="muted small">
          Preguntas de {subjects.map(s => s.name).join(', ')}. Se puntúa como el examen: cada 3 fallos restan 1
          acierto y si no sabes una, sáltala (no resta). Al final ves si apruebas cada asignatura.
        </p>
      </section>

      <section className="card">
        <div className="row">
          <h2>Preguntas</h2>
          <span className="badge">
            {count}
          </span>
        </div>
        <input
          type="range"
          min={subjects.length}
          max={max}
          step={subjects.length}
          value={count}
          onChange={e => setCount(Number(e.target.value))}
        />
        <div className="modes" style={{ marginTop: 14 }}>
          <button className={'mode' + (prioritize ? ' active' : '')} onClick={() => setPrioritize(true)}>
            <Brain size={20} />
            <div>
              <div className="list-title">Centrado en lo flojo</div>
              <div className="muted small">Más preguntas de lo que peor llevas y de lo que no has visto</div>
            </div>
          </button>
          <button className={'mode' + (prioritize ? '' : ' active')} onClick={() => setPrioritize(false)}>
            <Shuffle size={20} />
            <div>
              <div className="list-title">Simulacro real</div>
              <div className="muted small">Al azar y repartido por igual: tu nota de verdad</div>
            </div>
          </button>
        </div>
      </section>

      <button className="btn primary sticky" disabled={loading} onClick={() => onStart(count, prioritize)}>
        {loading ? <LoaderCircle className="spin" size={20} /> : `Empezar · ${count} preguntas`}
      </button>
    </div>
  )
}

