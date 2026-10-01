-- =====================================================================
-- Lux by Emory — la guía pública para revendedores
-- Ejecutar en el SQL Editor DESPUÉS de esquema-visitas-catalogo.sql
-- (usa rv_escalera() de esquema-revendedores.sql y las claves de
-- esquema-revendedores-plazos.sql)
--
-- QUÉ PIDIÓ EL DUEÑO (30/09/2026)
-- Una sección "Capacitación revendedores" con un enlace público que él
-- manda a cualquiera que quiera ser revendedor: qué es, cómo funciona,
-- cuánto le sale cada pieza, cómo se le paga a Lux, el manual del panel
-- paso a paso, y cómo pedir su cuenta con los datos que hacen falta.
--
-- QUÉ HACE
-- 1. `rv_programa()`, sin sesión: las cifras del programa tal como están
--    en `configuracion` (descuento, precio mínimo sobre la etiqueta,
--    plazos, apartado de su clienta, tope y niveles). La guía las lee de
--    aquí y no las escribe a mano: si el dueño cambia una en
--    Revendedores, la guía dice lo nuevo sin tocar código.
--    NINGUNA cifra de costo: ni márgenes, ni pisos, ni lo que deja una
--    pieza. El descuento y el tope se dicen porque son la oferta; el
--    precio al que le sale cada pieza lo ve él en su panel, ya con su
--    cuenta.
-- 2. Tres textos nuevos, vacíos, que el dueño llena en Textos: el WhatsApp
--    de la tienda (a donde llega la solicitud), la dirección y el horario
--    (donde se retiran las piezas). Vacíos, la guía no inventa nada: dice
--    que se pregunte por WhatsApp.
--
-- La solicitud no se guarda en la base: la guía arma un mensaje de
-- WhatsApp con los datos y la persona lo manda. Así no hay una puerta
-- sin sesión que escriba datos personales.
--
-- Reejecutable.
-- =====================================================================

create or replace function rv_programa()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'descuento_pct',        (select valor from configuracion where clave = 'revendedor_descuento_pct'),
    'sobre_etiqueta_usd',   (select valor from configuracion where clave = 'revendedor_sobre_etiqueta_usd'),
    'horas_pago',           (select valor from configuracion where clave = 'revendedor_horas_pago'),
    'horas_para_pagar',     (select valor from configuracion where clave = 'revendedor_horas_para_pagar'),
    'inicial_pct',          (select valor from configuracion where clave = 'apartado_inicial_pct'),
    'vueltas_para_subir',   (select valor from configuracion where clave = 'revendedor_vueltas_para_subir'),
    'vencidos_para_bajar',  (select valor from configuracion where clave = 'revendedor_vencidos_para_bajar'),
    'dias_ventana',         (select valor from configuracion where clave = 'revendedor_dias_ventana'),
    'escalera',             coalesce((select jsonb_agg(jsonb_build_object(
                                        'nivel', e.nivel, 'tope_usd', e.tope_usd, 'desde_usd', e.desde_usd)
                                        order by e.nivel)
                                        from rv_escalera() e), '[]'::jsonb));
$fn$;

revoke all on function rv_programa() from public;
grant execute on function rv_programa() to anon, authenticated;


insert into textos (clave, valor, descripcion) values
  ('whatsapp_tienda',  '', 'WhatsApp de la tienda, con el código: 0414 1234567. A este número llegan las solicitudes de la guía de revendedores'),
  ('direccion_tienda', '', 'Dirección de la tienda, para retirar las piezas'),
  ('horario_tienda',   '', 'Horario de la tienda, para retirar las piezas')
on conflict (clave) do nothing;
