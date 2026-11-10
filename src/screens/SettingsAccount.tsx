import { KeyRound, LogOut } from 'lucide-react'
import { useRef, useState, type FormEvent, type RefObject } from 'react'
import { prepareSignOut } from '../lib/store'
import { sb } from '../lib/supabase'

export function SettingsAccount({ email }: { email?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [done, setDone] = useState('')

  async function signOut() {
    const ok =
      (await prepareSignOut()) ||
      (confirm('Hay respuestas sin subir (no hay conexión). Si cierras sesión ahora se perderán. ¿Cerrar igualmente?') &&
        (await prepareSignOut(true)))
    if (ok) sb!.auth.signOut()
  }

  return (
    <section className="card account-card">
      <h2>Cuenta</h2>
      <p className="muted small">{email}</p>
      {done && <p className="good small">{done}</p>}
      <div className="row gap actions">
        <button className="btn ghost" onClick={() => { setDone(''); dialog.current?.showModal() }}>
          <KeyRound size={18} /> Cambiar contraseña
        </button>
        <button className="btn ghost" onClick={signOut}>
          <LogOut size={18} /> Cerrar sesión
        </button>
      </div>
      <PasswordDialog dialogRef={dialog} email={email} onDone={() => setDone('Contraseña cambiada.')} />
    </section>
  )
}

function PasswordDialog({
  dialogRef,
  email,
  onDone,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>
  email?: string
  onDone: () => void
}) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setCurrent('')
    setPassword('')
    setRepeat('')
    setError('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== repeat) {
      setError('Las contraseñas nuevas no coinciden.')
      return
    }
    setBusy(true)
    // Comprueba la contraseña actual antes de cambiarla
    const check = await sb!.auth.signInWithPassword({ email: email ?? '', password: current })
    if (check.error) {
      setBusy(false)
      setError('La contraseña actual no es correcta.')
      return
    }
    const { error } = await sb!.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    dialogRef.current?.close()
    onDone()
  }

  return (
    <dialog ref={dialogRef} className="modal" onClose={reset}>
      <form className="form modal-form" onSubmit={submit}>
        <h2>Cambiar contraseña</h2>
        <label>
          Contraseña actual
          <input type="password" autoComplete="current-password" required autoFocus value={current} onChange={e => setCurrent(e.target.value)} />
        </label>
        <label>
          Nueva contraseña
          <input type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <label>
          Repite la nueva contraseña
          <input type="password" autoComplete="new-password" required value={repeat} onChange={e => setRepeat(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row gap">
          <button type="button" className="btn ghost" onClick={() => dialogRef.current?.close()}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
