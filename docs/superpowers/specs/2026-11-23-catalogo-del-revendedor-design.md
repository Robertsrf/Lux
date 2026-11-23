# El catálogo del revendedor, rediseñado (fase 6)

Fecha: 23/11/2026. Fase 6 de `docs/fases/2026-11-revendedores/`.
Maquetas aprobadas: https://claude.ai/artifact/XWhL9jpTLmPN3qiYfra8K8
(tres plantillas en teléfono y computadora, el pedido en una hoja y la
pantalla de personalizar).

## Por qué

El dueño (18/11/2026): los catálogos de los revendedores tienen que verse
mucho mejor y **distintos al de Lux**, para que sus clientas no lo asocien
con la tienda; el **logo del revendedor grande**; que diga que son joyas de
Lux by Emory pero que lo principal sea su marca; que **ellos lo
personalicen** y que a futuro haya plantillas. Hoy
`CatalogoRevendedor.tsx` es el catálogo de la tienda con otra paleta: la
misma tarjeta, los mismos estantes, el mismo "Cómo pedir".

## Lo que decidió el dueño (23/11/2026)

1. **Personalizan los dos, logo incluido.** Él desde Mi catálogo en su
   panel; el dueño desde Revendedores, por si algo queda mal.
2. **Lux, en el pie y en la ficha de cada pieza**, con este texto exacto:
   «Joyería hipoalergénica Lux by Emory · acero 316L, titanio y baño de oro
   18K · certificada SGS». Arriba, solo su marca. Ningún contacto de Lux.
3. **Las tres plantillas de las maquetas**: Editorial, Tienda y Lookbook.
4. **La portada**: él elige una pieza de su catálogo (su foto va de
   portada) y escribe una frase corta. Sin elegir: una pieza con foto al
   azar y una frase estándar de la plantilla. No sube fotos aparte.
5. **Un cerebro, tres caras**: la lógica del catálogo en un solo sitio; cada
   plantilla solo dibuja.

## Metas

- Su catálogo (`<usuario>.luxbyemory.com`) y el pedido de su clienta
  (`/apartado/<token>`) se ven como de su marca, en una de tres plantillas,
  con sus colores, su letra y su logo grande.
- Él lo cambia solo, desde su panel, y ve el resultado.
- El carrito y el pedido en menos pasos: una hoja con las piezas, el total
  y la cédula, y "Apartar".
- Se conserva todo lo que hoy funciona: buscar, "Todas · Dama · Caballero",
  medidas, "Agrégale un dije", "Ver más" y el tope de 400 dicho, recordar
  lo elegido aunque busque otra cosa, su inventario propio (fase 5) en
  "disponible". Se suma **Letra grande**.

## No metas

- El panel del revendedor no se rediseña (fase 7). Mi catálogo gana los
  campos nuevos con el aspecto de hoy.
- La tarjeta de WhatsApp con su logo ya está hecha (Worker de la fase 2).
- Plantillas más allá de tres, colores de fondo con degradado, fotos de
  portada subidas, varias portadas.
- La landing de Lux (fase 8) y el catálogo de la tienda no cambian.

## Anti-metas (sería un fracaso aunque funcione)

- Que su clienta vea el nombre, el WhatsApp, la dirección o el pago móvil de
  Lux, o un costo, un piso o lo que él paga a Lux.
- Que un color elegido por él deje texto por debajo de 4,5:1.
- Que una regla del catálogo (qué se puede pedir, cuántas quedan, el dije
  con su base) quede escrita tres veces, una por plantilla.
- Que un texto que él escribe llegue a CSS o a HTML sin pasar por una lista
  o por React.

## Cómo está hoy (lo que toca)

- `src/paginas/revendedor/CatalogoRevendedor.tsx` (673 líneas): perfil,
  piezas (`rv_catalogo_publico`, hasta 400), qué es dije o base
  (`v_disponible_publico.armado`), selección, búsqueda, tipo y `para` en la
  ruta, `rv_apartar`, y lo dibuja con `VitrinaPublica`, `VisorFoto`,
  `ElegirVariante`, `ArmarDije`, `TusDatos` y `ElegirPara`.
