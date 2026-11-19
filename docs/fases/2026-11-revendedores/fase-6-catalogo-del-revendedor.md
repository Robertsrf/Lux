# Fase 6 — El catálogo y el carrito del revendedor, rediseñados

## Lo que pidió el dueño (18/11/2026)

- Que los catálogos de los revendedores **se vean mucho mejor y distintos al
  de Lux**, para que sus clientas no sospechen.
- **Su logo grande y visible**, para que los reconozcan.
- Que diga que son **joyas de Lux by Emory**, pero que lo principal sea que
  el catálogo es **de ellos**.
- **Ignorar el diseño y las reglas de diseño de Lux** en su catálogo y su
  carrito: propuestas frescas, que **ellos personalicen** (colores, etc.) y,
  a futuro, **plantillas** a elegir.

## Cómo está hoy

- `src/paginas/revendedor/CatalogoRevendedor.tsx` (657 líneas) es "el
  catálogo de la tienda con tres diferencias": reutiliza `VitrinaPublica`,
  la tarjeta de Lux, `ElegirVariante`, `ArmarDije`, `ElegirPara`.
- Se viste con **una de seis paletas** (`revendedores.paleta`,
  `estilos/revendedor.css`, `PALETAS` en `lib/revendedor.ts`), sin color
  libre. Por eso se parece tanto al de Lux: es el mismo esqueleto con otro
  color.
- `revendedores.logo_path` existe; hoy el logo sale pequeño.
- El pedido de su clienta es `ApartadoPublico.tsx`.

## Qué se hace

1. **Un catálogo propio, no el de Lux repintado.** Componentes nuevos en
   `src/paginas/revendedor/catalogo/` (cabecera con el logo como
   protagonista, portada, rejilla, ficha de pieza, carrito, pedido), con su
   propio CSS. Puede reutilizar la lógica (`lib/`, hooks, las RPC), no la
   apariencia de Lux. Sin `tokens.css` de Lux.
2. **La marca del revendedor manda**: logo grande arriba (y en la pestaña,
   y al compartir el enlace: `og:image` no se puede en una SPA estática sin
   servidor; el Worker de la fase 2 sí podría inyectarlo: anotarlo como
   mejora). Su nombre de catálogo como título.
3. **Lux, como garantía, no como dueña**: una línea discreta tipo "Joyería
   hipoalergénica Lux by Emory · acero 316L, titanio y baño de oro 18K" en el
   pie o en la ficha, con el certificado. El texto exacto lo aprueba el
   dueño (skill `anthropic-skills:lux-by-emory` para los materiales).
   Ningún contacto, dirección ni WhatsApp de Lux (ya es regla).
4. **Personalizable**: `revendedores.tema jsonb` (nuevo) con color principal,
   color de fondo, tipografía (de una lista corta de Google Fonts), forma de
   las tarjetas, y `revendedores.plantilla` (texto: el id de la plantilla).
   **Color libre, con contraste medido**: al elegir un color, el panel
   calcula el contraste y, si no llega a 4,5:1, ajusta el tono del texto o
   avisa. Esto no es una regla de Lux: es que sus clientas lo lean en el
   sol con un teléfono barato. Las seis paletas de hoy quedan como "temas
   listos" para elegir rápido.
5. **Plantillas**: la arquitectura las admite desde ya (una plantilla = un
   componente de página + sus estilos, que leen el mismo tema). En esta fase,
   **dos o tres** distintas de verdad (p. ej. una editorial con fotos
   grandes, una de cuadrícula compacta tipo tienda, una "lookbook"); el
   resto, a futuro. Las elige él en su panel (MiCatalogoRv).
6. **El carrito y el pedido**, con su marca: menos pasos, el total siempre a
   la vista, su pago móvil, su WhatsApp. Lo del inventario propio (fase 5)
   ya entra en "disponible".
7. **Se conserva lo que funciona**: buscar, "Todas · Dama · Caballero",
   "Agrégale un dije", medidas, "Ver más", recordar lo elegido, letra
   grande (hoy no la tiene: añadirla).

## Orquestación de diseño

- `superpowers:brainstorming` con el dueño, **con maquetas**: tres
  propuestas visibles (un artifact o capturas a 360 px y a escritorio) antes
  de construir. Una con el logo de JaduJoyas si lo manda.
- `disenio-web-pro:disenio-web-pro` para el flujo, `frontend-design` y
  `ui-ux-pro-max` para la dirección visual, `emil-design-eng` para el
  detalle y el movimiento, `break-ui` para probarlo con datos feos (un nombre
  de catálogo largo, un logo apaisado, un logo cuadrado, 0 piezas, 400
  piezas).
- Probar en un Android de gama baja o en DevTools con CPU 4x más lenta.

## Decisiones abiertas (preguntar al empezar)

- ¿Él cambia sus colores y su plantilla desde su panel, o solo el dueño?
  Recomendación: él, desde MiCatalogoRv; el dueño puede corregir.
- **El logo**: hoy lo sube el dueño. ¿Él lo sube desde su panel? Sin sesión
  de Supabase, subir una foto pide una función de servidor (como
  `supabase/functions/vendedoras`) que compruebe su testigo. Recomendación:
  sí, con tamaño y tipo limitados.
- ¿Qué tanto se dice "Lux by Emory"? Texto exacto.

## Seguridad

- `tema` se valida en la base (colores `#rrggbb`, fuente de una lista,
  plantilla de una lista): un texto del revendedor nunca llega a CSS o HTML
  sin pasar por esa lista.
- Lo de siempre: ni un costo, ni el piso, en nada de lo que lee su catálogo.

## Documentos que cambian

- CLAUDE.md: "Su paleta: seis... no hay selector de color libre" deja de ser
  cierto; el árbol (`revendedor/catalogo/`), y la regla de que su catálogo
  está fuera del sistema visual de Lux.
- DESIGN.md y `.impeccable/design.json`: una nota de que el catálogo del
  revendedor tiene su propio sistema, y dónde vive.
- `lux-ui` (`.claude/skills/lux-ui/SKILL.md`): que no se aplica a
  `src/paginas/revendedor/catalogo/`.
