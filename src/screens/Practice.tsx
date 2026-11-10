import { ChevronRight, Flame, Layers, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchManifest, fetchSubject, type Subject, type SubjectMeta } from '../lib/data'
import {
  buildDaily,
  buildQuiz,
  buildReview,
  dailyPlan,
  PER_SUBJECT,
  expectedProgress,
  filterQuestions,
  grade,
  gradeBySubject,
  MODE_LABEL,
  progressSummary,
  record,
  type AllProgress,
  type Answer,
  type Mode,
  type QuizQuestion,
} from '../lib/quiz'
import { addAttempt, flaggedIds, loadAttempts, loadFlags, loadProgress, onFlagsChange, resetProgress, saveAnswer, setFlag, studyStreak } from '../lib/store'
import Quiz from './Quiz'
import Results from './Results'
import ReviewSetup, { REVIEW_NAME } from './ReviewSetup'
import SubjectSetup from './SubjectSetup'
import PracticeSubjects from './PracticeSubjects'
import TodayCard from './TodayCard'
import { examDate } from '../lib/settings'

const DAILY_NAME = 'Sesión diaria'

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


export default function Practice({ onImmersive, libraryVersion }: { onImmersive: (on: boolean) => void; libraryVersion: number }) {
  const [subjects, setSubjects] = useState<SubjectMeta[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [notice, setNotice] = useState('') // aviso dentro de la pantalla, en lugar de alert()
  const [subject, setSubject] = useState<Subject | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [all, setAll] = useState<AllProgress>({})
  const [cache] = useState(() => new Map<string, Subject>())
  const [run, setRun] = useState<Run | null>(null)
  const [flags, setFlags] = useState<Set<string>>(() => new Set())
  const [streakDays, setStreakDays] = useState(0)

  const visible = useMemo(() => subjects ?? [], [subjects])

  useEffect(() => {
    cache.clear() // al añadir o quitar asignaturas propias, no reusar una versión antigua
    fetchManifest().then(setSubjects, () => setLoadError(true))
  }, [libraryVersion, cache])

  useEffect(() => onFlagsChange(setFlags), [])

  useEffect(() => {
    onImmersive(run !== null && run.answers === null)
  }, [run, onImmersive])

  // Progreso de las asignaturas de la lista para el resumen de la lista y el repaso.
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
      setNotice(`No se pudo cargar "${meta.name}".`)
    } finally {
      setLoading(null)
    }
  }

  /** Carga las asignaturas de la lista con su progreso recién leído (puede venir de otro dispositivo) */
  async function startMixed(key: string, start: (list: Subject[], fresh: AllProgress) => void) {
    setLoading(key)
    try {
      const list = await Promise.all(visible.map(getSubject))
      const fresh: AllProgress = { ...all }
      await Promise.all(list.map(async s => (fresh[s.name] = await loadProgress(s.name))))
      setAll(fresh)
      start(list, fresh)
    } catch {
      setNotice('No se pudieron cargar las asignaturas.')
    } finally {
      setLoading(null)
    }
  }

  /** Empieza un test; si no hay preguntas avisa en vez de abrir un test vacío */
  function begin(r: Omit<Run, 'questions' | 'answers'>, progress: AllProgress) {
    const questions = r.make(progress)
    if (questions.length === 0) return setNotice('No hay preguntas para esta selección.')
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
      begin({ title: DAILY_NAME, subtitle: `Bloque de ${PER_SUBJECT * list.length}`, mode: 'smart', review: true, next: true, make }, fresh)
    })

  function flag(q: QuizQuestion, on: boolean) {
    setFlag(q.subject, q.id, on) // onFlagsChange actualiza el estado
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
            setNotice('No quedan preguntas para esta selección.')
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
            setNotice('No se pudo borrar el progreso. Necesitas conexión.')
          }
        }}
        onStart={(mode, filter, units, n) => {
          const marked = flaggedIds(flags, name)
          const make = (p: AllProgress) => {
            const pool = filterQuestions(subject.questions, p[name] ?? {}, filter, marked).filter(q => !q.unit || units.has(q.unit))
            return buildQuiz(name, pool, p[name] ?? {}, mode, n, subject.questions)
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
  let semTotal = 0, semOk = 0, firstAt: number | null = null
  for (const s of visible) {
    const p = all[s.name] ?? {}
    const sum = progressSummary(p, s.count)
    semTotal += sum.total
    semOk += sum.ok
    for (const q of Object.values(p)) if (q.f && (firstAt === null || q.f < firstAt)) firstAt = q.f
  }
  const mastery = semTotal ? semOk / semTotal : 0
  const expected = expectedProgress(firstAt)
  const pct = (x: number, up = false) => (up ? Math.ceil(x * 100) : Math.round(x * 100))
  // Margen de 2 puntos para no pasar de «atrasado» a «adelantado» por una pregunta
  const pace =
    expected === null
      ? null
      : pct(mastery) < pct(expected, true)
        ? { label: 'Vas atrasado', tone: 'warn' }
        : pct(mastery) <= pct(expected, true) + 2
          ? { label: 'Vas bien', tone: 'good' }
          : { label: 'Vas adelantado', tone: 'good' }

  return (
    <>
      <header className="hero-head">
        <div>
          <p className="eyebrow">
            {plan.daysLeft > 0
              ? `Faltan ${plan.daysLeft} días · examen el ${examDate().toLocaleDateString('es', { day: 'numeric', month: 'long' })}`
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

      {notice && <p className="error" role="alert">{notice}</p>}
      {loadError && <p className="error">No se pudieron cargar las asignaturas.</p>}
      {!subjects && !loadError && <p className="muted center">Cargando…</p>}

      {visible.length > 0 && (
        <TodayCard
          plan={plan}
          goalDone={goalDone}
          mastery={mastery}
          expected={expected}
          pace={pace}
          count={PER_SUBJECT * visible.length}
          loading={loading}
          onStart={startDaily}
        />
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
      <PracticeSubjects subjects={visible} all={all} loading={loading} onOpen={open} />
    </>
  )
}
