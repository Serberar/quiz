# Test Practicador

Aplicación web para **preparar exámenes tipo test** de 1º de DAW. Lee las preguntas de archivos JSON, guarda tu progreso en el navegador y te ayuda a reforzar lo que más fallas.

**Ver online:** https://serberar.github.io/quiz/quiz.html

## Asignaturas incluidas

| Asignatura | Archivo | Preguntas |
|---|---|---|
| Entornos de Desarrollo | `data/entornos.json` | 189 |
| FOL | `data/fol.json` | 145 |
| Inglés | `data/ingles.json` | 169 |
| Lenguaje de Marcas | `data/lenguaje_marcas.json` | 95 |

## Funcionalidades

- **Tres modos:**
  - 🔀 **Aleatorio:** preguntas al azar.
  - 🧠 **Refuerzo:** prioriza las preguntas que más fallas.
  - 🎓 **Examen:** 30 preguntas; cada 3 errores restan un acierto y las preguntas sin responder no penalizan.
- Filtro por **unidades** y número de preguntas configurable.
- **Estadísticas por asignatura:** preguntas vistas, porcentaje de acierto y preguntas «débiles».
- El progreso se guarda en `localStorage` y se puede resetear.

## Añadir una asignatura

1. Crea un JSON en `data/` con este formato:

   ```json
   {
     "subject": "Nombre de la asignatura",
     "questions": [
       {
         "id": 1,
         "unit": "UT1",
         "question": "¿Pregunta?",
         "options": ["A", "B", "C", "D"],
         "correct": "B"
       }
     ]
   }
   ```

2. Haz push. Una GitHub Action (`.github/workflows/update-manifest.yml`) regenera `data/manifest.json` y la asignatura aparece sola en la app.

## Tecnologías

HTML, CSS y JavaScript en un único archivo, sin dependencias, y GitHub Actions para mantener el índice de asignaturas.

## Autor

Sergio Bernabé