- `ApartadoPublico.tsx`: el pedido de su clienta, con `useTemaRv(paleta)`.
- `revendedores.paleta` (seis, con `check`) y `estilos/revendedor.css`.
- `revendedores.logo_path`: lo sube hoy el dueño (`subirLogoRevendedor` de
  `lib/fotos.ts`, al bucket `fotos`, `revendedores/<usuario>/<ts>.webp`,
  400 px, 60 KB). Escribir en `fotos` es solo del administrador.
- `rv_perfil_publico`, `rv_ver_apartado`, `rv_resumen`, `rv_ajustes`
  (`p_catalogo_nombre`, `p_paleta`, `p_telefono`).
- La CSP solo deja letras del propio sitio (`font-src 'self' data:`).

## El diseño

### 1. Un cerebro, tres caras

```
src/paginas/revendedor/catalogo/
  useCatalogoRv.ts     el cerebro: perfil y tema, piezas, tipos, búsqueda,
                       `para`, selección (recuerda lo visto), dijes y bases,
                       ficha abierta, hoja del pedido, apartar, letra grande
  CatalogoRv.tsx       la ruta: llama al cerebro, aplica el tema y monta la
                       plantilla que diga su tema (sustituye a
                       CatalogoRevendedor.tsx; la ruta no cambia)
  tema.ts              puro: normalizar el tema, temas listos (las seis
                       paletas), contraste y colores derivados
  letras.ts            las cinco letras de títulos y la de texto de cada
                       plantilla, cargadas al pedirlas
  piezas/              lo común sin aspecto de Lux: Ficha (foto, medidas,
                       "Agrégale un dije", la línea de Lux), HojaPedido
                       (piezas, total, cédula, Apartar), BarraPedido,
                       Buscador (texto + Todas·Dama·Caballero + tipos),
                       Marca (el logo con su nombre), PieLux
  plantillas/
    Editorial.tsx  Tienda.tsx  Lookbook.tsx
  catalogo-rv.css      base común sobre variables `--rvc-*`
  plantillas/*.css     lo propio de cada una
```

- **El cerebro** devuelve datos y acciones; no dibuja. Cada plantilla
  recibe lo mismo (`CatalogoRvVista`): perfil, tema resuelto, estantes por
  tipo, la lista de la búsqueda, la portada, la selección y sus acciones.
  Una plantilla nueva es otro archivo en `plantillas/` y un valor más en
  la lista de la base.
- **Lo que no se reescribe**: `lib/familias.ts` (agrupar, cuadro de dos
  ejes, `etiquetasCortas`), `lib/armados.ts`, `lib/dinero.ts`,
  `TusDatos` (la lógica de la cédula: se reutiliza dentro de la hoja,
  vestido con el tema), `ElegirPara` (`paraDeRuta`, `paraQueVe`; el botón
  se dibuja nuevo).
- **Lo que se deja de usar aquí**: `VitrinaPublica`, `VisorFoto`,
  `ElegirVariante`, `ArmarDije` y `estilos/revendedor.css` en el catálogo.
  Siguen en la tienda. `ApartadoPublico` deja `useTemaRv` y usa el tema
  nuevo.
- **Sin las clases de Lux**: los componentes nuevos no usan `.boton`,
  `.tarjeta` ni los tokens de `tokens.css`. `tokens.css` se sigue cargando
  (es global), pero nada del catálogo depende de él; donde se reutiliza
  `TusDatos`, el contenedor redefine los tokens que lee.

### 2. Las tres plantillas (como en las maquetas)

| | Editorial | Tienda | Lookbook |
|---|---|---|---|
| Para | pocas piezas escogidas | mucho catálogo, clientas apuradas | marca con aire de lujo |
| Cabecera | logo grande centrado | logo a la izquierda, buscador a la vista | logo grande centrado, redondo |
| Portada | foto a todo el ancho y la frase debajo | sin portada grande: una franja con la frase y la foto pequeña | foto alta con la frase en una banda de color |
| Piezas | una grande y luego de a dos, por tipo | cuadrícula de dos (teléfono) o 3–4 (computadora); tipos en círculos con foto; menú lateral en computadora | filas por tipo que se deslizan de lado; en computadora, cuadrícula |
| Letra de texto | Manrope | DM Sans | Figtree |
| Letra de títulos por defecto | Elegante (Bodoni Moda) | Moderna (Outfit) | Clásica (Marcellus) |
| Esquinas por defecto | rectas | suaves | redondas |
| Fondo por defecto | claro | claro | oscuro |

