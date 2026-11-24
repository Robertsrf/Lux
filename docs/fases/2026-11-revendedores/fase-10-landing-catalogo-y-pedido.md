# Fase 10 — La landing, el catálogo y el pedido de Lux, rehechos

Era la fase 8. El 24/11/2026 el dueño amplió el alcance ("absolutamente
todo: landing, catálogo, y todo hasta el administrativo") y eligió el orden:
primero la auditoría de las cuentas (fase 8), después el administrativo
(fase 9) y al final esta.

## Lo que pidió el dueño (19/11/2026, en el chat de la fase 2)

> "Necesitamos modelos de inspiración de landing con catálogos
> espectaculares, ya probados que funcionen y que se vean increíbles, con
> buenas animaciones, motions, entendibles para cualquier usuario, que sean
> landing profesionales que parezca de este año y no del 2000."

Y que, para esto, los orquestadores **hagan caso omiso a toda regla escrita
de Lux y a la skill de Lux**: que **solo respeten los colores de la marca y la
tipografía**.

## Ya decidido (24/11/2026)

- **Alcance: todo lo público.** La landing, el catálogo (estantes, lista,
  tarjetas, detalle, barra del pedido) y la página del pedido (cédula,
  apartar, pago móvil, aviso por WhatsApp).
- **Las secciones del panel Landing se revisan** (uso y factibilidad de cada
  uno de los 19 tipos) y ahí se decide si se replantean. Replantearlas
  puede tocar `landing_secciones`, su panel y un SQL nuevo.
- **El texto se mide a 4,5:1, siempre** (regla 5).
- **Referencias: las elige Claude**: landings de joyería reales de este año,
  citadas, y 2 o 3 direcciones en maquetas para que el dueño elija.
- **`prefers-reduced-motion` se respeta siempre.**

## Qué es hoy

La landing y el catálogo son **una sola página**, en la raíz de
`luxbyemory.com` (desde la fase 2; antes `#/publico`). Arriba, las secciones
que el dueño pone, esconde y ordena en el panel **Landing** (`v_landing`, 19
tipos: portada, cintas, historia, materiales, galería, video, redes,
combos, selección, ofertas...). Debajo, los estantes por tipo, "Todas las
joyas", "Cómo pedir", Próximamente y "La tienda". Ver en `CLAUDE.md`: "La
landing", "Las ofertas con código" y "El catálogo se entiende y dice dónde
está la tienda". Código en `src/paginas/publico/` y `src/paginas/publico/landing/`;
estilos en `src/estilos/landing.css`.

## Cómo se trabaja

- Orquestadores de diseño: `disenio-web-pro:disenio-web-pro`,
  `frontend-design:frontend-design`, `ui-ux-pro-max:ui-ux-pro-max` y, para el
  movimiento, las de Emil (`emil-design-eng`, `animate`, `review-animations`).
- **Se ignoran `lux-ui`, `DESIGN.md`, `.impeccable/design.json` y toda regla
  visual de Lux** en estas páginas. Se conservan **los colores de la marca y
  la tipografía** (`estilos/tokens.css`: la paleta; Fraunces, EB Garamond y
  Jost).
- Inspiración en landings y catálogos reales y probados, que se citan; no se
  copia uno concreto (marca, textos, fotos).
- Construye Claude en el chat (`superpowers:executing-plans`), sin un agente
  por tarea. Mensajes cortos; las preguntas como opciones para seleccionar.

## Lo que sigue valiendo (no es visual)

- **Ninguna cifra de costo, piso ni margen** en la página: precios y ofertas
  salen de las vistas y de `ofertas_publicas()`, como hoy.
- **Ninguna cifra de negocio inventada** (regla 4).
- El panel **Landing** sigue mandando qué secciones salen y en qué orden: el
  rediseño cambia cómo se ven, no quién decide.
- Las ofertas con código, "Letra grande", "Todas · Dama · Caballero", el
  pedido por la cédula y el aviso por WhatsApp siguen funcionando.
- El teléfono de gama baja: el peso de la página y de las animaciones se mide
  (las fotos de `public/landing/` ya van en dos anchos).

## Depende de

La fase 2 (vive en `luxbyemory.com`). Va después de las fases 8 y 9 por
decisión del dueño, no porque dependa de ellas.
