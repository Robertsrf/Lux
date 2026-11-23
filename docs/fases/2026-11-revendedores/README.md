# Revendedores, crédito y dominio propio — plan por fases

Pedido del dueño del 18/11/2026. Cada fase se hace **en un chat aparte**. Este
archivo es el índice; cada fase tiene el suyo con lo que hay que saber para
empezar en frío.

## Lo que pidió, en sus palabras (resumido)

1. Una clienta, **JaduJoyas**, será revendedora. Es especial: puede llevarse
   piezas **a crédito, de 7 a 10 días**, y tiene **20 % de descuento fijo**,
   compre como revendedora o directamente en la tienda.
2. **Todos los revendedores pasan a 20 % de descuento máximo** (hoy es 25 %).
3. Los **catálogos de los revendedores** se ven mucho mejor y **distintos al de
   Lux**, para que sus clientas no lo asocien con la tienda; el **logo del
   revendedor grande y visible**; que diga que son joyas de Lux by Emory, pero
   que lo principal sea su marca. Su catálogo y su carrito **ignoran el sistema
   de diseño de Lux**; se personalizan (colores, etc.) y a futuro tendrán
   plantillas.
4. Su **panel**, sobre todo **Vender**, tiene que ser mucho más fácil. También
   fuera del sistema de diseño de Lux.
5. JaduJoyas queda **asociada como clienta** del maestro. Lo que compre o se
   lleve a crédito **aparece en su catálogo con sus unidades**: hoy, si compra
   la última pieza de un modelo, esa pieza desaparece también de su catálogo.
6. Una sección **Crédito** en el panel del administrador: quién, qué se llevó y
   cuánto debe, con su descuento.
7. **Dominio propio** (luxbyemory, comprado en Namecheap) con SSL, y **un
   subdominio por revendedor**: `jadujoyas.luxbyemory.com`.
8. Un error: al cargar una pieza de un lote, el precio sugerido no sale
   completo hasta cambiar el tipo a "Dije" y volver a "Pieza normal".

## Las fases, en orden

| # | Fase | Archivo | Toca la base | Depende de |
|---|---|---|---|---|
| 1 | El precio sugerido que no sale completo | [fase-1-precio-sugerido.md](fase-1-precio-sugerido.md) | No | — |
| 2 | Dominio, SSL y subdominio por revendedor | [fase-2-dominio.md](fase-2-dominio.md) | Poco (nombres reservados) | — |
| 3 | 20 % para revendedores y la clienta con descuento fijo | [fase-3-descuento-y-clienta-especial.md](fase-3-descuento-y-clienta-especial.md) | Sí | — |
| 4 | El crédito con Lux y la pantalla Crédito | [fase-4-credito.md](fase-4-credito.md) | Sí | 3 |
| 5 | El inventario propio del revendedor | [fase-5-inventario-del-revendedor.md](fase-5-inventario-del-revendedor.md) | Sí | 3, 4 |
| 6 | El catálogo y el carrito del revendedor, rediseñados | [fase-6-catalogo-del-revendedor.md](fase-6-catalogo-del-revendedor.md) | Algo (su tema) | 2, 5 |
| 7 | El panel del revendedor, y Vender fácil | [fase-7-panel-del-revendedor.md](fase-7-panel-del-revendedor.md) | Poco | 5, 6 |
| 8 | La landing con el catálogo de Lux, rehecha | [fase-8-landing-de-lux.md](fase-8-landing-de-lux.md) | No (en principio) | 2 |

La 1 y la 2 no dependen de nada y se pueden hacer ya. La 3, 4 y 5 son las de
dinero y van en ese orden: la 5 necesita saber qué es "una compra para su
inventario" (3) y cómo se debe a crédito (4). La 6 y la 7 son de diseño y van
al final, cuando el catálogo ya sabe enseñar el inventario propio.

## Cómo se empieza cada chat

Pega esto, cambiando el número:

> Vamos con la fase N de `docs/fases/2026-11-revendedores/`. Lee el README y
> el archivo de la fase, y CLAUDE.md. Empieza por las decisiones abiertas.

Y en cada fase, el mismo camino, con los orquestadores:

1. **Leer** el README, el archivo de la fase y `CLAUDE.md`. Las skills
   `lux-codigo` (y `lux-ui` en las fases que tocan pantallas de Lux) se
   activan solas.
2. **Decisiones abiertas** con `superpowers:brainstorming`: se le preguntan al
   dueño una por una, **como opciones para seleccionar** (AskUserQuestion),
   antes de escribir código. Mensajes cortos y precisos. Ninguna cifra de
   negocio se inventa (regla 4).
