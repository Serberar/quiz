import { useState, type FormEvent } from 'react'
import { sb } from '../lib/supabase'
import { messageOf } from '../lib/format'
import { examIso, setExamIso } from '../lib/settings'
import { SettingsAccount } from './SettingsAccount'
import { SettingsSubjects } from './SettingsSubjects'

export default function Settings({ email, onLibraryChange }: { email?: string; onLibraryChange: () => void }) {
  return (
    <div className="settings">
      <header className="hero-head wide">
        <div>
          <p className="eyebrow">Tu cuenta y tu temario</p>
          <h1>Ajustes</h1>
        </div>
      </header>
      <SettingsSubjects onLibraryChange={onLibraryChange} />
      <div className="pair">
        <ExamDate />
        {sb && <SettingsAccount email={email} />}
      </div>
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
      setError(messageOf(err))
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

