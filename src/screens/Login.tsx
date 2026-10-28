import { useState, type FormEvent } from 'react'
import { sb } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    // Supabase solo acepta email: "davorsg" se completa como davorsg@gmail.com
    const login = email.includes('@') ? email.trim() : email.trim() + '@gmail.com'
    const { error } = await sb!.auth.signInWithPassword({ email: login, password })
    setBusy(false)
    if (error) setError(error.message === 'Invalid login credentials' ? 'Usuario o contraseña incorrectos' : error.message)
  }

  return (
    <div className="app login">
      <img src={import.meta.env.BASE_URL + 'icon-192.png'} alt="" className="login-logo" />
      <h1>Quiz DAW</h1>
      <p className="muted">Inicia sesión para guardar tu progreso</p>
      <form className="card form" onSubmit={submit}>
        <label>
          Usuario
          <input type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
