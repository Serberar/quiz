import type { ReactNode } from 'react'

/** Anillo de progreso (value de 0 a 1) que se rellena con animación. */
export default function Ring({ value, tone, size = 120, children }: { value: number; tone: string; size?: number; children: ReactNode }) {
  const p = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      className={'ring ' + tone}
      style={{ '--p': p, width: size, height: size } as React.CSSProperties}
      role="img"
      aria-label={`${Math.round(p)}%`}
    >
      <div className="ring-inner">{children}</div>
    </div>
  )
}
