-- =====================================================================
-- Lux by Emory — frases de marca para la vitrina y el catálogo
-- Ejecutar en el SQL Editor DESPUÉS de esquema-grupos-nuevos.sql
--
-- DOS COSAS
--
-- 1. `esquema-guia.sql` se corrió dos veces y dejó cada consejo por
--    duplicado: 42 frases donde debería haber 21. La vendedora ve la
--    misma dos veces seguidas al pulsar "Otra".
--
--    La causa es fina: el archivo SÍ dice `on conflict do nothing`, pero
--    sin decir CONTRA QUÉ. Sin una llave única no hay conflicto que
--    detectar, así que la clausula no hacía nada. Al crear la llave aquí,
--    esquema-guia.sql queda idempotente sin tocarle una línea.
--
-- 2. Se agregan las frases de la vitrina y el catálogo. A diferencia de
--    los consejos, que le hablan a la vendedora, estas le hablan al
--    CLIENTE: van en el televisor de la tienda y en el PDF.
--
-- DE DÓNDE SALEN
-- Ninguna está inventada. Todas son frases que ya están en la Guía del
-- Colaborador, recortadas para leerse de lejos. La procedencia va
-- anotada al lado de cada una.
--
-- LO QUE NO SE PUSO
-- La certificación SGS. La guía dice "se menciona, no se enseña", y una
-- pantalla de cara al público es terreno de frontera. Si el dueño la
-- quiere ahí, que la agregue él a conciencia.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. FUERA LOS DUPLICADOS, Y QUE NO VUELVAN
-- Se conserva el de id más bajo, que es el primero que entró.
-- ---------------------------------------------------------------------

delete from consejos c
 where exists (
   select 1 from consejos otro
    where otro.momento = c.momento
      and otro.texto   = c.texto
      and otro.id      < c.id
 );

alter table consejos drop constraint if exists consejos_momento_texto_key;
alter table consejos add  constraint consejos_momento_texto_key unique (momento, texto);

-- ---------------------------------------------------------------------
-- 2. LAS FRASES DE CARA AL CLIENTE
--
-- Cortas a propósito: un televisor se lee de lejos y de reojo. Si no se
-- entiende en dos segundos, no sirve.
-- ---------------------------------------------------------------------

insert into consejos (momento, etiqueta, texto, nota, orden) values
  -- de los 4 pilares
  ('vitrina', 'Material',  'Acero quirúrgico 316L. El mismo de los instrumentos médicos.', null, 1),
  ('vitrina', 'Material',  'Aleación de titanio. Hipoalergénica de verdad.',               null, 2),
  -- del discurso oficial
  ('vitrina', 'Promesa',   'No se mancha. No se pone verde. No te irrita.',                null, 3),
  ('vitrina', 'Promesa',   'Aguanta agua, sudor y perfume sin perder el brillo.',          null, 4),
  -- de la respuesta a "¿y esto es oro de verdad?"
  ('vitrina', 'Acabado',   'Baño de oro 18K PVD. El oro va pegado al metal: no se cae ni se borra.', null, 5),
  -- del cierre de la demostración
  ('vitrina', 'Valor',     'Te dura años, no meses.',                                      null, 6),
  ('vitrina', 'Valor',     'No es un gasto: es una pieza que se queda contigo.',            null, 7),
  -- de la despedida
  ('vitrina', 'Invitación','Úsala con todo, que para eso está hecha.',                      null, 8)
on conflict (momento, texto) do nothing;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select momento, count(*) from consejos group by momento order by 1;
--     -> ningún momento con el doble de lo que debería
--     -> vitrina: 8
--
--   select count(*) from consejos;   -> 8 más que la mitad de lo que había
-- =====================================================================
