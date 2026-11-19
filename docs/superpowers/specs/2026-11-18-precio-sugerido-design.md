# El precio sugerido que no sale completo — diseño

Fase 1 de `docs/fases/2026-11-revendedores/`. 18/11/2026.

## Por qué

El dueño, al cargar una pieza normal de un lote, ve que el precio sugerido
no sale completo hasta que cambia el tipo a "Dije" y vuelve a "Pieza
normal". `admin_sugerir_precio` es determinista: el fallo está en el
navegador, en `src/paginas/admin/FormularioModelo.tsx`.

No se reprodujo (hace falta entrar como administrador) y el dueño no
recuerda qué parte faltaba. Las tres causas que encajan son fallos reales
por sí solas, así que se arreglan las tres.

## Qué se hace

1. **Solo cuenta la última respuesta.** `pedirSugerencia` lleva un contador
   (`useRef`) que sube con cada petición; al llegar, la respuesta se guarda
   solo si es la última. El efecto de las variantes (`sugeridas`) ya guarda
   por clave de costo: se revisa y se deja como está si no hay carrera.
2. **El grupo sigue al costo mientras no lo elija el dueño.** `autoAsignado`
   ("ya se asignó una vez") se cambia por "quién puso el grupo": la máquina
   o el dueño.
   - Lo puso la máquina: cada sugerencia nueva (del tipo de ahora, con costo
     > 0 y sin precio propio) lo mueve a su grupo.
   - Lo eligió el dueño (en el selector o con "Usar G…"): no se toca más.
   - Una pieza que se edita trae su grupo: cuenta como del dueño. Abrirla no
     lo cambia.
   - Cambiar el tipo sigue como hoy: el grupo, lo haya puesto quien lo haya
     puesto, se reemplaza por el de la escalera nueva si trae uno (el de la
     otra escalera no sirve) y si no hay precio propio. Desde ahí el grupo
     es de la máquina y sigue al costo.
3. **Si la cuenta falla, se dice.** Hoy `if (!err)` la calla y el panel
   queda con rayas. Ahora el panel "Cómo sale el precio" enseña un aviso con
   el mensaje (`mensajeDeError`) y un botón "Calcular otra vez". Si el aviso
   sale a menudo, la cuenta de lo de tienda tarda demasiado y eso es trabajo
   de base, en otra fase.
4. **"Precio propio $" se lee con `leerCifra`** (decidido por el dueño, 18/11).
   El campo pasa a `type="text"` con `inputMode="decimal"`; "12,5", "12.50" y
   "1.500,50" se leen como en el resto del sistema. Si no se entiende, el
   campo lo dice y no se guarda (nunca cuenta como cero ni como vacío). La
   etiqueta, la ganancia y la tabla de variantes usan la cifra leída. Al
   cargar una pieza, el precio se escribe con coma decimal. Vacío sigue
   siendo "sin precio propio".

El costo unitario se queda como está (`type="number"`, punto decimal, cuatro
decimales): es una de las dos excepciones documentadas.

## Enfoques considerados

- **Arreglar las tres causas en el navegador (elegido).** Pequeño, en un
  archivo, y cubre lo que vio el dueño sin saber cuál era.
- **Reproducir primero y arreglar solo la causa confirmada.** Necesita entrar
  como administrador con la red lenta; el dueño no recuerda el síntoma, así
  que no hay con qué comparar. Descartado.
- **Cancelar las peticiones viejas con `AbortController`.** Supabase lo
  acepta, pero el contador basta y no depende de la librería.

## Fuera de esta fase

- Sin SQL. Si la cuenta de lo de tienda resulta lenta, es otra fase.
- El margen objetivo y las cantidades siguen siendo `type="number"`: son
  enteros, no tienen la trampa.

## Cómo se comprueba

- `npm run build` y `npm run pruebas`.
- A mano, con sesión de administrador: con la red en 3G lento, cargar una
  pieza de un lote sin tocar el tipo; la cadena y el grupo salen con el
  costo escrito. Escribir un costo, cambiarlo y volver al primero: el grupo
  sigue al costo. Elegir un grupo a mano y cambiar el costo: se queda.
  Editar una pieza: su grupo no cambia al abrirla. Precio propio "12,5":
  etiqueta $12,50 BCV; "12,5,0": aviso y no se guarda.

## Documentos

- Una línea en las Trampas de CLAUDE.md: una petición que se repite al
  escribir tiene que descartar las respuestas viejas, y una que falla tiene
  que decirlo.
- La fase 1 se marca hecha en el README de la fase.
