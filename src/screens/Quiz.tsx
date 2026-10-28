import { Languages, SkipForward, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MODE_LABEL, type Answer, type Mode, type Progress, type QuizQuestion } from '../lib/quiz'

type Props = {
  subject: string
  mode: Mode
  questions: QuizQuestion[]
  progress: Progress
  onAnswer: (id: number, ok: boolean) => void
  onFinish: (answers: Answer[]) => void
  onExit: () => void
}

export default function Quiz({ subject, mode, questions, progress, onAnswer, onFinish, onExit }: Props) {
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [translated, setTranslated] = useState(false)

  const q = questions[idx]
  const current = answers[idx] as Answer | undefined
  const isLast = idx === questions.length - 1
  const t = translated && q.traduccion ? q.traduccion : null
  const optionText = (opt: string) => (t ? t.opciones[q.options.indexOf(opt)] ?? opt : opt)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [idx])

  function choose(opt: string) {
    if (current) return
    const ok = opt === q.correct
    onAnswer(q.id, ok)
    setAnswers([...answers, { q, sel: opt, ok }])
  }

  function advance(list: Answer[]) {
    if (isLast) return onFinish(list)
    setAnswers(list)
    setIdx(idx + 1)
    setTranslated(false)
  }

  function exit() {
    if (answers.length === 0 || confirm('¿Salir del test? Las respuestas dadas ya cuentan para tu progreso.')) onExit()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const n = Number(e.key)
      if (!current && n >= 1 && n <= q.shuffled.length) choose(q.shuffled[n - 1])
      else if (current && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        advance(answers)
      } else if (e.key === 'Escape') exit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hist = progress[q.id]
  const histPct = hist && hist.c + hist.w > 0 ? Math.round((hist.c / (hist.c + hist.w)) * 100) : null

  return (
    <div className="quiz">
      <header className="quiz-head">
        <button className="icon-btn" onClick={exit} aria-label="Salir">
          <X size={22} />
        </button>
        <div className="quiz-title">
          <span>{subject}</span>
          <span className="muted small">
            {MODE_LABEL[mode]} · {idx + 1}/{questions.length}
          </span>
        </div>
        {q.traduccion ? (
          <button
            className={'icon-btn' + (translated ? ' active' : '')}
            onClick={() => setTranslated(!translated)}
            aria-label="Traducir"
            title="Traducir"
          >
            <Languages size={20} />
          </button>
        ) : (
          <span className="icon-btn" />
        )}
      </header>
      <div className="bar">
        <div style={{ width: `${((idx + (current ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>

      <div className="meta">
        {q.unit && <span className="tag">{q.unit}</span>}
        {mode === 'smart' && (
          <span className={'small ' + (histPct === null ? 'muted' : histPct >= 80 ? 'good' : histPct >= 60 ? 'warn' : 'bad')}>
            {histPct === null ? 'Nueva' : `${histPct}% de acierto`}
          </span>
        )}
      </div>

      <h2 className="question">{t ? t.pregunta : q.question}</h2>

      <div className="options">
        {q.shuffled.map((opt, i) => {
          let cls = 'option'
          if (current) {
            if (opt === q.correct) cls += ' correct'
            else if (opt === current.sel) cls += ' wrong'
            else cls += ' dim'
          }
          return (
            <button key={opt} className={cls} onClick={() => choose(opt)} disabled={!!current}>
              <span className="key">{i + 1}</span>
              <span>{optionText(opt)}</span>
            </button>
          )
        })}
      </div>

      {current && (
        <div className={'feedback ' + (current.ok ? 'ok' : 'fail')}>
          <strong>{current.ok ? 'Correcto' : 'Incorrecto'}</strong>
          {!current.ok && <p>La respuesta correcta es: {t ? t.correcta : q.correct}</p>}
          {q.explicacion && <p className="explanation">{q.explicacion}</p>}
        </div>
      )}

      <div className="quiz-actions">
        {current ? (
          <button className="btn primary" onClick={() => advance(answers)}>
            {isLast ? 'Ver resultados' : 'Siguiente'}
          </button>
        ) : (
          mode === 'exam' && (
            <button className="btn ghost" onClick={() => advance([...answers, { q, sel: null, ok: false }])}>
              <SkipForward size={18} /> Saltar pregunta
            </button>
          )
        )}
      </div>
    </div>
  )
}
