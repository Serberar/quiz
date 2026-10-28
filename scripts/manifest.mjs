// Genera public/data/manifest.json a partir de los JSON de asignaturas.
// Las asignaturas sin campo "semester" cuentan como 1º semestre.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const dir = new URL('../public/data/', import.meta.url)
const subjects = []
for (const file of readdirSync(dir).sort()) {
  if (!file.endsWith('.json') || file === 'manifest.json') continue
  const data = JSON.parse(readFileSync(new URL(file, dir), 'utf8'))
  if (!Array.isArray(data.questions)) {
    console.warn(`Ignorando ${file}: no tiene "questions"`)
    continue
  }
  subjects.push({
    name: data.subject ?? file.replace('.json', ''),
    file,
    semester: data.semester ?? 1,
    count: data.questions.length,
  })
}
writeFileSync(new URL('manifest.json', dir), JSON.stringify({ subjects }, null, 2) + '\n')
console.log(`manifest.json: ${subjects.length} asignaturas`)
