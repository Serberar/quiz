import type { Session } from '@supabase/supabase-js'
import { BookOpen, ChartColumn, Cog } from 'lucide-react'
import { useEffect, useState } from 'react'
import { loadSettings } from './lib/settings'
import { flushAnswers, flushAttempts } from './lib/store'
import { sb } from './lib/supabase'
import Login from './screens/Login'
import Metrics from './screens/Metrics'
import Practice from './screens/Practice'
import Settings from './screens/Settings'

type Tab = 'practice' | 'metrics' | 'settings'

export default function App() {
  // undefined = comprobando sesión; null = sin sesión (o modo local sin Supabase)
  const [session, setSession] = useState<Session | null | undefined>(sb ? undefined : null)
  const [tab, setTab] = useState<Tab>('practice')
  const [immersive, setImmersive] = useState(false) // durante un test se oculta la barra de pestañas
  const [settingsLoaded, setSettingsLoaded] = useState(!sb) // la fecha del examen se lee de la base de datos al entrar
  const [libraryVersion, setLibraryVersion] = useState(0) // sube al añadir o quitar asignaturas propias

  useEffect(() => {
    if (session && !settingsLoaded) loadSettings().catch(() => {}).finally(() => setSettingsLoaded(true))
  }, [session, settingsLoaded])

  useEffect(() => {
    if (!sb) return
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s) {
        flushAnswers().catch(() => {})
        flushAttempts().catch(() => {})
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="splash" />
  if (sb && !session) return <Login />
  if (!settingsLoaded) return <div className="splash" />

  return (
    <div className={'app' + (immersive ? '' : ' with-tabs')}>
      {/* Practice se mantiene montado para no perder la asignatura elegida al cambiar de pestaña */}
      <div hidden={tab !== 'practice'}>
        <Practice onImmersive={setImmersive} libraryVersion={libraryVersion} />
      </div>
      {tab === 'metrics' && <Metrics />}
      {tab === 'settings' && <Settings email={session?.user.email} onLibraryChange={() => setLibraryVersion(v => v + 1)} />}

      {!immersive && (
        <nav className="tabbar">
          <button className={tab === 'practice' ? 'active' : ''} onClick={() => setTab('practice')}>
            <BookOpen size={22} />
            <span>Practicar</span>
          </button>
          <button className={tab === 'metrics' ? 'active' : ''} onClick={() => setTab('metrics')}>
            <ChartColumn size={22} />
            <span>Métricas</span>
          </button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            <Cog size={22} />
            <span>Ajustes</span>
          </button>
        </nav>
      )}
    </div>
  )
}
