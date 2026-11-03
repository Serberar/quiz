import { Check, Copy, Flag, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchManifest, fetchSubject, type Question } from '../lib/data'
import { loadFlags, onFlagsChange, parseFlag, setFlag } from '../lib/store'

type Item = { key: string; subject: string; q: Question }

/** Preguntas marcadas como dudosas, con la respuesta y un botón para copiarlas todas (para revisarlas o corregirlas). */
export default function Flagged() {
  const [flags, setFlags] = useState<Set<string> | null>(null)
  const [questions, setQuestions] = useState<Map<string, Question[]>>(new Map())
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadFlags().then(setFlags)
    return onFlagsChange(setFlags)
  }, [])

  // Carga solo las asignaturas que tienen alguna marcada
  const needed = flags ? [...new Set([...flags].map(k => parseFlag(k).subject))].filter(s => !questions.has(s)) : []
  const neededKey = needed.join('|')
  useEffect(() => {
    if (!neededKey) return
    fetchManifest()
      .then(list => Promise.all(list.filter(m => neededKey.split('|').includes(m.name)).map(fetchSubject)))
      .then(subjects => setQuestions(prev => new Map([...prev, ...subjects.map(s => [s.name, s.questions] as const)])))
      .catch(() => {})
  }, [neededKey])

  if (!flags) return null

  const items: Item[] = []
  for (const key of flags) {
    const { subject, id } = parseFlag(key)
    const q = questions.get(subject)?.find(x => x.id === id)
    if (q) items.push({ key, subject, q })
  }
  items.sort((a, b) => a.subject.localeCompare(b.subject, 'es') || a.q.id - b.q.id)

  async function copyAll() {
    const text = items
      .map(({ subject, q }) =>
        [`${subject} · id ${q.id}${q.unit ? ' · ' + q.unit : ''}`, q.question, ...q.options.map(o => (o === q.correct ? `  * ${o} (marcada como correcta)` : `  - ${o}`)), q.explicacion ? `Explicación: ${q.explicacion}` : '']
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      alert('No se pudo copiar. Mantén pulsado el texto para copiarlo a mano.')
    }
  }

  return (
    <section className="card">
      <div className="row">
        <h2>
          <Flag size={14} /> Preguntas dudosas ({flags.size})
        </h2>
        {items.length > 0 && (
          <button className="link row gap" onClick={copyAll}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiadas' : 'Copiar todas'}
          </button>
        )}
      </div>
      {flags.size === 0 ? (
        <p className="muted small">
          Durante un test, pulsa la bandera en las preguntas que creas que están mal o que no entiendes. Aparecerán aquí
          con su respuesta para revisarlas o corregirlas.
        </p>
      ) : items.length < flags.size && questions.size === 0 ? (
        <p className="muted small">Cargando…</p>
      ) : (
        <div className="list flagged">
          {items.map(({ key, subject, q }) => (
            <div key={key} className="review">
              <div className="review-q">
                <div className="grow">
                  <div className="flag-tags">
                    <span className="tag accent">{subject}</span>
                    {q.unit && <span className="tag">{q.unit}</span>}
                  </div>
                  {q.question}
                </div>
                <button className="icon-btn" onClick={() => setFlag(subject, q.id, false)} aria-label="Quitar de dudosas" title="Quitar de dudosas">
                  <X size={18} />
                </button>
              </div>
              <p className="good small">Respuesta marcada como correcta: {q.correct}</p>
              {q.explicacion && <p className="explanation">{q.explicacion}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
