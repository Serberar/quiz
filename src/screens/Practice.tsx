import { CalendarCheck, ChevronRight, Flame, Layers, LoaderCircle, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchManifest, fetchSubject, type Subject, type SubjectMeta } from '../lib/data'
import {
  BLOCK_SIZE,
  buildDaily,
  buildQuiz,
  buildReview,
  dailyPlan,
  EXAM_DATE,
  filterQuestions,
  grade,
  gradeBySubject,
  MODE_LABEL,
  PASS_GRADE,
  progressSummary,
  record,
  type AllProgress,
  type Answer,
  type Mode,
  type QuizQuestion,
} from '../lib/quiz'
import { addAttempt, flaggedIds, loadAttempts, loadFlags, loadProgress, resetProgress, saveAnswer, setFlag, studyStreak } from '../lib/store'
import Quiz from './Quiz'
import Mastery from './Mastery'
import Results from './Results'
import ReviewSetup, { REVIEW_NAME } from './ReviewSetup'
import Ring from './Ring'
import SubjectSetup from './SubjectSetup'

const DAILY_NAME = 'Hoy'
const fmt = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 1 })
const tone = (g: number) => (g >= 7 ? 'good' : g >= PASS_GRADE ? 'warn' : 'bad')

/** make se guarda para que "Repetir" use la misma configuración con el progreso actualizado */
type Run = {
  title: string
  subtitle: string
  mode: Mode
  review: boolean
  /** sesión diaria: al terminar se ofrece el siguiente bloque */
  next?: boolean
  make: (all: AllProgress) => QuizQuestion[]
  questions: QuizQuestion[]
  answers: Answer[] | null
}


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
  const [flags, setFlags] = useState<Set<string>>(() => new Set())
  const [streakDays, setStreakDays] = useState(0)

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
    loadFlags().then(setFlags)
    loadAttempts().then(a => setStreakDays(studyStreak(a)))
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

  /** Carga las asignaturas del semestre con su progreso recién leído (puede venir de otro dispositivo) */
  async function startMixed(key: string, start: (list: Subject[], fresh: AllProgress) => void) {
    setLoading(key)
    try {
      const list = await Promise.all(visible.map(getSubject))
      const fresh: AllProgress = { ...all }
      await Promise.all(list.map(async s => (fresh[s.name] = await loadProgress(s.name))))
      setAll(fresh)
      start(list, fresh)
    } catch {
      alert('No se pudieron cargar las asignaturas.')
    } finally {
      setLoading(null)
    }
  }

  /** Empieza un test; si no hay preguntas avisa en vez de abrir un test vacío */
  function begin(r: Omit<Run, 'questions' | 'answers'>, progress: AllProgress) {
    const questions = r.make(progress)
    if (questions.length === 0) return alert('No hay preguntas para esta selección.')
    setRun({ ...r, questions, answers: null })
  }

  const startReview = (n: number, prioritize: boolean) =>
    startMixed('review', (list, fresh) => {
      const make = (p: AllProgress) => buildReview(list, p, n, prioritize)
      const subtitle = prioritize ? 'Centrado en lo flojo' : 'Simulacro de examen'
      setReviewing(false) // al terminar se vuelve al inicio
      begin({ title: REVIEW_NAME, subtitle, mode: 'exam', review: true, make }, fresh)
    })

  const startDaily = () =>
    startMixed('daily', (list, fresh) => {
      const make = (p: AllProgress) => buildDaily(list.map(s => ({ name: s.name, questions: s.questions, progress: p[s.name] ?? {} })))
      begin({ title: DAILY_NAME, subtitle: 'Sesión diaria', mode: 'smart', review: true, next: true, make }, fresh)
    })

  function flag(q: QuizQuestion, on: boolean) {
    setFlags(setFlag(flags, q.subject, q.id, on))
  }

  function answer(q: QuizQuestion, ok: boolean) {
    const next = record(all[q.subject] ?? {}, q.id, ok)
    setAll(prev => ({ ...prev, [q.subject]: next }))
    saveAnswer(q.subject, q.id, ok, next)
  }

  function finish(answers: Answer[]) {
    if (answers.length === 0) return setRun(null)
    const { total, correct, wrong, skipped, grade: g } = grade(answers, run!.mode)
    const details = run!.review
      ? gradeBySubject(answers, run!.mode).map(r => ({ subject: r.subject, total: r.total, correct: r.correct, wrong: r.wrong, skipped: r.skipped, grade: r.grade }))
      : null
    addAttempt({ subject: run!.title, mode: run!.mode, total, correct, wrong, skipped, grade: g, details })
    loadAttempts().then(a => setStreakDays(studyStreak(a)))
    setRun({ ...run!, answers })
  }

  if (run) {
    if (run.answers) {
      return (
        <Results
          title={run.title}
          subtitle={run.subtitle}
          mode={run.mode}
          review={run.review}
          next={run.next}
          answers={run.answers}
          onRepeat={() => {
            const questions = run.make(all)
            if (questions.length) return setRun({ ...run, questions, answers: null })
            alert('No quedan preguntas para esta selección.')
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
        flags={flags}
        onFlag={flag}
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
      <SubjectSetup
        subject={subject}
        progress={all[name] ?? {}}
        flagged={flaggedIds(flags, name)}
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
          const marked = flaggedIds(flags, name)
          const make = (p: AllProgress) => {
            const pool = filterQuestions(subject.questions, p[name] ?? {}, filter, marked).filter(q => !q.unit || units.has(q.unit))
            return buildQuiz(name, pool, p[name] ?? {}, mode, n)
          }
          begin({ title: name, subtitle: MODE_LABEL[mode], mode, review: false, make }, all)
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

  const plan = dailyPlan(visible.map(s => ({ name: s.name, total: s.count, progress: all[s.name] ?? {} })))
  const goalDone = plan.due === 0 && plan.newLeft === 0
  let semTotal = 0, semOk = 0
  for (const s of visible) {
    const sum = progressSummary(all[s.name] ?? {}, s.count)
    semTotal += sum.total
    semOk += sum.ok
  }
  const mastery = semTotal ? semOk / semTotal : 0

  return (
    <>
      <header className="hero-head">
        <div>
          <p className="eyebrow">
            {plan.daysLeft > 0
              ? `Faltan ${plan.daysLeft} días · examen el ${EXAM_DATE.toLocaleDateString('es', { day: 'numeric', month: 'long' })}`
              : 'Día del examen. ¡Mucha suerte!'}
          </p>
          <h1>Practicar</h1>
        </div>
        {streakDays > 0 && (
          <div className="streak" title="Días seguidos estudiando">
            <Flame size={18} />
            <strong>{streakDays}</strong>
            <span>{streakDays === 1 ? 'día' : 'días'}</span>
          </div>
        )}
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

      {visible.length > 0 && (
        <section className="card today">
          <div className="today-top">
            <Ring value={mastery} tone="accent" size={112}>
              <strong>{Math.round(mastery * 100)}%</strong>
              <span>temario</span>
            </Ring>
            <div className="today-info">
              <div className="row">
                <h2>
                  <CalendarCheck size={14} /> Hoy
                </h2>
                {goalDone && <span className="pill good">Cumplido</span>}
              </div>
              <div className="today-stats">
                <div>
                  <strong className={plan.due ? 'warn' : 'good'}>{plan.due}</strong>
                  <span>a repasar</span>
                </div>
                <div>
                  <strong className={plan.newLeft ? '' : 'good'}>
                    {plan.newToday}
                    <small>/{plan.newTarget}</small>
                  </strong>
                  <span>nuevas</span>
                </div>
                <div>
                  <strong>{plan.doneToday}</strong>
                  <span>hechas hoy</span>
                </div>
              </div>
            </div>
          </div>
          <p className="muted small">
            {goalDone
              ? '¡Objetivo de hoy cumplido! Si quieres seguir, la app te adelanta temario de lo que peor llevas.'
              : 'Pulsa Estudiar y la app elige por ti: lo que toca repasar, lo que fallas y temario nuevo, con más preguntas de lo que peor llevas.'}
          </p>
          <button className="btn primary glow big" onClick={startDaily} disabled={loading !== null}>
            {loading === 'daily' ? (
              <LoaderCircle className="spin" size={22} />
            ) : (
              <>
                <Zap size={20} /> {goalDone ? 'Seguir estudiando' : 'Estudiar'}
                <small>{BLOCK_SIZE} preguntas</small>
              </>
            )}
          </button>
        </section>
      )}

      {visible.length > 1 && (
        <button className="list-item hero-item" onClick={() => setReviewing(true)} disabled={loading !== null}>
          <span className="hero-icon">
            <Layers size={20} />
          </span>
          <div className="grow">
            <div className="list-title">{REVIEW_NAME}</div>
            <div className="muted small">Simulacro de examen: te dice si apruebas cada asignatura</div>
          </div>
          {loading === 'review' ? <LoaderCircle className="spin" size={20} /> : <ChevronRight size={20} />}
        </button>
      )}

      {visible.length > 0 && <h2 className="section-title">Practicar una asignatura</h2>}
      <div className="list">
        {visible.map(s => {
          const sum = progressSummary(all[s.name] ?? {}, s.count)
          return (
            <button key={s.file} className="list-item subject" onClick={() => open(s)} disabled={loading !== null}>
              <div className="grow">
                <div className="list-title">{s.name}</div>
                <div className="muted small">
                  {sum.seen}/{s.count} vistas
                  {sum.failed > 0 && <span className="bad"> · {sum.failed} falladas</span>}
                </div>
                <Mastery {...sum} />
              </div>
              <div className="estimate" title="Nota estimada si el examen fuera hoy">
                <strong className={sum.seen ? tone(sum.estimate) : 'muted'}>{sum.seen ? fmt(sum.estimate) : '—'}</strong>
                <span>si fuera hoy</span>
              </div>
              {loading === s.file ? <LoaderCircle className="spin" size={20} /> : <ChevronRight size={20} className="muted" />}
            </button>
          )
        })}
      </div>
    </>
  )
}
