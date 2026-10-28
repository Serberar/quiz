import { Brain, ChevronLeft, ChevronRight, GraduationCap, LoaderCircle, RotateCcw, Shuffle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchManifest, fetchSubject, type Question, type Subject, type SubjectMeta } from '../lib/data'
import { buildQuiz, EXAM_SIZE, grade, record, subjectStats, type Answer, type Mode, type Progress, type QuizQuestion } from '../lib/quiz'
import { addAttempt, loadProgress, saveProgress } from '../lib/store'
import Quiz from './Quiz'
import Results from './Results'

/** pool y n se guardan para que "Repetir" use la misma selección de unidades y tamaño */
type Run = { mode: Mode; pool: Question[]; n: number; questions: QuizQuestion[]; answers: Answer[] | null }

const MODES: { id: Mode; label: string; hint: string; Icon: typeof Shuffle }[] = [
  { id: 'random', label: 'Aleatorio', hint: 'Preguntas al azar', Icon: Shuffle },
  { id: 'smart', label: 'Refuerzo', hint: 'Prioriza las que más fallas', Icon: Brain },
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
  const [loading, setLoading] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress>({})
  const [run, setRun] = useState<Run | null>(null)

  useEffect(() => {
    fetchManifest().then(setSubjects, () => setLoadError(true))
  }, [])

  useEffect(() => {
    onImmersive(run !== null && run.answers === null)
  }, [run, onImmersive])

  function pickSemester(n: number) {
    setSemester(n)
    localStorage.setItem('quiz_semester', String(n))
  }

  async function open(meta: SubjectMeta) {
    setLoading(meta.file)
    try {
      const s = await fetchSubject(meta)
      setProgress(await loadProgress(s.name))
      setSubject(s)
    } catch {
      alert(`No se pudo cargar "${meta.name}".`)
    } finally {
      setLoading(null)
    }
  }

  function answer(id: number, ok: boolean) {
    const next = record(progress, id, ok)
    setProgress(next)
    saveProgress(subject!.name, next)
  }

  function finish(answers: Answer[]) {
    const { total, correct, wrong, skipped, grade: g } = grade(answers, run!.mode)
    addAttempt({ subject: subject!.name, mode: run!.mode, total, correct, wrong, skipped, grade: g })
    setRun({ ...run!, answers })
  }

  if (run && subject) {
    if (run.answers) {
      return (
        <Results
          subject={subject.name}
          mode={run.mode}
          answers={run.answers}
          onRepeat={() => setRun({ ...run, questions: buildQuiz(run.pool, progress, run.mode, run.n), answers: null })}
          onClose={() => setRun(null)}
        />
      )
    }
    return (
      <Quiz
        subject={subject.name}
        mode={run.mode}
        questions={run.questions}
        progress={progress}
        onAnswer={answer}
        onFinish={finish}
        onExit={() => setRun(null)}
      />
    )
  }

  if (subject) {
    return (
      <Setup
        subject={subject}
        progress={progress}
        onBack={() => setSubject(null)}
        onReset={() => {
          if (!confirm(`¿Borrar el progreso de "${subject.name}"? El historial de tests se mantiene.`)) return
          setProgress({})
          saveProgress(subject.name, {})
        }}
        onStart={(mode, pool, n) => setRun({ mode, pool, n, questions: buildQuiz(pool, progress, mode, n), answers: null })}
      />
    )
  }

  const visible = subjects?.filter(s => s.semester === semester) ?? []
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

      <div className="list">
        {visible.map(s => (
          <button key={s.file} className="list-item" onClick={() => open(s)} disabled={loading !== null}>
            <div>
              <div className="list-title">{s.name}</div>
              <div className="muted small">{s.count} preguntas</div>
            </div>
            {loading === s.file ? <LoaderCircle className="spin" size={20} /> : <ChevronRight size={20} className="muted" />}
          </button>
        ))}
      </div>
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
  onStart: (mode: Mode, pool: Question[], n: number) => void
}) {
  const units = useMemo(() => [...new Set(subject.questions.map(q => q.unit).filter((u): u is string => !!u))], [subject])
  const [selUnits, setSelUnits] = useState(() => new Set(units))
  const [mode, setMode] = useState<Mode>('random')
  const [count, setCount] = useState(10)

  const filtered = subject.questions.filter(q => !q.unit || selUnits.has(q.unit))
  const stats = subjectStats(filtered, progress)
  const max = filtered.length
  const n = mode === 'exam' ? Math.min(EXAM_SIZE, max) : Math.min(count, max)

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
          <strong className={stats.weak === 0 ? 'good' : stats.weak < 5 ? 'warn' : 'bad'}>{stats.weak}</strong>
          <span>Débiles</span>
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

      <button
        className="btn primary sticky"
        disabled={max === 0}
        onClick={() => onStart(mode, filtered, n)}
      >
        {max === 0 ? 'Elige al menos una unidad' : `Empezar · ${n} preguntas`}
      </button>
    </>
  )
}
