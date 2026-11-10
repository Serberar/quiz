import { CircleAlert, CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchManifest, fetchSubject, type Question, type SubjectMeta } from '../lib/data'
import { assess, startOfDay, type Level, type Progress } from '../lib/quiz'
import { day, fmt, tone } from '../lib/format'
import { loadProgress, type Attempt } from '../lib/store'

const DAY = 86_400_000

const VERDICT: Record<Level, { title: string; Icon: typeof CircleCheck }> = {
  good: { title: 'Vas bien', Icon: CircleCheck },
  warn: { title: 'Vas justo', Icon: CircleAlert },
  bad: { title: 'Vas mal', Icon: CircleX },
}
const LEVEL_LABEL: Record<Level, string> = { good: 'Bien', warn: 'Justo', bad: 'Mal' }


/** ¿Cómo voy?: veredicto, previsión, nota por asignatura y actividad de los últimos 14 días. */
export default function HowAmI({ attempts }: { attempts: Attempt[] }) {
  // Aciertos de hoy por asignatura, con los tests terminados hoy (respondidas = acertadas + falladas)
  const todayStart = startOfDay()
  const todayBy = new Map<string, { c: number; w: number }>()
  for (const a of attempts) {
    if (new Date(a.created_at).getTime() < todayStart) continue
    for (const d of a.details ?? [{ subject: a.subject, correct: a.correct, wrong: a.wrong }]) {
      const e = todayBy.get(d.subject) ?? { c: 0, w: 0 }
      todayBy.set(d.subject, { c: e.c + d.correct, w: e.w + d.wrong })
    }
  }
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

  // Exámenes realizados: un examen propio o cada asignatura de un simulacro, del más reciente al más antiguo
  const exams = attempts
    .filter(a => a.mode === 'exam')
    .flatMap(a => {
      const date = new Date(a.created_at).toLocaleDateString('es', { dateStyle: 'medium' })
      const rows = a.details
        ? a.details.map(d => ({ subject: d.subject, grade: d.grade, origin: `${a.subject} · ${date}` }))
        : [{ subject: a.subject, grade: a.grade, origin: `Examen · ${date}` }]
      return rows.map((r, i) => ({ ...r, key: a.id + '-' + i }))
    })
    .reverse()

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

      {/* Dos tarjetas iguales: preguntas respondidas, falladas y acierto de hoy y del total */}
      {[
        { title: 'Hoy por asignatura', note: 'Tests terminados hoy.', period: 'hoy' },
        { title: 'Total por asignatura', note: 'Desde que empezaste a estudiar.', period: 'en total' },
      ].map(card => (
        <section key={card.title} className="card exam-now">
          <h2>{card.title}</h2>
          {data.map(({ meta, progress }) => {
            const hits = Object.values(progress).reduce((n, p) => n + p.c, 0)
            const wrong = Object.values(progress).reduce((n, p) => n + p.w, 0)
            const today = todayBy.get(meta.name)
            const c = card.period === 'hoy' ? today?.c ?? 0 : hits
            const w = card.period === 'hoy' ? today?.w ?? 0 : wrong
            const answered = c + w
            const value = answered ? c / answered : null
            const level: Level = value === null ? 'bad' : value >= 0.7 ? 'good' : value >= 0.5 ? 'warn' : 'bad'
            return (
              <div key={meta.file} className="subject-row">
                <div className="grow">
                  <div className="list-title">{meta.name}</div>
                  <div className="muted small">
                    {answered} respondidas {card.period} · {w} falladas
                  </div>
                </div>
                <div className="subject-grade">
                  <strong>{value === null ? '—' : Math.round(value * 100) + '%'}</strong>
                  <span className={'pill ' + level}>{value === null ? 'Sin datos' : LEVEL_LABEL[level]}</span>
                </div>
              </div>
            )
          })}
          <p className="muted small note">{card.note}</p>
        </section>
      ))}


      <section className="card">
        <h2>Exámenes realizados</h2>
        {exams.length === 0 && <p className="muted small">Todavía no has hecho ningún examen ni simulacro.</p>}
        <div className="list">
          {exams.map(row => (
            <div key={row.key} className="history-row">
              <div>
                <div className="list-title">{row.subject}</div>
                <div className="muted small">{row.origin}</div>
              </div>
              <strong className={tone(row.grade)}>{fmt(row.grade)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="row">
          <h2>Tu actividad</h2>
          <span className="muted small">{week} preguntas en los últimos 7 días</span>
        </div>
        <ActivityChart days={days} />
      </section>
    </>
  )
}

/** "Hoy", "Ayer" o el día de la semana con la fecha */
function dayName(start: number) {
  const diff = Math.round((startOfDay() - start) / DAY)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  return new Date(start).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })
}

/** Barras de preguntas por día. Al tocar o pasar por una barra se ve su detalle. */
function ActivityChart({ days }: { days: { start: number; total: number; correct: number }[] }) {
  const [active, setActive] = useState(days.length - 1)
  const max = Math.max(10, ...days.map(d => d.total))
  const d = days[active]
  return (
    <div className="chart">
      <p className="chart-readout small muted">Últimas 2 semanas, hoy a la derecha</p>
      <p className="chart-readout small">
        <strong>{dayName(d.start)}</strong>
        {': '}
        {d.total ? `${d.total} preguntas respondidas, ${Math.round((d.correct / d.total) * 100)}% acertadas` : 'no has hecho tests ese día'}
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
