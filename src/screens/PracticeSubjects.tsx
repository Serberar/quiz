import { ChevronRight, LoaderCircle } from 'lucide-react'
import type { SubjectMeta } from '../lib/data'
import { accuracy, progressSummary, type AllProgress } from '../lib/quiz'
import Mastery from './Mastery'

/** Tarjetas de cada asignatura en Practicar: progreso y nota estimada */
export default function PracticeSubjects({
  subjects,
  all,
  loading,
  onOpen,
}: {
  subjects: SubjectMeta[]
  all: AllProgress
  loading: string | null
  onOpen: (s: SubjectMeta) => void
}) {
  return (
    <div className="list subjects">
      {subjects.map(s => {
        const progress = all[s.name] ?? {}
        const sum = progressSummary(progress, s.count)
        const acc = accuracy(progress)
        return (
          <button key={s.file} className="list-item subject" onClick={() => onOpen(s)} disabled={loading !== null}>
            <div className="grow">
              <div className="list-title">{s.name}</div>
              <div className="muted small">
                {sum.seen}/{s.count} vistas
                {sum.failed > 0 && <span className="bad"> · {sum.failed} falladas</span>}
              </div>
              <Mastery {...sum} />
            </div>
            <div className="estimate" title="Respuestas acertadas sobre el total respondido">
              <strong className={acc === null ? 'muted' : acc >= 0.7 ? 'good' : acc >= 0.5 ? 'warn' : 'bad'}>
                {acc === null ? '—' : Math.round(acc * 100) + '%'}
              </strong>
              <span>acierto</span>
            </div>
            {loading === s.file ? <LoaderCircle className="spin" size={20} /> : <ChevronRight size={20} className="muted" />}
          </button>
        )
      })}
    </div>
  )
}
