import { Brain, ChevronLeft, GraduationCap, RotateCcw, Shuffle } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Subject } from '../lib/data'
import { EXAM_SIZE, filterQuestions, subjectStats, type Filter, type Mode, type Progress } from '../lib/quiz'

const MODES: { id: Mode; label: string; hint: string; Icon: typeof Shuffle }[] = [
  { id: 'random', label: 'Aleatorio', hint: 'Preguntas al azar', Icon: Shuffle },
  { id: 'smart', label: 'Refuerzo', hint: 'Insiste en lo nuevo y en lo que fallas', Icon: Brain },
  { id: 'exam', label: 'Examen', hint: `Como el real: ${EXAM_SIZE} preguntas, 3 fallos restan 1 acierto`, Icon: GraduationCap },
]

export default function SubjectSetup({
  subject,
  progress,
  flagged,
  onBack,
  onReset,
  onStart,
}: {
  subject: Subject
  progress: Progress
  flagged: Set<number>
  onBack: () => void
  onReset: () => void
  onStart: (mode: Mode, filter: Filter, units: Set<string>, n: number) => void
}) {
  const units = useMemo(() => [...new Set(subject.questions.map(q => q.unit).filter((u): u is string => !!u))], [subject])
  const [selUnits, setSelUnits] = useState(() => new Set(units))
  const [mode, setMode] = useState<Mode>('random')
  const [filter, setFilter] = useState<Filter>('all')
  const [count, setCount] = useState(10)
  const [more, setMore] = useState(false)

  const byUnit = subject.questions.filter(q => !q.unit || selUnits.has(q.unit))
  const filtered = filterQuestions(byUnit, progress, filter, flagged)
  const stats = subjectStats(byUnit, progress)
  const max = filtered.length
  const n = mode === 'exam' ? Math.min(EXAM_SIZE, max) : Math.min(count, max)
  const FILTERS: [Filter, string, number][] = [
    ['all', 'Todas', stats.total],
    ['new', 'Nuevas', stats.total - stats.seen],
    ['failed', 'Falladas', stats.failed],
    ['flagged', 'Dudosas', byUnit.filter(q => flagged.has(q.id)).length],
  ]

  function toggleUnit(u: string) {
    const next = new Set(selUnits)
    if (next.has(u)) next.delete(u)
    else next.add(u)
    setSelUnits(next)
  }

  return (
    <div className="setup">
      <header className="page-head with-back">
        <button className="icon-btn" onClick={onBack} aria-label="Volver">
          <ChevronLeft size={24} />
        </button>
        <h1>{subject.name}</h1>
      </header>

      <div className="stats">
        <div>
          <strong>
            {stats.seen}/{stats.total}
          </strong>
          <span>Vistas</span>
        </div>
        <div>
          <strong className={stats.accuracy === null ? '' : stats.accuracy >= 80 ? 'good' : stats.accuracy >= 60 ? 'warn' : 'bad'}>
            {stats.accuracy === null ? '—' : stats.accuracy + '%'}
          </strong>
          <span>Acierto</span>
        </div>
        <div>
          <strong className={stats.failed === 0 ? 'good' : stats.failed < 5 ? 'warn' : 'bad'}>{stats.failed}</strong>
          <span>Falladas</span>
        </div>
        <button className="icon-btn" onClick={onReset} aria-label="Borrar progreso" title="Borrar progreso">
          <RotateCcw size={18} />
        </button>
      </div>

      <section className="card">
        <h2>Modo</h2>
        <div className="modes">
          {MODES.map(({ id, label, hint, Icon }) => (
            <button key={id} className={'mode' + (mode === id ? ' active' : '')} onClick={() => setMode(id)}>
              <Icon size={20} />
              <div>
                <div className="list-title">{label}</div>
                <div className="muted small">{hint}</div>
              </div>
            </button>
          ))}
        </div>

        {mode !== 'exam' && max > 0 && (
          <div className="slider">
            <div className="row">
              <h2>Preguntas</h2>
              <span className="badge">
                {n} <span className="muted">de {max}</span>
              </span>
            </div>
            <input type="range" min={1} max={max} value={n} onChange={e => setCount(Number(e.target.value))} />
          </div>
        )}
      </section>

      <button className="link more" onClick={() => setMore(!more)}>
        {more
          ? 'Menos opciones'
          : filter !== 'all' || selUnits.size < units.length
            ? 'Más opciones (tienes filtros puestos)'
            : 'Más opciones: unidades, solo nuevas, falladas o dudosas'}
      </button>

      {more && units.length > 1 && (
        <section className="card">
          <div className="row">
            <h2>Unidades</h2>
            <div className="row gap">
              <button className="link" onClick={() => setSelUnits(new Set(units))}>Todas</button>
              <button className="link" onClick={() => setSelUnits(new Set())}>Ninguna</button>
            </div>
          </div>
          <div className="chips">
            {units.map(u => (
              <button key={u} className={'chip' + (selUnits.has(u) ? ' active' : '')} onClick={() => toggleUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        </section>
      )}

      {more && (
      <section className="card">
        <h2>Preguntas a incluir</h2>
        <div className="chips">
          {FILTERS.map(([id, label, k]) => (
            <button key={id} className={'chip' + (filter === id ? ' active' : '')} onClick={() => setFilter(id)}>
              {label} <span className="chip-count">{k}</span>
            </button>
          ))}
        </div>
      </section>
      )}

      <button className="btn primary sticky glow" disabled={max === 0} onClick={() => onStart(mode, filter, selUnits, n)}>
        {max === 0 ? (filter === 'all' ? 'Elige al menos una unidad' : 'No hay preguntas con este filtro') : `Empezar · ${n} preguntas`}
      </button>
    </div>
  )
}