3. **Diseño** en `docs/superpowers/specs/AAAA-MM-DD-<tema>-design.md`.
4. **Plan** con `superpowers:writing-plans`, en `docs/superpowers/plans/`.
5. **Construcción** con `superpowers:executing-plans`: **Claude construye en
   el mismo chat, sin un agente por tarea** (pedido del dueño del 19/11/2026).
   Agentes y revisiones solo cuando hagan falta: la revisión de seguridad del
   paso 6 sí, y una revisión del conjunto al final. Las fases de backend se apoyan en
   `ingenieria-pro:ingenieria-pro`; las de diseño (6 y 7) en
   `disenio-web-pro:disenio-web-pro`, `frontend-design:frontend-design` y
   `ui-ux-pro-max:ui-ux-pro-max`.
6. **SQL**: probado en PGlite con la instalación entera antes de entregarlo
   (ver Trampas en CLAUDE.md), con las cifras esperadas en su cabecera, y una
   revisión de seguridad con el agente
   `backend-api-security:backend-api-security-backend-security-coder` para
   toda función que se abra sin sesión o a un revendedor.
7. **Antes de entregar**: `npm run pruebas`, `npm run build` y, si se tocó una
   vista, permiso o función, `npm run verificar`.
8. **Documentos** en el mismo commit (tabla del final de CLAUDE.md), y la
   fase se marca hecha abajo.

## Lo que no cambia en ninguna fase

- **El revendedor no tiene sesión de Supabase** y no la tendrá. Todo lo suyo
  va por funciones `rv_*` con su testigo.
- **Ni el revendedor ni su clienta ven un costo de Lux.** Lo que él paga a Lux
  sí lo ve: es su precio de compra, no el costo de la tienda.
- **Primero el SQL, después el navegador**, sin quitar parámetros que el
  navegador ya manda.
- Las fases 6 y 7 se salen del sistema visual de Lux **solo** en lo del
  revendedor (su catálogo, su carrito, su pedido, su panel). Las pantallas de
  la tienda siguen con `lux-ui`. La fase 8 se sale también, en la landing con
  el catálogo de Lux, conservando solo los colores y la tipografía de la marca.

## Estado

| # | Estado | Commit | SQL |
|---|---|---|---|
| 1 | Hecha y probada con sesión (19/11): reproducido en main, corregido en la rama | rama `fase-1-precio-sugerido` | — |
| 2 | Hecha y publicada (23/11): luxbyemory.com en Cloudflare, github.io reenvía. Falta probar la tarjeta de WhatsApp con un revendedor real. Diseño: `docs/superpowers/specs/2026-11-19-dominio-y-subdominios-design.md` | fusionada en `main` | #69 `esquema-dominio.sql` (corrido) |
| 3 | Hecha y publicada (23/11): 20 % para revendedores (el general es el tope), clienta con descuento fijo en el mostrador, revendedor enlazado con su ficha, Reportes dice a nombre de quién salió cada rebaja. Diseño: `docs/superpowers/specs/2026-11-23-descuento-y-clienta-especial-design.md`. Falta `npm run verificar` (366) | `main` (1c3fbaf) | #70 `esquema-descuento-clienta.sql` (corrido) |
| 4 | Hecha y publicada (23/11): crédito en la ficha (días y tope), "A crédito" en el mostrador, Pedidos dice cuándo vence, Anular y Quitar a crédito solo el admin, pantalla Crédito y "N vencidos" en el menú. Diseño: `docs/superpowers/specs/2026-11-23-credito-design.md`. Falta `npm run verificar` (382) y darle el crédito a JaduJoyas en su ficha | `main` (fusionada de `fase-4-credito`) | #71 `esquema-credito.sql` (corrido) |
| 5 | Hecha en la rama (23/11): el inventario del revendedor se calcula de sus ventas "para su inventario" (casilla en el cobro del mostrador, también a crédito), sus ajustes y lo que vende; su catálogo lo suma a lo de la tienda; el pedido de su clienta toma primero de lo suyo (no le debe nada a Lux); "Mi inventario" en su panel; el dueño lo ve en Revendedores y Crédito. Diseño: `docs/superpowers/specs/2026-11-23-inventario-del-revendedor-design.md`. Falta correr el #72, publicar y `npm run verificar` (401) | `fase-5-inventario` | #72 `esquema-inventario-revendedor.sql` (sin correr) |
| 6 | Pendiente | | |
| 7 | Pendiente | | |
| 8 | Pendiente (después de la 2) | | |

El próximo `.sql` libre es el **#73** (#72, `esquema-inventario-revendedor.sql`, de la fase 5).

**Las direcciones cambiaron en la fase 2:** ya no hay `#/`. Lux en
`luxbyemory.com`, el personal en `entrar.luxbyemory.com`, el panel del
revendedor en `luxbyemory.com/rv` y su catálogo en `<usuario>.luxbyemory.com`.
Donde los archivos de las fases 3 a 7 digan `/#/r/<usuario>` o `/#/rv`, léase así.
