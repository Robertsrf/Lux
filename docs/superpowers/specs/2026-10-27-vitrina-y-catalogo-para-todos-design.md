# La vitrina que atrae y el catálogo para todos (27/10/2026)

Pedido del dueño, el 27/10/2026, en cinco puntos. Este documento cubre el 4 y
el 5 (la vitrina y el catálogo); el 2 y el 3 están en
`esquema-lote-y-grupos.sql` (#62) y el 1 (lo de tienda por pieza) espera el
diagnóstico de `correccion-costo-tienda-1-mirar.sql`.

> 4. Hay errores en la vitrina: al poner el QR se superpone a las prendas, y no
> hay reglas cuando hay más prendas: para cierto tipo de cuello salen aretes,
> cuando deberían salir collares, o si no hay, decir que esos combinan. Que sea
> increíble e inevitablemente llame la atención; investiga otras vitrinas.
>
> 5. El catálogo me gusta, pero no hay una sección para ver todo y no por
> categorías. Piensa que eres una persona mayor o que maneja poco la
> tecnología: entendible y guiable desde que entra, el catálogo y la vitrina.

## Lo que se midió antes de diseñar

En el catálogo en línea, como lo ve una clienta sin sesión (27/10/2026):

- 152 piezas en 128 productos, de 12 categorías.
- **Ningún collar dice su largo en la medida** (la variante). El largo, cuando
  está, va en la nota ("Largo: 45 cm", "Largo disponible: 60 cm y 45 cm") o se
  deduce de la forma ("Gargantilla", "collar en forma de Y").
- Solo 21 de 152 piezas dicen su tono (dorado, plateado, rosado).
- **93 de 128 productos tienen una sola pieza.**
- Precios de $2,50 a $30 BCV; mediana $14, primer cuarto $11.

## Por qué salían aretes en los escotes

`piezasParaEscote` tomaba las tres primeras piezas que encajaban, y las piezas
llegan ordenadas por categoría: "arete" va antes que "cadena" y "collar". En
los escotes que admitían aretes (cuello alto, barco, camisa) las tres primeras
eran aretes, debajo de un dibujo que pintaba una cadena. Además el largo se
buscaba solo en la medida, que ningún collar llena.

## Lo que se investigó

Pantallas de tienda (digital signage):

- Una idea por pantalla; la regla 3×5 (tres renglones de cinco palabras, o
  cinco de tres); como mucho dos fuentes; letra más gruesa antes que más
  grande; el 5 % del borde libre; una llamada a la acción clara con la
  recompensa inmediata (un QR, una URL)
  ([Rise Vision](https://www.risevision.com/blog/digital-signage-design)).
- Una pantalla se lee en dos a cuatro segundos, con tres datos como mucho;
  entre 8 y 12 segundos por pantalla de producto; contraste con meta de 7:1
  ([CrownTV](https://www.crowntv-us.com/blog/digital-signage-design/)). De pie
  frente a una pantalla se pasan de cuatro a seis segundos
  ([Exhibitor](https://www.exhibitoronline.com/topics/article.asp?ID=2605)).
- Letra de una pulgada por cada diez pies de distancia como mínimo
  ([Western Michigan](https://wmich.edu/digital-accessibility/digital-signage)).
- En una joyería, menos es más: demasiado precio y demasiado letrero hacen
  que la tienda parezca de centro comercial
  ([SnapRetail](https://snapretail.com/uncategorized/using-signage-jewelry-cases/)).

Qué collar va con cada escote (las guías coinciden en lo central: el largo del
collar según la profundidad del escote, y aretes en lugar de collar cuando el
escote ya viste):

- V: un dije que siga la V, por encima del borde. Redondo: corto, por encima
  del borde. Alto: largo, por fuera. Barco: princesa o matiné, o aretes con
  presencia en su lugar. Corazón: ceñido o a la clavícula. Camisa: por encima
  de donde empieza el cuello
  ([GLDN](https://gldn.com/blogs/journal/what-necklace-to-wear-with-what-neckline)).
  Que unos aretes con presencia reemplazan al collar en el barco y que el
  cuello alto pide largo lo dicen también otras guías de joyerías; no
  coinciden en todo, y aquí se tomó lo que comparten.

Personas mayores y con poca práctica digital:

- Letra más grande y más contraste; botones más grandes; errores dichos claro
  y junto a lo que hay que arreglar; nada que se adivine
  ([NN/g, usabilidad para mayores de 65](https://www.nngroup.com/articles/usability-for-senior-citizens/)).
- Dar una salida fácil que no sea digital, un teléfono o un chat
  ([Alzheimer's Society](https://www.alzheimers.org.uk/blog/how-design-websites-older-people)).

## Lo que se hizo en la vitrina

1. **El riel.** El QR flotaba en la esquina, encima de la escena. Ahora la
   pantalla tiene dos partes que no se pisan: el escenario, que recorta lo que
   se salga, y el riel a la derecha con la marca, "Míralo todo en tu
   teléfono", el código tan grande como deja el riel, cómo se escanea en tres
   pasos (no todo el mundo sabe que la cámara lee un QR) y un mensaje que rota.
   Es la única llamada a hacer algo de la pantalla.
2. **El conjunto** en lugar de "Para combinar": una pieza por parte del cuerpo
   (cuello, orejas, muñeca, mano), del mismo tono si se sabe, cada una diciendo
   dónde va, y el total. Un set dice en su nombre lo que trae ("Set collar +
   pulsera"); una alianza de matrimonio no entra en un conjunto de moda.
3. **Los escotes** con la regla de las guías: primero collares del largo que
   le va; aretes "para completar"; y si no hay collar que le vaya, aretes en
   su lugar y dicho ("Estos aretes combinan", como lo pidió el dueño), con un
   consejo de aretes propio de cada escote y sin cadena en el dibujo.
4. **"Para regalar"**, con las piezas del primer cuarto de precio y "desde".
   Es un gancho de compra que no inventa nada: sale de los precios.
5. **"Así de fácil"**: cómo se compra, en tres pasos grandes.
6. **El brillo de gema**: dos estrellas de oro que se encienden una vez al
   final del destello de la pieza estelar. Lo que se ve de reojo.
7. **No entró "Últimas piezas"**: con 93 de 128 productos en una sola pieza,
   sería decir "queda una" de casi todo.

Probado con las piezas reales a 1920 × 1080 y a 1366 × 768, con y sin el QR.

## Lo que se hizo en el catálogo

1. **"Todas las joyas"**, juntas y sin separar por tipo (`?ver=todas`): un
   botón en la portada, el primer cuadro de los tipos (cuatro fotos) y una
   tarjeta al final de los estantes.
2. **Por dónde empezar**, en la portada: "Ver todas las joyas" en oro y
   "O elige por tipo".
3. **La ayuda por WhatsApp**, en la portada: quien no quiere pedir solo sabe
   que no hace falta.
4. **En la lista, "Ver" y "Ordenar" a la vista**, no plegados en "Filtrar"
   (quien no sabe que se abre, no lo abre). En el teléfono, lado a lado; en
   pantallas anchas, los tipos en fichas. En el teléfono las fichas eran
   cuatro renglones antes de la primera joya.
5. **El aviso tras la primera pieza**: "Listo, está en tu pedido. Sigue
   eligiendo; cuando termines, toca «Ver mi pedido» aquí abajo."
6. **"Letra grande"**, en la cabecera del catálogo y del pedido: la escala de
   la casa sube un paso y se recuerda en el teléfono.

## Lo que queda abierto

- El catálogo de cada revendedor comparte la tarjeta y los tipos, pero no tiene
  todavía "Todas las joyas" ni "Letra grande".
- La regla del tono solo separa lo que se sabe: si el dueño quiere conjuntos
  más finos, que el nombre o la medida de cada pieza diga su tono.
- El largo de un collar solo se sabe si el nombre, la medida o la nota lo
  dicen. Si el dueño escribe "45 cm" en la medida (o en la nota) de cada
  collar, la guía de escotes acierta siempre.
