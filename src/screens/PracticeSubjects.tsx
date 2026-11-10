import { ChevronRight, LoaderCircle } from 'lucide-react'
import type { SubjectMeta } from '../lib/data'
import { fmt, tone } from '../lib/format'
import { progressSummary, type AllProgress } from '../lib/quiz'
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
        const sum = progressSummary(all[s.name] ?? {}, s.count)
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
            <div className="estimate" title="Nota estimada si el examen fuera hoy">
              <strong className={sum.seen ? tone(sum.estimate) : 'muted'}>{sum.seen ? fmt(sum.estimate) : '—'}</strong>
              <span>si fuera hoy</span>
            </div>
            {loading === s.file ? <LoaderCircle className="spin" size={20} /> : <ChevronRight size={20} className="muted" />}
          </button>
        )
      })}
    </div>
  )
}
