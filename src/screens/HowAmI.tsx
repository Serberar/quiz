import { CircleAlert, CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchManifest, fetchSubject, type Question, type SubjectMeta } from '../lib/data'
import { assess, PASS_GRADE, progressSummary, startOfDay, weakUnits, type Level, type Progress } from '../lib/quiz'
import { loadProgress, type Attempt } from '../lib/store'

const DAY = 86_400_000
const fmt = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 1 })
const day = (t: number) => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'long' })

const VERDICT: Record<Level, { title: string; Icon: typeof CircleCheck }> = {
  good: { title: 'Vas bien', Icon: CircleCheck },
  warn: { title: 'Vas justo', Icon: CircleAlert },
  bad: { title: 'Vas mal', Icon: CircleX },
}
const LEVEL_LABEL: Record<Level, string> = { good: 'Bien', warn: 'Justo', bad: 'Mal' }

/** ¿Cómo voy?: veredicto, previsión, nota por asignatura y actividad de los últimos 14 días. */
export default function HowAmI({ attempts }: { attempts: Attempt[] }) {
  const [data, setData] = useState<{ meta: SubjectMeta; progress: Progress; questions: Question[] }[] | null>(null)

  useEffect(() => {
    fetchManifest()
      .then(list =>
        Promise.all(
          list.map(async meta => {
            const [progress, subject] = await Promise.all([loadProgress(meta.name), fetchSubject(meta)])
            return { meta, progress, questions: subject.questions }
          }),
        ),
      )
      .then(setData, () => setData([]))
  }, [])

  if (!data) {
    return (
      <p className="muted center">
        <LoaderCircle className="spin" size={20} />
      </p>
    )
  }
  if (data.length === 0) return null

  const subjects = data.map(d => ({ name: d.meta.name, total: d.meta.count, progress: d.progress }))
  const a = assess(subjects)
  const V = VERDICT[a.verdict]
  const onTime = a.finishAt !== null && a.finishAt <= a.deadline

  const items: { level: Level; title: string; value: string; text: string }[] = [
    {
      level: a.pace,
      title: 'Ritmo',
      value: `${a.perDay >= 10 ? Math.round(a.perDay) : fmt(a.perDay)} nuevas/día`,
      text:
        a.plan.unseen === 0
          ? 'Ya has visto todo el temario.'
          : a.pace === 'good'
            ? `Necesitas ${a.needed} al día y las estás haciendo.`
            : `Necesitas ${a.needed} al día. Haz más bloques de "Estudiar" para ver temario nuevo.`,
    },
    {
      level: a.memory,
      title: 'Lo que recuerdas',
      value: a.seen ? `${Math.round(a.retention * 100)}%` : '—',
      text:
        a.seen < 20
          ? 'Aún has visto pocas preguntas para saberlo.'
          : a.memory === 'good'
            ? 'De lo que has visto, aciertas la gran mayoría.'
            : 'Fallas mucho de lo ya visto. Haz los repasos antes que temario nuevo y lee las explicaciones.',
    },
    {
      level: a.backlog,
      title: 'Repasos atrasados',
      value: String(a.plan.due),
      text:
        a.backlog === 'good'
          ? 'Vas al día con los repasos.'
          : 'Se te acumulan. Pulsa "Estudiar" hasta que baje: los repasos salen primero.',
    },
  ]

  // Actividad: preguntas respondidas por día (tests terminados), últimos 14 días
  const today = startOfDay()
  const days = Array.from({ length: 14 }, (_, i) => {
    const start = today - (13 - i) * DAY
    const list = attempts.filter(t => {
      const at = new Date(t.created_at).getTime()
      return at >= start && at < start + DAY
    })
    return { start, total: list.reduce((s, t) => s + t.total, 0), correct: list.reduce((s, t) => s + t.correct, 0) }
  })
  const week = days.slice(-7).reduce((s, d) => s + d.total, 0)
  const weak = weakUnits(data.map(d => ({ name: d.meta.name, questions: d.questions, progress: d.progress })))

  return (
    <>
      <section className={'card verdict verdict-' + a.verdict}>
        <div className="verdict-head">
          <V.Icon size={30} />
          <div>
            <h2>¿Cómo voy?</h2>
            <strong>{V.title}</strong>
          </div>
        </div>
        <p className="small">
          {a.finishAt === null
            ? 'Aún no hay ritmo para calcular cuándo acabarás el temario.'
            : a.plan.unseen === 0
              ? 'Ya has visto todo el temario: ahora toca asentarlo.'
              : `A este ritmo verás todo el temario el ${day(a.finishAt)}. ${
                  onTime ? `Llegas a tiempo (objetivo: ${day(a.deadline)}).` : `Tarde: el objetivo es el ${day(a.deadline)}.`
                }`}
        </p>
        <div className="checks">
          {items.map(it => (
            <div key={it.title} className="check">
              <div className="row">
                <span className="list-title">{it.title}</span>
                <span className={'pill ' + it.level}>{LEVEL_LABEL[it.level]}</span>
              </div>
              <strong>{it.value}</strong>
              <p className="muted small">{it.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card exam-now">
        <h2>Si el examen fuera hoy</h2>
        {data.map(({ meta, progress }) => {
          const s = progressSummary(progress, meta.count)
          const level: Level = s.estimate >= 6 ? 'good' : s.estimate >= PASS_GRADE ? 'warn' : 'bad'
          return (
            <div key={meta.file} className="subject-row">
              <div className="grow">
                <div className="list-title">{meta.name}</div>
                <div className="muted small">
                  {Math.round((s.seen / s.total) * 100)}% visto · {s.failed} falladas
                </div>
              </div>
              <div className="subject-grade">
                <strong>{fmt(s.estimate)}</strong>
                <span className={'pill ' + level}>{level === 'good' ? 'Apruebas' : level === 'warn' ? 'Por los pelos' : 'Suspendes'}</span>
              </div>
            </div>
          )
        })}
        <p className="muted small note">
          Estimación con lo que tienes aprendido y la penalización del examen. La nota real la da el Repaso general en
          modo Simulacro.
        </p>
      </section>

      {weak.length > 0 && (
        <section className="card">
          <h2>Temas más flojos</h2>
          {weak.map(w => (
            <div key={w.subject + w.unit} className="subject-row weak-row">
              <div className="grow">
                <div className="list-title">
                  {w.unit} <span className="muted small">· {w.subject}</span>
                </div>
                <div className="meter">
                  <div className="bad" style={{ width: Math.round(w.rate * 100) + '%' }} />
                </div>
              </div>
              <div className="subject-grade">
                <strong>{Math.round(w.rate * 100)}%</strong>
                <span className="muted small">
                  {w.failed} de {w.seen} falladas
                </span>
              </div>
            </div>
          ))}
          <p className="muted small note">"Estudiar" ya te pregunta más de estos temas. Lee bien las explicaciones al fallar.</p>
        </section>
      )}

      <section className="card">
        <div className="row">
          <h2>Preguntas al día</h2>
          <span className="muted small">{week} en 7 días</span>
        </div>
        <ActivityChart days={days} />
      </section>
    </>
  )
}

/** Barras de preguntas por día. Al tocar o pasar por una barra se ve su detalle. */
function ActivityChart({ days }: { days: { start: number; total: number; correct: number }[] }) {
  const [active, setActive] = useState(days.length - 1)
  const max = Math.max(10, ...days.map(d => d.total))
  const d = days[active]
  return (
    <div className="chart">
      <p className="chart-readout small">
        <strong>{new Date(d.start).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })}</strong>
        {': '}
        {d.total ? `${d.total} preguntas, ${Math.round((d.correct / d.total) * 100)}% acertadas` : 'sin tests terminados'}
      </p>
      <div className="bars" role="list" aria-label="Preguntas respondidas por día, últimos 14 días">
        {days.map((x, i) => (
          <button
            key={x.start}
            role="listitem"
            className={'bar-col' + (i === active ? ' active' : '')}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            aria-label={`${new Date(x.start).toLocaleDateString('es')}: ${x.total} preguntas`}
          >
            {x.total > 0 && <span className="bar-fill" style={{ height: `${(x.total / max) * 100}%` }} />}
          </button>
        ))}
      </div>
      <div className="bars-axis small muted">
        <span>{new Date(days[0].start).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</span>
        <span>hoy</span>
      </div>
    </div>
  )
}
