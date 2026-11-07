import type { Session } from '@supabase/supabase-js'
import { BookOpen, ChartColumn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { flushAnswers, flushAttempts } from './lib/store'
import { sb } from './lib/supabase'
import Login from './screens/Login'
import Metrics from './screens/Metrics'
import Practice from './screens/Practice'

type Tab = 'practice' | 'metrics'

export default function App() {
  // undefined = comprobando sesión; null = sin sesión (o modo local sin Supabase)
  const [session, setSession] = useState<Session | null | undefined>(sb ? undefined : null)
  const [tab, setTab] = useState<Tab>('practice')
  const [immersive, setImmersive] = useState(false) // durante un test se oculta la barra de pestañas

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

  return (
    <>
    <div className={'app' + (immersive ? '' : ' with-tabs')}>
      {/* Practice se mantiene montado para no perder la asignatura elegida al cambiar de pestaña */}
      <div hidden={tab !== 'practice'}>
        <Practice onImmersive={setImmersive} />
      </div>
      {tab === 'metrics' && <Metrics email={session?.user.email} />}
    </div>

      {/* Fuera de .app: su animación usa transform y anclaría la barra fija al contenedor */}
      {!immersive && (
        <nav className="tabbar">
          <div className="brand">
            <img src={import.meta.env.BASE_URL + 'icon-192.png'} alt="" />
            <span>Quiz DAW</span>
          </div>
          <button className={tab === 'practice' ? 'active' : ''} onClick={() => setTab('practice')}>
            <BookOpen size={22} />
            <span>Practicar</span>
          </button>
          <button className={tab === 'metrics' ? 'active' : ''} onClick={() => setTab('metrics')}>
            <ChartColumn size={22} />
            <span>Métricas</span>
          </button>
        </nav>
      )}
    </>
  )
}
