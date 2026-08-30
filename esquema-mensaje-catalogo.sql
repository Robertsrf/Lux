-- =====================================================================
-- Lux by Emory — el mensaje que acompaña al enlace del catálogo
-- Ejecutar en el SQL Editor. Son cuatro líneas.
--
-- POR QUÉ
-- La vendedora no tenía forma de conseguir el enlace del catálogo: habría
-- tenido que sabérselo de memoria y escribirlo en el teléfono con la
-- clienta esperando. Ahora hay un botón en Pedidos que lo copia y otro
-- que abre WhatsApp con el mensaje ya puesto.
--
-- El texto vive aquí, no en el código, para que se cambie desde la
-- pantalla de Textos sin desplegar nada. Si esta fila estuviera vacía, la
-- interfaz usa uno por defecto y no se rompe.
-- =====================================================================

insert into textos (clave, valor) values
  ('mensaje_whatsapp',
   'Hola, te comparto el catálogo de Lux by Emory. Puedes ver las piezas ' ||
   'disponibles y apartar las que te gusten desde ahí:')
on conflict (clave) do nothing;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select clave from textos order by clave;
--     -> catalogo_intro, catalogo_pie, ciudad, estado,
--        materiales_corto, materiales_largo, mensaje_whatsapp
--
-- Los siete salen en la pantalla de Textos y se editan ahí.
-- =====================================================================
