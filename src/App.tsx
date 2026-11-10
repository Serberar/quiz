import type { Session } from '@supabase/supabase-js'
import { BookOpen, ChartColumn, Cog, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { loadSettings } from './lib/settings'
import { flushAnswers, flushAttempts, logError } from './lib/store'
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
    if (session && !settingsLoaded) loadSettings().catch(logError).finally(() => setSettingsLoaded(true))
  }, [session, settingsLoaded])

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('quiz_side_collapsed') === '1'
    } catch {
      return false
    }
  })

  // En escritorio la barra lateral puede plegarse a solo iconos
  useEffect(() => {
    document.body.classList.toggle('side-collapsed', collapsed)
    try {
      localStorage.setItem('quiz_side_collapsed', collapsed ? '1' : '0')
    } catch {
      /* sin almacenamiento: solo dura la sesión */
    }
  }, [collapsed])

  useEffect(() => {
    if (!sb) return
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s) {
        flushAnswers().catch(logError)
        flushAttempts().catch(logError)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="splash" />
  if (sb && !session) return <Login />
  if (!settingsLoaded) return <div className="splash" />

  return (
    <>
    <div className={'app' + (immersive ? '' : ' with-tabs')}>
      {/* Practice se mantiene montado para no perder la asignatura elegida al cambiar de pestaña */}
      <div hidden={tab !== 'practice'}>
        <Practice onImmersive={setImmersive} libraryVersion={libraryVersion} />
      </div>
      {tab === 'metrics' && <Metrics />}
      {tab === 'settings' && <Settings email={session?.user.email} onLibraryChange={() => setLibraryVersion(v => v + 1)} />}
    </div>

      {/* Fuera de .app: su animación usa transform y anclaría la barra fija al contenedor */}
      {!immersive && (
        <nav className="tabbar">
          <div className="brand">
            <img src={import.meta.env.BASE_URL + 'icon-192.png'} alt="" />
            <span>Quiz</span>
          </div>
          <button
            className="side-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral'}
            title={collapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral'}
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
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
          <p className="credit">Creado por Sergio Bernabé</p>
        </nav>
      )}
    </>
  )
}