Cada plantilla trae su estante de 4 piezas por tipo y "Ver los N"; un tipo,
una búsqueda o "Ver todas" abren la lista con "Ver más" (como hoy). La
barra del pedido va abajo, siempre a la vista, con piezas y total.

### 3. El tema (lo que él personaliza)

`revendedores.tema jsonb` (nuevo, null = como hoy: sale de su `paleta`):

```json
{ "plantilla": "tienda", "principal": "#2B3FD1", "fondo": "#F2F4F8",
  "letra": "moderna", "esquinas": "suaves",
  "portada": 1234, "frase": "Joyas que no te manchan la piel" }
```

- `plantilla`: `editorial` | `tienda` | `lookbook`.
- `principal`, `fondo`: `#rrggbb`.
- `letra`: `elegante` (Bodoni Moda) | `moderna` (Outfit) | `clasica`
  (Marcellus) | `revista` (Playfair Display) | `amable` (Nunito).
- `esquinas`: `rectas` | `suaves` | `redondas`.
- `portada`: id de una pieza, o null.
- `frase`: hasta 90 letras, o null (sin frase propia sale la de la
  plantilla).
- Toda clave es opcional; lo que falte sale del tema listo de su paleta y
  de los valores por defecto de la plantilla.

**Temas listos**: las seis paletas de hoy (Lux, Noche, Vino, Grafito,
Ciruela, Oliva) son colores de principal y fondo para elegir rápido. Sus
valores salen de `estilos/revendedor.css`.

**El contraste se garantiza al dibujar** (`tema.ts`, puro y con pruebas):

- texto: casi negro o casi blanco, el que más contraste dé sobre `fondo`;
  el texto suave, mezclado hacia el fondo solo hasta 4,5:1;
- botón: fondo `principal` y letra negra o blanca, la que más contraste
  dé; si ninguna llega a 4,5:1, se oscurece o aclara el principal lo justo;
- títulos y enlaces en color: el `principal` oscurecido o aclarado sobre
  `fondo` hasta 4,5:1.

Así un amarillo sobre blanco se lee aunque alguien lo guarde. El panel
enseña lo mismo antes de guardar: el contraste medido y, si se ajustó,
cómo queda ("Ese amarillo no se lee sobre blanco (1,6 a 1)…", como en la
maqueta).

**Las letras**: paquetes `@fontsource` dentro del sitio (la CSP no deja
Google Fonts), un `import()` por letra: cada catálogo baja solo la de sus
títulos y la de texto de su plantilla. El panel carga las cinco para
enseñarlas.

### 4. La portada

- Él elige en Mi catálogo una pieza de su catálogo (buscador con foto) y
  escribe la frase.
- El catálogo busca esa pieza entre las que trajo; si no está (se agotó, se
  retiró, dejó de dejarle rebaja) o no tiene foto, usa otra con foto al
  azar, fija mientras dure la visita. Sin piezas con foto, la portada va
  sin foto.
- La base solo guarda el id: no expone nada nuevo (la foto ya es pública).

### 5. La ficha de una pieza

Una hoja propia (no `VisorFoto`): foto grande que pasa de pieza, nombre,
precio en Bs y $ BCV del mismo tamaño, medidas como fichas (con más de 8,
el cuadro de dos ejes de `familias.ts`), "Agregar", "Agrégale un dije" en
las bases (la lista de dijes dentro de la misma hoja, con `armar` de
`lib/armados.ts`) y abajo la línea de Lux con los materiales. Su clave de
bodega no sale (es de la tienda).

### 6. El pedido en una hoja

