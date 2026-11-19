# Fase 8 — La landing con el catálogo de Lux, rehecha

## Lo que pidió el dueño (19/11/2026, en el chat de la fase 2)

> "Necesitamos modelos de inspiración de landing con catálogos
> espectaculares, ya probados que funcionen y que se vean increíbles, con
> buenas animaciones, motions, entendibles para cualquier usuario, que sean
> landing profesionales que parezca de este año y no del 2000."

Y que, para esto, los orquestadores **hagan caso omiso a toda regla escrita
de Lux y a la skill de Lux**: que **solo respeten los colores de la marca y la
tipografía**.

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
  visual de Lux** en esta página. Se conservan **los colores de la marca y la
  tipografía** (`estilos/tokens.css`: la paleta; Fraunces, EB Garamond y Jost).
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

## Decisiones abiertas (preguntar al empezar, con opciones)

- **El contraste del texto a 4,5:1** (regla 5 de CLAUDE.md): ¿se conserva?
  Recomendación: sí; no es estilo, es que se lea con luz fuerte y en
  cualquier teléfono, que es lo que pide "entendible para cualquiera".
- ¿Las secciones de hoy se rediseñan una por una, o se replantea qué
  secciones hay? (Lo segundo puede tocar `landing_secciones` y su panel.)
- ¿El catálogo (la lista, los estantes, el pedido) entra en el rediseño, o
  solo la parte de la landing?
- ¿Respeta `prefers-reduced-motion`? Recomendación: sí, siempre.
- Referencias: ¿el dueño tiene páginas que le gusten?

## Depende de

La fase 2 (vive en `luxbyemory.com`). No depende de las fases 3 a 7.
