-- =====================================================================
-- Lux by Emory — tres correcciones de datos, una sola vez
-- Ejecutar en el SQL Editor DESPUÉS de esquema-indices-fk.sql
--
-- ESTE ARCHIVO ES DISTINTO A LOS DEMÁS
-- Los otros montan el sistema. Este arregla datos concretos de TU base,
-- encontrados en la auditoría. En una instalación nueva no hay nada que
-- arreglar: todo va con guardas, así que ahí no hace nada y no estorba.
-- Correrlo dos veces tampoco cambia nada la segunda.
-- =====================================================================


-- --- 1. La pieza que se vendía sin flete encima ----------------------
--
-- `SET-G16-001` (Set de tres capas con forma de luna creciente) era el
-- único modelo activo sin lote. Sin lote no hay flete, así que su costo
-- estaba incompleto: se le cargaba la mercancía pero no lo que costó
-- traerla. 1 de 91.
--
-- LO QUE CAMBIA, EN NÚMEROS
--   flete por unidad del lote L2608-01:  $75 / (300 + 20) = $0,2344
--   costo puesto:      $5,4299  ->  $5,6643
--   costo en BCV:      $9,2672  ->  $9,5452
--   margen a $16:        42,1 %  ->    40,3 %
--
-- EL PRECIO NO SE MUEVE. Sigue en G16 y el margen queda por encima del
-- piso de 40 %, justo por encima. Lo único que cambia es que ahora el
-- costo dice la verdad. Si mañana sube el flete, esta pieza va a ser la
-- primera en caerse del piso, y eso es correcto: es información, no un
-- problema nuevo.
--
-- `costo_puesto_usd` es una columna generada (unitario + flete), así que
-- se recalcula sola. No hay que tocarla.

update modelos
   set lote_id            = l.id,
       flete_unitario_usd = calcular_flete_unitario(l.id),
       actualizado_en     = now()
  from lotes l
 where modelos.sku = 'SET-G16-001'
   and modelos.lote_id is null
   and l.codigo = 'L2608-01';


-- --- 2. Las frases repetidas -----------------------------------------
--
-- Dos frases estaban cargadas dos veces, en categorías distintas:
--
--   "Prueba antes que promesa."   SLG-03  y  MIC-10
--   "Ver es creer."               SLG-10  y  MIC-09
--
-- Como la vitrina alterna categorías por turnos, la misma frase podía
-- salir dos veces en una vuelta.
--
-- Se apaga la copia MIC de cada par, no la SLG, por dos razones: las SLG
-- son slogans de firma y salen en tres superficies (televisor, vendedora
-- y pie de foto), mientras que las MIC solo salen en el televisor — que
-- las SLG ya cubren. Y "Prueba antes que promesa" da nombre a una
-- categoría entera (PRU): es un ancla de marca, no un relleno de loop.
--
-- Se desactivan, no se borran. Si mañana quieres la versión corta de
-- vuelta, es un `activo = true`.

update frases set activo = false
 where id in ('MIC-10', 'MIC-09')
   and activo;


-- --- 3. Las dos piezas con el mismo nombre ---------------------------
--
-- ESTO NO LO CORRIJO YO, Y TE EXPLICO POR QUÉ.
--
-- Hay dos piezas activas que se llaman igual Y tienen la misma
-- descripción, pero son distintas y cuestan distinto:
--
--   CIN-G25-001   "Cadena de cintura femenina"   grupo G25 ($25)   costo $9,32
--   CIN-G14-002   "Cadena de cintura femenina"   grupo G14 ($14)   costo $4,18
--
-- En el catálogo público una clienta ve el mismo nombre dos veces a dos
-- precios, sin nada que le diga cuál es cuál. Eso hay que arreglarlo.
--
-- Pero no puedo ponerle nombre yo: no sé qué las diferencia. La
-- descripción está copiada tal cual entre las dos (y también en
-- CIN-G16-001), así que tampoco lo dice. Inventarle un adjetivo —
-- "gruesa", "doble", "premium"— sería escribir en tu catálogo algo que
-- no me consta, y eso no se hace.
--
-- MIRA LAS FOTOS Y DECIDE TÚ. Están en el respaldo:
--   Respaldos Lux/2026-09-07-0342/fotos/cadena-de-cintura-femenina/
--
-- Después descomenta y completa. Lo más probable es que además quieras
-- reescribirle la descripción a la de $25, que hoy es la misma que la de
-- $14 y la de $16.

-- update modelos set nombre = 'Cadena de cintura femenina ____________',
--        actualizado_en = now()
--  where sku = 'CIN-G25-001';

-- update modelos set nombre = 'Cadena de cintura femenina ____________',
--        actualizado_en = now()
--  where sku = 'CIN-G14-002';


notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
--   select sku, flete_unitario_usd, costo_puesto_usd, lote_id
--     from v_catalogo_admin where sku = 'SET-G16-001';
--     -> 0.2344 | 5.6643 | 4
--
--   select count(*) from modelos where activo and lote_id is null;
--     -> 0
--
--   select id, activo from frases where id in ('SLG-03','MIC-10','SLG-10','MIC-09');
--     -> las SLG activas, las MIC apagadas.
--
--   select count(*) from frases where activo;
--     -> 220, dos menos que antes.
-- =====================================================================