- "Ver mi pedido" abre una hoja: las piezas con su contador, el total (Bs
  y $ BCV) y **Tu cédula** (`TusDatos`: reconoce a su clienta o pide los
  datos), las cifras de sus horas y su apartado, y **Apartar mis piezas**.
- `?paso=apartar` en la ruta sigue abriendo la hoja (atrás la cierra) y un
  enlace viejo con `?paso=apartar` sin piezas vuelve al catálogo.
- `rv_apartar` igual que hoy; después, `/apartado/<token>`.
- **El pedido de su clienta** (`ApartadoPublico`) se viste con su tema
  (logo, colores, letra, esquinas), no con la plantilla: es una página de
  pagar, igual en las tres.

### 7. Letra grande

`useLetraGrande` de la tienda, con un botón propio en la cabecera de cada
plantilla y en el pedido. Sube la escala de `<html>`; las plantillas
miden en `rem`.

### 8. El logo

- **Él** lo sube en Mi catálogo. El navegador lo achica como hoy
  (`subirLogoRevendedor`: WebP, 400 px, 60 KB) y lo manda a una función de
  servidor nueva, `supabase/functions/logo-revendedor`, con su testigo.
- La función (con la llave maestra, en el servidor):
  1. comprueba el testigo con `rv_usuario_para_logo(p_sesion)` (nueva,
     solo `service_role`): devuelve su usuario o lanza `28000`;
  2. acepta solo WebP, PNG o JPEG por sus primeros bytes, y hasta 300 KB;
  3. sube a `fotos/revendedores/<usuario>/<ts>.webp` (`upsert: false`);
  4. guarda la ruta con `rv_poner_logo(p_sesion, p_ruta)` (solo
     `service_role`), que exige que la ruta empiece por
     `revendedores/<su usuario>/`.
  Se publica aparte, como `vendedoras` (INSTALACION.md).
- **El dueño** lo sigue subiendo en Revendedores, como hoy.
- Los logos viejos no se borran (el bucket guarda historia; pesan poco).
- Sin la función publicada, el botón dice "Todavía no se puede subir desde
  aquí: mándaselo a Lux" y el resto de Mi catálogo funciona.
- Cómo se ve: la plantilla lo pone a lo alto (hasta ~96 px en el teléfono)
  sin recortarlo (`object-fit: contain`), sea apaisado, cuadrado o
  redondo. Sin logo, su nombre de catálogo en la letra de títulos, grande.

### 9. La base (SQL #73, `esquema-catalogo-revendedor.sql`)

- `revendedores.tema jsonb` con `check (rv_tema_valido(tema))`.
- `rv_tema_valido(jsonb)` (inmutable, revocada a todos salvo el `check`):
  solo las siete claves, cada una de su tipo y de su lista; colores
  `^#[0-9a-fA-F]{6}$`; frase de 1 a 90 letras sin caracteres de control;
  portada un entero positivo.
- `rv_guardar_tema(p_sesion, p_tema jsonb)`: con su testigo; si trae
  portada, tiene que ser una pieza de su catálogo
  (`rv_catalogo_publico(su usuario)`) o una de su inventario. Null borra su
  tema (vuelve a su paleta).
- `admin_tema_revendedor(p_revendedor, p_tema jsonb)`: lo mismo, del
  administrador (`if not es_admin() then raise`).
- `rv_perfil_publico` gana `tema` al final (el tema guardado, o null).
  Ninguna otra clave cambia. El pedido y el panel ya saben el usuario y
  lo piden ahí: `rv_ver_apartado` y `rv_resumen` no se tocan.
- `rv_usuario_para_logo` y `rv_poner_logo`: revocadas a `public`, `anon` y
  `authenticated`; `grant execute ... to service_role`.
- `paleta` y `rv_ajustes` no cambian: el navegador viejo sigue guardando
  nombre, paleta y teléfono, y la paleta sigue siendo el respaldo del tema.
- `verificar`: `rv_perfil_publico` no suelta claves de costo, las dos
  funciones del logo no se ejecutan sin sesión ni con sesión, el `check`
  rechaza un color que no sea hexadecimal y una plantilla fuera de la
  lista.

### 10. El panel (Mi catálogo) y Revendedores

