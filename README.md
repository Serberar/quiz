# Quiz DAW

Aplicación web instalable (PWA) para **preparar exámenes tipo test** de DAW. Lee las preguntas de archivos JSON, sincroniza tu progreso con Supabase y te enseña tus métricas: porcentaje de aprobados, nota media y acierto por asignatura.

## Funcionalidades

- **Estudiar (sesión diaria):** un botón y la app decide qué preguntar, en bloques de 20.
  - **Repetición espaciada:** cada pregunta vuelve justo antes de que la olvides (fallada: ya; luego a 1, 3, 7, 14, 30 y 45 días según los aciertos seguidos). El intervalo nunca pasa de la mitad del tiempo que queda al examen.
  - **Plan hasta el examen** (28 de enero, `EXAM_DATE` en `src/lib/quiz.ts`): calcula cuántas preguntas nuevas hacer al día para ver todo el temario 2 semanas antes.
  - **Más preguntas de lo que peor llevas:** las asignaturas con nota estimada baja y, dentro de cada una, los temas con más falladas reciben más preguntas y sus repasos van antes.
  - Una pregunta fallada vuelve a salir unas preguntas después hasta acertarla (no cuenta para la nota del bloque).
- **Repaso general:** preguntas de todas las asignaturas del semestre (60 por defecto) puntuadas como el examen, con nota y aprobado/suspenso por asignatura. "Centrado en lo flojo" da más preguntas a lo que peor llevas; "Simulacro real" reparte por igual y al azar.
- **Nota estimada** de cada asignatura si el examen fuera hoy, y barra de preguntas acertadas, falladas y sin ver.
- **Tres modos por asignatura:** Aleatorio, Refuerzo (nuevas y falladas primero) y Examen (30 preguntas, cada 3 errores restan un acierto, las saltadas no penalizan). En "Más opciones": unidades y solo nuevas, falladas o dudosas.
- **Marcar dudosas:** el botón de la bandera durante el test guarda la pregunta. En Métricas están todas con su respuesta y un botón para copiarlas y revisarlas o corregirlas.
- **¿Cómo voy?:** veredicto (bien, justo o mal) según el ritmo de temario nuevo, lo que recuerdas y los repasos atrasados; fecha en la que acabarás el temario a tu ritmo; nota si el examen fuera hoy; temas más flojos y preguntas al día.
- **Métricas:** exámenes, % de aprobados, nota media, evolución de cada asignatura en los repasos generales y últimos tests. Racha de días seguidos estudiando.
- Traducción de las preguntas de inglés y explicación de cada respuesta.
- Inicio de sesión con email y contraseña. Supabase guarda cada respuesta como una fila, así que se puede estudiar en varios dispositivos sin perder nada. Funciona sin conexión: lo pendiente se sube al volver la conexión.
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

1. Ejecuta [`supabase/schema.sql`](supabase/schema.sql) en el SQL Editor del proyecto. Se puede volver a ejecutar entero tras cada cambio: no borra datos.
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

El progreso se guarda por `id` y por nombre de asignatura (`subject`): no cambies ni reutilices los `id` ni renombres una asignatura, o el progreso se asignará a otras preguntas. Borrar preguntas es seguro y las nuevas deben llevar un `id` que no se haya usado nunca en esa asignatura.

## Tecnologías

React, TypeScript, Vite, vite-plugin-pwa y Supabase (Auth + Postgres con RLS).

## Autor

Sergio Bernabé
