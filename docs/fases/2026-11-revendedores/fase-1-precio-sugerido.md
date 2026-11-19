# Fase 1 — El precio sugerido que no sale completo

## Lo que reportó el dueño (18/11/2026)

> Al poner una prenda que viene en un lote, si no cambio la opción de que es
> una prenda (no un dije ni una base), el precio sugerido no carga los otros
> montos. Debo poner "Dije" y luego volver a "Pieza normal" para que salga.

## Lo que se encontró al leer el código (sin reproducir todavía)

Todo está en `src/paginas/admin/FormularioModelo.tsx`. La base
(`admin_sugerir_precio`, última versión en `esquema-dijes.sql`) es
determinista: con los mismos datos da lo mismo. Así que "cambiar a Dije y
volver" no puede arreglar nada en la base; arregla algo **en el navegador**.
Hay dos fallos que encajan con lo que se ve:

1. **Una respuesta vieja pisa a la nueva** (`pedirSugerencia`, ~línea 338).
   Cada cambio de lote, costo o margen pide la sugerencia otra vez, 400 ms
   después de dejar de escribir, pero no descarta una respuesta que llega
   tarde. Al abrir el formulario sale una petición con costo 0; si esa
   tarda (la primera llamada de la sesión suele tardar) y llega después de
   la del costo escrito, la pantalla se queda con la cadena de costo 0: el
   paso 1 solo con el flete, el 2 y el 4 casi en cero. Cambiar el tipo
   lanza otra petición, que llega sola, y todo aparece.

2. **El grupo se elige una sola vez, con el costo a medio escribir**
   (efecto de asignación automática, ~línea 355). En cuanto llega una
   sugerencia con costo > 0, pone su grupo y marca `autoAsignado`; las
   sugerencias siguientes ya no lo mueven. Escribiendo "12.50" con calma en
   el teléfono, la primera que llega puede ser la de "1" o "12.": queda el
   grupo de ese costo, y la parte de abajo ("Etiqueta", "Ganancia") sale con
   un precio que no corresponde, o vacía si llegó la de costo 0. Cambiar el
   tipo entra por la rama `tipoCambiado`, que sí reasigna con el costo
   final.

Con un lote puesto pasa más porque el formulario nace con `lote_id` desde
la URL (`?lote=`) y la primera petición sale enseguida, ya con el lote.

## Qué se hace

1. **Reproducir primero** (`superpowers:systematic-debugging`): en el
   navegador, con la red lenta (DevTools → 3G lento), abrir "Lo que viene"
   de un lote → producto nuevo → escribir el costo. Confirmar cuál de los dos
   es el que vio el dueño. Preguntarle si lo que no salía eran los pasos 1–5
   o la parte de "Lo que queda con el precio elegido".
2. **Descartar respuestas viejas**: un contador (`useRef`) que se sube en
   cada petición; al llegar, solo se guarda si es la última. Lo mismo en el
   efecto de las variantes (`sugeridas`), que ya usa clave por costo y no lo
   necesita, pero conviene revisarlo.
3. **El grupo sigue al costo mientras nadie lo elija a mano**: cambiar
   `autoAsignado` por "el grupo lo puso la máquina" (se sigue moviendo con
   cada sugerencia nueva) contra "lo eligió el dueño" (no se toca más). En
   una pieza que se edita, el grupo que trae es del dueño.
4. De paso: los campos de costo y precio propio son `type="number"`, la
   trampa de "1.500" que CLAUDE.md prohíbe. El costo es una de las dos
   excepciones documentadas (punto decimal, 4 decimales); el precio propio
   no lo es. Decidir con el dueño si se pasa a `leerCifra` aquí o en otra
   fase.

## Cómo se comprueba

- Con la red en 3G lento, cargar una pieza de un lote sin tocar el tipo: la
  cadena y el grupo salen con el costo escrito.
- Escribir un costo, cambiarlo, volver al primero: el grupo sigue al costo.
- Elegir un grupo a mano y cambiar el costo: el grupo elegido se queda.
- Editar una pieza existente: no se le cambia el grupo al abrirla.
- `npm run build`.

## Archivos

- `src/paginas/admin/FormularioModelo.tsx` (solo este).
- Sin SQL. Sin cambios de documentación salvo una línea en las Trampas de
  CLAUDE.md si se confirma la respuesta vieja ("una petición que se repite
  al escribir tiene que descartar las respuestas viejas").
