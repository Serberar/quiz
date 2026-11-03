import { Brain, ChevronLeft, ChevronRight, GraduationCap, Layers, LoaderCircle, RotateCcw, Shuffle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchManifest, fetchSubject, type Subject, type SubjectMeta } from '../lib/data'
import {
  buildQuiz,
  buildReview,
  EXAM_SIZE,
  filterQuestions,
  grade,
  progressSummary,
  record,
  REVIEW_SIZE,
  subjectStats,
  type AllProgress,
  type Answer,
  type Filter,
  type Mode,
  type Progress,
  type QuizQuestion,
} from '../lib/quiz'
import { addAttempt, loadProgress, resetProgress, saveAnswer } from '../lib/store'
import Quiz from './Quiz'
import Results from './Results'

const REVIEW_NAME = 'Repaso general'

/** make se guarda para que "Repetir" use la misma configuración con el progreso actualizado */
type Run = {
  title: string
  mode: Mode
  review: boolean
  make: (all: AllProgress) => QuizQuestion[]
  questions: QuizQuestion[]
  answers: Answer[] | null
}

const MODES: { id: Mode; label: string; hint: string; Icon: typeof Shuffle }[] = [
  { id: 'random', label: 'Aleatorio', hint: 'Preguntas al azar', Icon: Shuffle },
  { id: 'smart', label: 'Refuerzo', hint: 'Prioriza las nuevas y las que fallas', Icon: Brain },
  { id: 'exam', label: 'Examen', hint: `${EXAM_SIZE} preguntas · 3 fallos restan 1 acierto · saltar no penaliza`, Icon: GraduationCap },
]

function savedSemester() {
  const n = Number(localStorage.getItem('quiz_semester'))
  return n === 1 || n === 2 ? n : 2
}

