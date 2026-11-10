import { CalendarCheck, LoaderCircle, Zap } from 'lucide-react'
import type { dailyPlan } from '../lib/quiz'
import Ring from './Ring'

const pct = (x: number, up = false) => (up ? Math.ceil(x * 100) : Math.round(x * 100))

/** Tarjeta "Hoy" de Practicar: anillo de temario, ritmo y botón de Estudiar */
export default function TodayCard({
  plan,
  goalDone,
  mastery,
  expected,
  pace,
  count,
  loading,
  onStart,
}: {
  plan: ReturnType<typeof dailyPlan>
  goalDone: boolean
  mastery: number
  expected: number | null
  pace: { label: string; tone: string } | null
  count: number
  loading: string | null
  onStart: () => void
}) {
  return (
    <section className="card today">
      <p className="today-hint muted small">
        {goalDone ? 'Objetivo cumplido: si sigues, adelantas.' : 'Repasos, fallos y temario nuevo, lo flojo primero.'}
      </p>
      <div className="today-top">
        <div className="today-ring">
          <Ring value={mastery} tone="accent" size={112}>
            <strong>{pct(mastery)}%</strong>
            <span>temario</span>
          </Ring>
          {pace && expected !== null && (
            <div className="pace">
              <span>deberías {pct(expected, true)}%</span>
              <strong className={pace.tone}>{pace.label}</strong>
            </div>
          )}
        </div>
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
            <div>
              <strong className={plan.leftToday ? '' : 'good'}>{plan.leftToday}</strong>
              <span>faltan hoy</span>
            </div>
          </div>
        </div>
      </div>
      <button className="btn primary glow big" onClick={onStart} disabled={loading !== null}>
        {loading === 'daily' ? (
          <LoaderCircle className="spin" size={22} />
        ) : (
          <>
            <Zap size={20} /> {goalDone ? 'Seguir estudiando' : 'Estudiar'}
            <small>{count} preguntas</small>
          </>
        )}
      </button>
    </section>
  )
}
