import { Download, Trash2, Upload } from 'lucide-react'
import { useEffect, useState, type ChangeEvent } from 'react'
import { addCustom, listCustom, parseSubject, removeCustom } from '../lib/custom'
import { fetchManifest, type SubjectMeta } from '../lib/data'
import { messageOf } from '../lib/format'
import { hiddenSubjects, setHiddenSubjects } from '../lib/settings'

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

export function SettingsSubjects({ onLibraryChange }: { onLibraryChange: () => void }) {
  const [list, setList] = useState<SubjectMeta[] | null>(null)
  const [target, setTarget] = useState<SubjectMeta | null>(null) // asignatura cuyo borrado se está confirmando
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const hidden = hiddenSubjects()

  function reload() {
    fetchManifest().then(setList, err => setError(messageOf(err)))
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
      setError(messageOf(err))
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
      setError(messageOf(err))
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
      setError(messageOf(err))
    }
  }

  return (
    <section className="card wide">
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

