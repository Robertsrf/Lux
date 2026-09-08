# Lux by Emory — contexto de producto

## Register

**product.** Es una herramienta de trabajo autenticada: inventario, punto de venta
y cuadre. El diseño sirve a la tarea, no es el producto. La única superficie con
alma de pieza de marca es el catálogo en PDF.

## Qué es y para quién

Sistema de inventario y ventas de una joyería hipoalergénica en Sabana de Mendoza,
Venezuela. Dos caras con necesidades opuestas:

- **Mostrador (1 vendedora).** Teléfono Android de gama baja, luz fuerte de tienda,
  una mano ocupada con joyas. Registrar una venta en menos de 10 segundos.
- **Administración (2 administradores).** Cargar inventario, fijar tasas, comparar
  costos y márgenes. Densidad y precisión sobre respiración.

**Todo el sistema funciona desde el teléfono, la administración incluida.** Antes
esta línea decía que la administración era de escritorio, y el código la creía: el
inventario en un teléfono era una tabla de trece columnas de la que solo se veían
dos botones y media SKU. Se cambió a propósito en septiembre de 2026. El escritorio
sigue siendo donde se trabaja cómodo con densidad; el teléfono ya no es un sitio
donde el sistema se rinde.

La consecuencia de diseño: **por debajo de 900 px la navegación vive ABAJO**, en una
barra fija con tres secciones y un botón que abre el resto en una hoja. No es una
hamburguesa arriba a la izquierda, y no por moda: esa esquina es la que peor alcanza
el pulgar de quien sostiene el teléfono con una mano, y esto es un punto de venta.
Donde una tabla no cabe, se enseña menos, no lo mismo reacomodado.

El detalle que manda todo: **la vendedora no puede ver un solo número de costo.**
Eso es una regla de negocio, no una preferencia visual.

## Personalidad

Autoridad silenciosa. La referencia es Rolex: el lujo se demuestra, no se grita.
La joya es la protagonista; la interfaz es el estuche.

## Anti-referencias

- Degradados, sombras dramáticas, emojis decorativos, animaciones de relleno.
- Fuentes de exhibición en etiquetas, botones o datos. La serif es para el
  nombre de la pieza y para el precio, no para la interfaz.
- Tarjetas anidadas y bordes laterales de color como acento.
- Cualquier color fuera de la paleta.

## Accesibilidad

- Todo texto a **4,5:1** como mínimo. No es aspiracional: la tienda tiene luz
  fuerte y el teléfono es de gama baja. Medido, no estimado.
- Foco de teclado visible en todo elemento interactivo.
- `prefers-reduced-motion` respetado.
- Responsive real hasta 320 px. Medido en navegador a 320 y a 390: ninguna
  pantalla desborda, ni las de administración.
- Objetivo táctil de 56 px en el mostrador, 52 px en la barra de navegación del
  teléfono, 36 px en escritorio.

## Sistema visual

Vive en la skill **`lux-ui`** (`.claude/skills/lux-ui/SKILL.md`), que es la única
fuente de verdad de paleta, tipografía y componentes. No se escribe un DESIGN.md
aparte a propósito: duplicar la paleta en dos archivos es exactamente lo que esa
skill prohíbe.
