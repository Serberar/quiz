import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sin Supabase: se prueba la rama de localStorage, nunca la base de datos
vi.mock('./supabase', () => ({ sb: null }))

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  }
}

const subject = (name: string) => ({ name, questions: [{ id: 1, question: '¿?', options: ['a', 'b'], correct: 'a' }] })

describe('ajustes sin Supabase', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', fakeStorage())
  })

  it('la fecha del examen se guarda y se lee de nuevo', async () => {
    const s = await import('../lib/settings')
    await s.setExamIso('2027-02-10')
    expect(s.examIso()).toBe('2027-02-10')
    vi.resetModules()
    const again = await import('../lib/settings')
    await again.loadSettings()
    expect(again.examIso()).toBe('2027-02-10')
  })

  it('las asignaturas ocultas se guardan', async () => {
    const s = await import('../lib/settings')
    await s.setHiddenSubjects(['Programación'])
    expect(s.hiddenSubjects()).toEqual(['Programación'])
  })
})

describe('asignaturas propias sin Supabase', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', fakeStorage())
  })

  it('añade, lista, lee y quita', async () => {
    const c = await import('../lib/custom')
    await c.addCustom(subject('Redes'))
    expect(await c.listCustom()).toEqual([{ name: 'Redes', count: 1 }])
    expect((await c.getCustom('Redes')).name).toBe('Redes')
    await c.removeCustom('Redes')
    expect(await c.listCustom()).toEqual([])
  })

  it('no sustituye una asignatura que ya existe', async () => {
    const c = await import('../lib/custom')
    await c.addCustom(subject('Redes'))
    await expect(c.addCustom(subject('Redes'))).rejects.toThrow('Ya existe')
    expect((await c.getCustom('Redes')).questions).toHaveLength(1)
  })
})
