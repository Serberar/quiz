# Quiz DAW

Aplicación web instalable (PWA) para **preparar exámenes tipo test** de DAW. Lee las preguntas de archivos JSON, sincroniza tu progreso con Supabase y te enseña tus métricas: porcentaje de aprobados, nota media y acierto por asignatura.

## Funcionalidades

- **Tres modos:**
  - **Aleatorio:** preguntas al azar.
  - **Refuerzo:** prioriza las preguntas que más fallas.
  - **Examen:** 30 preguntas; cada 3 errores restan un acierto y las preguntas sin responder no penalizan.
- Asignaturas separadas por semestre, filtro por unidades y número de preguntas configurable.
- Traducción de las preguntas de inglés y explicación de cada respuesta.
- **Métricas:** exámenes hechos, % de aprobados, nota media, acierto en práctica y últimos tests.
- Inicio de sesión con email y contraseña. El progreso se guarda en el navegador y se sincroniza con Supabase, así que funciona también sin conexión.
- Se instala en el iPhone desde Safari: Compartir > Añadir a pantalla de inicio.

## Desarrollo

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build   # genera dist/
```

Variables de entorno en `.env.local` (y en Vercel):

```bash
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_KEY=<publishable key>
```

Sin estas variables la app funciona solo en local, sin login.

### Supabase

1. Ejecuta [`supabase/schema.sql`](supabase/schema.sql) en el SQL Editor del proyecto.
2. Crea tu usuario en Authentication > Users > Add user.
3. Desactiva el registro público en Authentication > Sign In / Providers.

## Añadir una asignatura

Crea un JSON en `public/data/`:

```json
{
  "subject": "Nombre de la asignatura",
  "semester": 2,
  "questions": [
    {
      "id": 1,
      "unit": "UT1",
      "question": "¿Pregunta?",
      "options": ["A", "B", "C", "D"],
      "correct": "B",
      "explicacion": "Opcional"
    }
  ]
}
```

`data/manifest.json` se genera solo al arrancar o compilar (`scripts/manifest.mjs`).

## Tecnologías

React, TypeScript, Vite, vite-plugin-pwa y Supabase (Auth + Postgres con RLS).

## Autor

Sergio Bernabé
