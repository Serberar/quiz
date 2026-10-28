import { LoaderCircle, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MODE_LABEL, PASS_GRADE } from '../lib/quiz'
import { loadAttempts, type Attempt } from '../lib/store'
import { sb } from '../lib/supabase'

const fmt = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 1 })
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

function summarize(list: Attempt[]) {
  const exams = list.filter(a => a.mode === 'exam')
  const practice = list.filter(a => a.mode !== 'exam')
  const answered = practice.reduce((s, a) => s + a.total, 0)
  return {
    exams: exams.length,
    passed: exams.filter(a => a.grade >= PASS_GRADE).length,
    avgGrade: exams.length ? avg(exams.map(a => a.grade)) : null,
    practice: practice.length,
    practiceAcc: answered ? pct(practice.reduce((s, a) => s + a.correct, 0), answered) : null,
  }
}

const tone = (g: number | null) => (g === null ? 'muted' : g >= 7 ? 'good' : g >= PASS_GRADE ? 'warn' : 'bad')

export default function Metrics({ email }: { email?: string }) {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null)

  useEffect(() => {
    loadAttempts().then(setAttempts)
  }, [])

  if (!attempts) {
    return (
      <p className="muted center">
        <LoaderCircle className="spin" size={20} />
      </p>
    )
  }

  const total = summarize(attempts)
  const groups = new Map<string, Attempt[]>()
  for (const a of attempts) groups.set(a.subject, [...(groups.get(a.subject) ?? []), a])
  const bySubject = [...groups]
    .map(([name, list]) => ({ name, ...summarize(list) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const recent = attempts.slice(-15).reverse()

  return (
    <>
      <header className="page-head">
        <h1>Métricas</h1>
      </header>

      {attempts.length === 0 ? (
        <p className="muted center">Aún no has terminado ningún test. Haz uno y aquí verás tu evolución.</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <span>Exámenes</span>
              <strong>{total.exams}</strong>
            </div>
            <div className="kpi">
              <span>Aprobados</span>
              <strong className={total.exams ? tone(pct(total.passed, total.exams) / 10) : 'muted'}>
                {total.exams ? pct(total.passed, total.exams) + '%' : '—'}
              </strong>
              <small className="muted">
                {total.passed} de {total.exams}
              </small>
            </div>
            <div className="kpi">
              <span>Nota media</span>
              <strong className={tone(total.avgGrade)}>{total.avgGrade === null ? '—' : fmt(total.avgGrade)}</strong>
            </div>
            <div className="kpi">
              <span>Acierto práctica</span>
              <strong>{total.practiceAcc === null ? '—' : total.practiceAcc + '%'}</strong>
              <small className="muted">{total.practice} tests</small>
            </div>
          </div>

          <section className="card">
            <h2>Por asignatura</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Asignatura</th>
                    <th>Exám.</th>
                    <th>Aprob.</th>
                    <th>Media</th>
                    <th>Práct.</th>
                  </tr>
                </thead>
                <tbody>
                  {bySubject.map(s => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td>{s.exams}</td>
                      <td>{s.exams ? pct(s.passed, s.exams) + '%' : '—'}</td>
                      <td className={tone(s.avgGrade)}>{s.avgGrade === null ? '—' : fmt(s.avgGrade)}</td>
                      <td>{s.practiceAcc === null ? '—' : s.practiceAcc + '%'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>Últimos tests</h2>
            <div className="list">
              {recent.map(a => (
                <div key={a.id} className="history-row">
                  <div>
                    <div className="list-title">{a.subject}</div>
                    <div className="muted small">
                      {MODE_LABEL[a.mode]} · {a.correct}/{a.total} ·{' '}
                      {new Date(a.created_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                  <strong className={tone(a.grade)}>{fmt(a.grade)}</strong>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {sb && (
        <section className="card account">
          <span className="muted small">{email}</span>
          <button className="btn ghost" onClick={() => sb!.auth.signOut()}>
            <LogOut size={18} /> Cerrar sesión
          </button>
        </section>
      )}
    </>
  )
}
