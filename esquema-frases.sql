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
-- 2. Las frases de cara al cliente ya no salen de aquí: viven en
--    esquema-banco-frases.sql, generado desde el banco del dueño.
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
-- LAS FRASES SE FUERON A SU PROPIO ARCHIVO
--
-- Aqui vivian ocho frases que escribi recortando la Guia del Colaborador.
-- Duraron poco: el dueno entrego el banco de verdad, 222 frases con ID
-- estable y sus reglas de rotacion, y eso vive en esquema-banco-frases.sql.
--
-- Este archivo conserva lo que sigue valiendo: quitar los duplicados y
-- ponerle la llave unica que le faltaba a la tabla.
-- ---------------------------------------------------------------------

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select momento, count(*) from consejos group by momento order by 1;
--     -> ningún momento con el doble de lo que debería
-- =====================================================================
