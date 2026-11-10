import { describe, expect, it } from 'vitest'
import { parseSubject } from './custom'

const q = (over: Record<string, unknown> = {}) => ({ id: 1, question: '¿?', options: ['A', 'B'], correct: 'A', ...over })

describe('parseSubject', () => {
  it('acepta una asignatura válida y usa el nombre del archivo si no hay "subject"', () => {
    const s = parseSubject(JSON.stringify({ questions: [q()] }), 'redes.json')
    expect(s).toEqual({ name: 'redes', questions: [q()] })
  })

  it('rechaza una respuesta correcta que no está entre las opciones', () => {
    expect(() => parseSubject(JSON.stringify({ questions: [q({ correct: 'Z' })] }), 'x.json')).toThrow('"correct"')
  })

  it('rechaza ids repetidos', () => {
    expect(() => parseSubject(JSON.stringify({ questions: [q(), q()] }), 'x.json')).toThrow('"id"')
  })
})