export default function Practice({ onImmersive }: { onImmersive: (on: boolean) => void }) {
  const [subjects, setSubjects] = useState<SubjectMeta[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [semester, setSemester] = useState(savedSemester)
  const [subject, setSubject] = useState<Subject | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [all, setAll] = useState<AllProgress>({})
  const [cache] = useState(() => new Map<string, Subject>())
  const [run, setRun] = useState<Run | null>(null)

  const visible = useMemo(() => subjects?.filter(s => s.semester === semester) ?? [], [subjects, semester])

  useEffect(() => {
    fetchManifest().then(setSubjects, () => setLoadError(true))
  }, [])

  useEffect(() => {
    onImmersive(run !== null && run.answers === null)
  }, [run, onImmersive])

  // Progreso de las asignaturas del semestre para el resumen de la lista y el repaso.
  // Se recarga al volver a la app por si se ha estudiado en otro dispositivo.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      for (const s of visible) loadProgress(s.name).then(p => setAll(prev => ({ ...prev, [s.name]: p })))
    }
    refresh()
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [visible])

  function pickSemester(n: number) {
    setSemester(n)
    localStorage.setItem('quiz_semester', String(n))
  }

  async function getSubject(meta: SubjectMeta) {
    let s = cache.get(meta.file)
    if (!s) {
      s = await fetchSubject(meta)
      cache.set(meta.file, s)
    }
    return s
  }

  async function open(meta: SubjectMeta) {
    setLoading(meta.file)
    try {
      const s = await getSubject(meta)
      const p = await loadProgress(s.name)
      setAll(prev => ({ ...prev, [s.name]: p }))
      setSubject(s)
    } catch {
      alert(`No se pudo cargar "${meta.name}".`)
    } finally {
      setLoading(null)
    }
  }

  async function startReview(n: number, prioritize: boolean) {
    setLoading('review')
    try {
      const list = await Promise.all(visible.map(getSubject))
      // Progreso recién leído del servidor: puede haber cambiado en otro dispositivo
      const fresh: AllProgress = { ...all }
      for (const s of list) fresh[s.name] = await loadProgress(s.name)
      setAll(fresh)
      const make = (p: AllProgress) => buildReview(list, p, n, prioritize)
      setRun({ title: REVIEW_NAME, mode: 'exam', review: true, make, questions: make(fresh), answers: null })
    } catch {
      alert('No se pudieron cargar las asignaturas.')
    } finally {
      setLoading(null)
    }
  }

  function answer(q: QuizQuestion, ok: boolean) {
    const next = record(all[q.subject] ?? {}, q.id, ok)
    setAll(prev => ({ ...prev, [q.subject]: next }))
    saveAnswer(q.subject, q.id, ok, next)
  }

  function finish(answers: Answer[]) {
    const { total, correct, wrong, skipped, grade: g } = grade(answers, run!.mode)
    addAttempt({ subject: run!.title, mode: run!.mode, total, correct, wrong, skipped, grade: g })
    setRun({ ...run!, answers })
  }

  if (run) {
    if (run.answers) {
      return (
        <Results
          title={run.title}
          mode={run.mode}
          review={run.review}
          answers={run.answers}
          onRepeat={() => {
            const questions = run.make(all)
            if (questions.length) return setRun({ ...run, questions, answers: null })
            alert('Ya no quedan preguntas con este filtro.')
            setRun(null)
          }}
          onClose={() => setRun(null)}
        />
      )
    }
    return (
      <Quiz
        title={run.title}
        mode={run.mode}
        review={run.review}
        questions={run.questions}
        progress={all}
        onAnswer={answer}
        onFinish={finish}
        onExit={() => setRun(null)}
      />
    )
  }

  if (subject) {
    const name = subject.name
    return (
      <Setup
        subject={subject}
        progress={all[name] ?? {}}
        onBack={() => setSubject(null)}
        onReset={async () => {
          if (!confirm(`¿Borrar el progreso de "${name}" en todos tus dispositivos? El historial de tests se mantiene.`)) return
          try {
            await resetProgress(name)
            setAll(prev => ({ ...prev, [name]: {} }))
          } catch {
            alert('No se pudo borrar el progreso. Necesitas conexión.')
          }
        }}
        onStart={(mode, filter, units, n) => {
          const make = (p: AllProgress) => {
            const pool = filterQuestions(subject.questions, p[name] ?? {}, filter).filter(q => !q.unit || units.has(q.unit))
            return buildQuiz(name, pool, p[name] ?? {}, mode, n)
          }
          setRun({ title: name, mode, review: false, make, questions: make(all), answers: null })
        }}
      />
    )
  }

  if (reviewing) {
    return (
      <ReviewSetup
        subjects={visible}
        all={all}
        loading={loading === 'review'}
        onBack={() => setReviewing(false)}
        onStart={startReview}
      />
    )
  }

  return (
    <>
      <header className="page-head">
        <h1>Practicar</h1>
        <p className="muted">Elige una asignatura</p>
      </header>

      <div className="segmented">
        {[1, 2].map(n => (
          <button key={n} className={semester === n ? 'active' : ''} onClick={() => pickSemester(n)}>
            {n}º semestre
          </button>
        ))}
      </div>

      {loadError && <p className="error">No se pudieron cargar las asignaturas.</p>}
      {!subjects && !loadError && <p className="muted center">Cargando…</p>}

      {visible.length > 1 && (
        <button className="list-item hero-item" onClick={() => setReviewing(true)} disabled={loading !== null}>
          <Layers size={22} />
          <div className="grow">
            <div className="list-title">{REVIEW_NAME}</div>
            <div className="small">Preguntas de todas las asignaturas y nota de cada una</div>
          </div>
          <ChevronRight size={20} />
        </button>
      )}

      <div className="list">
        {visible.map(s => {
          const sum = progressSummary(all[s.name] ?? {}, s.count)
          return (
            <button key={s.file} className="list-item" onClick={() => open(s)} disabled={loading !== null}>
              <div className="grow">
                <div className="list-title">{s.name}</div>
                <div className="muted small">
                  {sum.seen}/{s.count} vistas
                  {sum.failed > 0 && <span className="bad"> · {sum.failed} falladas</span>}
                </div>
                <Mastery {...sum} />
              </div>
              {loading === s.file ? <LoaderCircle className="spin" size={20} /> : <ChevronRight size={20} className="muted" />}
            </button>
          )
        })}
      </div>
    </>
  )
}

