import { LogOut, Trash2, Upload } from 'lucide-react'
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { addCustom, listCustom, parseSubject, removeCustom, type CustomMeta } from '../lib/custom'
import { fetchManifest } from '../lib/data'
import { examIso, setExamIso } from '../lib/settings'
import { prepareSignOut } from '../lib/store'
import { sb } from '../lib/supabase'

const TEMPLATE = `{
  "subject": "Nombre de la asignatura",
  "questions": [
    {
      "id": 1,
      "unit": "UT1",
      "question": "¿Pregunta?",
      "options": ["A", "B", "C", "D"],
      "correct": "B",
      "explicacion": "Opcional"
    }
  ]
}
`

const msgOf = (err: unknown) => (typeof err === 'object' && err && 'message' in err ? String(err.message) : 'Algo ha fallado.')

export default function Settings({ email, onLibraryChange }: { email?: string; onLibraryChange: () => void }) {
  return (
    <>
      <header className="page-head">
        <h1>Configuración</h1>
      </header>
      <ExamDate />
      <Subjects onLibraryChange={onLibraryChange} />
      {sb && <Password />}
      {sb && (
        <section className="card account">
          <span className="muted small">{email}</span>
          <button
            className="btn ghost"
            onClick={async () => {
              const ok =
                (await prepareSignOut()) ||
                (confirm('Hay respuestas sin subir (no hay conexión). Si cierras sesión ahora se perderán. ¿Cerrar igualmente?') &&
                  (await prepareSignOut(true)))
              if (ok) sb!.auth.signOut()
            }}
          >
            <LogOut size={18} /> Cerrar sesión
          </button>
        </section>
      )}
    </>
  )
}

function ExamDate() {
  const [date, setDate] = useState(examIso)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await setExamIso(date)
      setSaved(true)
    } catch (err) {
      setError(msgOf(err))
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Fecha del examen</h2>
      <label>
        Día del examen
        <input type="date" required value={date} onChange={e => { setDate(e.target.value); setSaved(false) }} />
      </label>
      {saved && <p className="good small">Fecha guardada.</p>}
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={saved}>
        Guardar fecha
      </button>
    </form>
  )
}

function Subjects({ onLibraryChange }: { onLibraryChange: () => void }) {
  const [list, setList] = useState<CustomMeta[] | null>(null)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')

  function reload() {
    listCustom().then(setList, err => setError(msgOf(err)))
  }

  useEffect(reload, [])

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // para poder volver a elegir el mismo archivo
    if (!file) return
    setInfo('')
    setError('')
    try {
      const subject = parseSubject(await file.text(), file.name)
      const names = (await fetchManifest()).map(m => m.name)
      if (names.includes(subject.name)) throw new Error(`Ya existe una asignatura llamada "${subject.name}".`)
      await addCustom(subject)
      setInfo(`"${subject.name}" añadida con ${subject.questions.length} preguntas.`)
      reload()
      onLibraryChange()
    } catch (err) {
      setError(msgOf(err))
    }
  }

  async function remove(name: string) {
    if (!confirm(`¿Quitar "${name}"? Se borran sus preguntas. El progreso se conserva si la vuelves a añadir.`)) return
    setInfo('')
    setError('')
    try {
      await removeCustom(name)
      reload()
      onLibraryChange()
    } catch (err) {
      setError(msgOf(err))
    }
  }

  return (
    <section className="card">
      <h2>Asignaturas propias</h2>
      <p className="muted small">Son las que añades tú con un JSON. Las del temario de la app no se pueden quitar desde aquí.</p>

      {list === null && !error && <p className="muted small">Cargando…</p>}
      {list?.length === 0 && <p className="muted small">Todavía no has añadido ninguna.</p>}
      {list?.map(s => (
        <div className="row" key={s.name}>
          <span className="grow">
            {s.name} <span className="muted small">· {s.count} preguntas</span>
          </span>
          <button className="icon-btn" title="Quitar" aria-label={`Quitar ${s.name}`} onClick={() => remove(s.name)}>
            <Trash2 size={18} />
          </button>
        </div>
      ))}

      <div className="row gap">
        <label className="btn ghost">
          <Upload size={18} /> Añadir JSON
          <input type="file" accept=".json,application/json" hidden onChange={upload} />
        </label>
        <a
          className="btn ghost"
          download="plantilla_asignatura.json"
          href={'data:application/json;charset=utf-8,' + encodeURIComponent(TEMPLATE)}
        >
          Descargar plantilla
        </a>
      </div>

      <details>
        <summary className="muted small">Ver formato de la plantilla</summary>
        <pre className="template">{TEMPLATE}</pre>
      </details>

      {info && <p className="good small">{info}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

function Password() {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setInfo('')
    setError('')
    if (password !== repeat) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setBusy(true)
    const { error } = await sb!.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setPassword('')
    setRepeat('')
    setInfo('Contraseña cambiada.')
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Cambiar contraseña</h2>
      <label>
        Nueva contraseña
        <input type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} />
      </label>
      <label>
        Repite la nueva contraseña
        <input type="password" autoComplete="new-password" required value={repeat} onChange={e => setRepeat(e.target.value)} />
      </label>
      {info && <p className="good small">{info}</p>}
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
    </form>
  )
}
