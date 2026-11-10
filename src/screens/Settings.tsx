import { Download, LogOut, Trash2, Upload } from 'lucide-react'
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { addCustom, listCustom, parseSubject, removeCustom } from '../lib/custom'
import { fetchManifest, type SubjectMeta } from '../lib/data'
import { examIso, hiddenSubjects, setExamIso, setHiddenSubjects } from '../lib/settings'
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
    <div className="settings">
      <header className="hero-head">
        <div>
          <p className="eyebrow">Tu cuenta y tu temario</p>
          <h1>Ajustes</h1>
        </div>
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
    </div>
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
  const [list, setList] = useState<SubjectMeta[] | null>(null)
  const [target, setTarget] = useState<SubjectMeta | null>(null) // asignatura cuyo borrado se está confirmando
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const hidden = hiddenSubjects()

  function reload() {
    fetchManifest().then(setList, err => setError(msgOf(err)))
  }

  useEffect(reload, [])

  function done(msg: string) {
    setInfo(msg)
    setError('')
    reload()
    onLibraryChange()
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // para poder volver a elegir el mismo archivo
    if (!file) return
    setInfo('')
    setError('')
    try {
      const subject = parseSubject(await file.text(), file.name)
      // Sin mayúsculas ni espacios de por medio: "bases de datos" y "Bases de Datos" son la misma
      const names = [...(await fetchManifest()).map(m => m.name), ...(await listCustom()).map(c => c.name), ...hiddenSubjects()]
      const key = (n: string) => n.trim().toLowerCase()
      if (names.some(n => key(n) === key(subject.name))) throw new Error(`Ya existe una asignatura llamada "${subject.name}".`)
      await addCustom(subject)
      done(`"${subject.name}" añadida con ${subject.questions.length} preguntas.`)
    } catch (err) {
      setError(msgOf(err))
    }
  }

  function askDelete(m: SubjectMeta) {
    setTarget(m)
    setTyped('')
    setInfo('')
    setError('')
  }

  async function confirmDelete(m: SubjectMeta) {
    setBusy(true)
    setError('')
    try {
      if (m.custom) {
        await removeCustom(m.name)
        done(`"${m.name}" borrada.`)
      } else {
        await setHiddenSubjects([...hiddenSubjects(), m.name])
        done(`"${m.name}" oculta. Puedes volver a mostrarla abajo.`)
      }
      setTarget(null)
    } catch (err) {
      setError(msgOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function unhide(name: string) {
    setError('')
    try {
      await setHiddenSubjects(hiddenSubjects().filter(n => n !== name))
      done(`"${name}" vuelve a mostrarse.`)
    } catch (err) {
      setError(msgOf(err))
    }
  }

  return (
    <section className="card">
      <h2>Asignaturas</h2>
      <p className="muted small">
        Las del temario se ocultan en tu cuenta (el archivo sigue en el repositorio). Las que añades tú se borran del todo.
      </p>

      {list === null && !error && <p className="muted small">Cargando…</p>}
      {list?.map(m => (
        <div key={m.file}>
          <div className="row">
            <span className="grow">
              {m.name} <span className="muted small">· {m.count} preguntas{m.custom ? ' · propia' : ''}</span>
            </span>
            <button className="icon-btn" title="Borrar" aria-label={`Borrar ${m.name}`} onClick={() => askDelete(m)}>
              <Trash2 size={18} />
            </button>
          </div>
          {target?.file === m.file && (
            <div className="confirm">
              <p className="small">
                {m.custom
                  ? 'Se borran sus preguntas. El progreso se conserva si la vuelves a añadir.'
                  : 'Se oculta de la app. El archivo sigue en el repositorio.'}{' '}
                Para confirmar, escribe <strong>{m.name}</strong>:
              </p>
              <input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" aria-label="Nombre para confirmar" />
              <div className="row gap">
                <button className="btn ghost" onClick={() => setTarget(null)}>
                  Cancelar
                </button>
                <button className="btn danger" disabled={busy || typed !== m.name} onClick={() => confirmDelete(m)}>
                  Borrar
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {hidden.length > 0 && (
        <>
          <h2>Ocultas</h2>
          {hidden.map(name => (
            <div className="row" key={name}>
              <span className="grow muted">{name}</span>
              <button className="btn ghost" onClick={() => unhide(name)}>
                Mostrar
              </button>
            </div>
          ))}
        </>
      )}

      <h2>Añadir</h2>
      <div className="row gap actions">
        <label className="btn ghost">
          <Upload size={18} /> Añadir JSON
          <input type="file" accept=".json,application/json" hidden onChange={upload} />
        </label>
        <a className="btn ghost" download="plantilla_asignatura.json" href={'data:application/json;charset=utf-8,' + encodeURIComponent(TEMPLATE)}>
          <Download size={18} /> Descargar plantilla
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