/** Barra apilada: acertadas (verde), falladas (rojo), sin ver (fondo) */
function Mastery({ total, ok, failed }: { total: number; ok: number; failed: number }) {
  if (!total) return null
  return (
    <div className="meter stacked" role="img" aria-label={`${ok} acertadas, ${failed} falladas de ${total}`}>
      <div className="good" style={{ width: (ok / total) * 100 + '%' }} />
      <div className="bad" style={{ width: (failed / total) * 100 + '%' }} />
    </div>
  )
}

function ReviewSetup({
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
    <>
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
          Las preguntas se reparten a partes iguales entre {subjects.map(s => s.name).join(', ')}. Se puntúa como el
          examen: cada 3 fallos restan 1 acierto y saltar no penaliza. Al final verás la nota de cada asignatura.
        </p>
      </section>

      <section className="card">
        <div className="row">
          <h2>Preguntas</h2>
          <span className="badge">
            {count} <span className="muted">· ~{Math.round(count / subjects.length)} por asignatura</span>
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
              <div className="list-title">Priorizar nuevas y falladas</div>
              <div className="muted small">Para ir cubriendo todo el temario</div>
            </div>
          </button>
          <button className={'mode' + (prioritize ? '' : ' active')} onClick={() => setPrioritize(false)}>
            <Shuffle size={20} />
            <div>
              <div className="list-title">Totalmente aleatorio</div>
              <div className="muted small">Simulacro: mide tu nivel real</div>
            </div>
          </button>
        </div>
      </section>

      <button className="btn primary sticky" disabled={loading} onClick={() => onStart(count, prioritize)}>
        {loading ? <LoaderCircle className="spin" size={20} /> : `Empezar · ${count} preguntas`}
      </button>
    </>
  )
}

function Setup({
  subject,
  progress,
  onBack,
  onReset,
  onStart,
}: {
  subject: Subject
  progress: Progress
  onBack: () => void
  onReset: () => void
  onStart: (mode: Mode, filter: Filter, units: Set<string>, n: number) => void
}) {
  const units = useMemo(() => [...new Set(subject.questions.map(q => q.unit).filter((u): u is string => !!u))], [subject])
  const [selUnits, setSelUnits] = useState(() => new Set(units))
  const [mode, setMode] = useState<Mode>('random')
  const [filter, setFilter] = useState<Filter>('all')
  const [count, setCount] = useState(10)

  const byUnit = subject.questions.filter(q => !q.unit || selUnits.has(q.unit))
  const filtered = filterQuestions(byUnit, progress, filter)
  const stats = subjectStats(byUnit, progress)
  const max = filtered.length
  const n = mode === 'exam' ? Math.min(EXAM_SIZE, max) : Math.min(count, max)
  const FILTERS: [Filter, string, number][] = [
    ['all', 'Todas', stats.total],
    ['new', 'Nuevas', stats.total - stats.seen],
    ['failed', 'Falladas', stats.failed],
  ]

  function toggleUnit(u: string) {
    const next = new Set(selUnits)
    if (next.has(u)) next.delete(u)
    else next.add(u)
    setSelUnits(next)
  }

  return (
    <>
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

      {units.length > 1 && (
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

      <section className="card">
        <h2>Preguntas a incluir</h2>
        <div className="segmented" style={{ marginBottom: 0 }}>
          {FILTERS.map(([id, label, k]) => (
            <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>
              {label} ({k})
            </button>
          ))}
        </div>
      </section>

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

      <button className="btn primary sticky" disabled={max === 0} onClick={() => onStart(mode, filter, selUnits, n)}>
        {max === 0 ? (filter === 'all' ? 'Elige al menos una unidad' : 'No hay preguntas con este filtro') : `Empezar · ${n} preguntas`}
      </button>
    </>
  )
}
