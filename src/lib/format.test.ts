import { describe, expect, it } from 'vitest'
import { pct, tone } from './format'

describe('format', () => {
  it('pct redondea y no divide entre cero', () => {
    expect(pct(2, 3)).toBe(67)
    expect(pct(0, 0)).toBe(0)
  })

  it('tone usa verde desde 7, ámbar desde el aprobado y gris sin nota', () => {
    expect(tone(7.5)).toBe('good')
    expect(tone(5)).toBe('warn')
    expect(tone(4.9)).toBe('bad')
    expect(tone(null)).toBe('muted')
  })
})