- Mi catálogo gana, con el aspecto de hoy del panel: **Tu logo** (subir),
  **Plantilla** (tres con miniatura), **Colores** (temas listos + principal
  y fondo con el contraste medido), **Letra de los títulos** (las cinco,
  cada una en su letra), **Esquinas**, **Portada** (elegir pieza + frase)
  y **Ver cómo queda**. Guarda con `rv_guardar_tema` además de lo de hoy.
- Revendedores (del dueño): el mismo editor de tema (un componente
  compartido, `EditorTemaRv`) en la ficha del revendedor, que guarda con
  `admin_tema_revendedor`.

## Seguridad

- El tema se valida en la base; en el navegador, `tema.ts` vuelve a
  normalizarlo (lo desconocido cae al valor por defecto) antes de que un
  color llegue a una variable de CSS. La frase solo va como texto de React.
- La letra es una clave de una lista que mapea a un `import()` fijo: nunca
  un nombre de letra libre.
- El logo: la ruta la pone el servidor, no el navegador; el tipo se mira
  por bytes.
- Nada nuevo sin sesión que lea costo, piso o lo que él paga a Lux.
- `rv_guardar_tema` es una puerta del revendedor: revisión de seguridad
  con el agente de seguridad (README, paso 6), junto con la función del
  logo.

## Pruebas

- `npm run pruebas`: `tema.ts` (contraste medido contra valores
  conocidos, ajuste hasta 4,5:1 en los seis temas listos y en casos feos:
  amarillo sobre blanco, gris medio, negro sobre negro; normalizar un tema
  roto), y la elección de portada.
- PGlite con la instalación entera: el `check`, las dos funciones de tema
  (pieza de otro catálogo, frase de 91, clave extra, color `red`), las del
  logo (sin `service_role`, ruta de otro usuario), `rv_perfil_publico` con
  y sin tema.
- Datos feos (`break-ui`): nombre de catálogo de 60 letras, logo apaisado
  muy ancho, logo cuadrado, sin logo, 0 piezas, 400 piezas, una pieza con
  52 medidas, frase de 90.
- DevTools con CPU 4x más lenta en las tres plantillas.
- `npm run build`, `npm run verificar`.

## Documentos que cambian

- CLAUDE.md: el árbol (`revendedor/catalogo/`), "Su paleta" (ahora tema
  con color libre medido), la tabla nueva de funciones, la regla de que su
  catálogo está fuera del sistema visual de Lux, `logo-revendedor` junto a
  `vendedoras`.
- INSTALACION.md: el #73 y cómo publicar `logo-revendedor`.
- DESIGN.md y `.impeccable/design.json`: nota de que el catálogo del
  revendedor tiene su propio sistema y dónde vive.
- `.claude/skills/lux-ui/SKILL.md`: que no se aplica a
  `src/paginas/revendedor/catalogo/`.
- La guía del revendedor, si nombra botones que cambian (Mi catálogo).
- README de la fase: estado.

## Decisiones mías (el dueño puede cambiarlas)

- **El pedido en una hoja** (la maqueta "El pedido en una hoja") en vez de
  la pantalla aparte de hoy.
- **Su WhatsApp** sigue en la cabecera ("Escríbeme") y al final, como hoy.
- **Con tema guardado, la paleta ya no cambia nada**: si él cambia la
  paleta desde un navegador viejo (`rv_ajustes`), manda el tema. Elegir un
  tema listo en el panel nuevo escribe sus colores en el tema.
- **Las esquinas** van en fotos, tarjetas y botones a la vez.
- **"Ver cómo queda"** abre su catálogo en otra pestaña (lo guardado); no
  hay vista previa en vivo dentro del panel.
- **La ficha propia** reemplaza `VisorFoto`, `ElegirVariante` y
  `ArmarDije` en su catálogo (no en la tienda).

## Lo que queda al constructor

- Los valores exactos de cada plantilla (tamaños, espacios) siguiendo las
  maquetas.
- Cómo se parte `CatalogoRvVista` entre el cerebro y las piezas.
- La frase estándar de cada plantilla (texto de marca, no una cifra), que
  el dueño revisa al ver el catálogo.
