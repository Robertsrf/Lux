-- =====================================================================
-- #76 · esquema-inicio-y-rastro.sql
-- El Inicio del administrador y la mercancía sin rastro, lote por lote
-- (fase 9, el administrativo rehecho, 24/11/2026). Depende del #75
-- (esquema-cuentas-del-flujo.sql). Se puede correr varias veces.
--
-- POR QUÉ
-- El dueño entra ahora a un Inicio que dice lo que le toca hacer hoy, y la
-- pantalla Flujo enseña la "mercancía sin rastro" del informe de la fase 8
-- (punto 6) con su detalle por lote. Ninguna de las dos cuenta dinero
-- nuevo: leen lo que ya existe. Diseño:
-- docs/superpowers/specs/2026-11-24-administrativo-design.md.
--
-- QUÉ HACE
-- 1. admin_inicio(): un json con lo que pide atención. Solo CUENTA sobre
--    las vistas de siempre, así ninguna regla se copia: si una vista cambia
--    lo que es "por verificar", el Inicio cambia con ella.
--      ventas_por_verificar, por_verificar_bs  v_ventas_por_verificar (sin
--                                              las de crédito: esas van en
--                                              vencidos, o no apremian)
--      abonos_por_revisar                      v_abonos_detalle (sin verificar
--                                              y sin anular)
--      pedidos_por_entregar, pedidos_vencidos  v_pedido_vendedora (fase
--                                              'pagado' y 'vencido')
--      apartados_por_aprobar                   v_apartados_revendedor (pagado
--                                              entero a Lux, sin venta aún)
--      creditos_vencidos, vencido_bcv          v_credito (vencida)
--      conteos_por_revisar                     v_conteos (lineas_por_revisar)
--    Solo el administrador.
-- 2. sin_rastro_por_lote() (revocada a todos): por lote, en $ Binance (el
--    lote nace en Binance), lo comprado, lo vendido a lo que costó, lo que
--    hay en la tienda, lo que viene y la diferencia; y un renglón "sin
--    lote" (lote_id null) si alguna pieza sin lote tiene historia. Es la
--    misma regla que `mercancia_sin_rastro` de flujo_negocio: la suma de
--    los renglones es esa cifra en $ Binance. admin_sin_rastro_lotes() la
--    envuelve para el administrador.
--
-- DEBERÍA DAR
--   select sum(sin_rastro) from admin_sin_rastro_lotes();
--   -- = select binance from admin_flujo() where concepto = 'mercancia_sin_rastro';
--   select admin_inicio();  -- {"ventas_por_verificar": ..., ...} (nueve claves)
-- Probado en PGlite con la instalación entera (ver INSTALACION.md, #76).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EL INICIO
-- ---------------------------------------------------------------------

create or replace function admin_inicio()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  r jsonb;
begin
  if not es_admin() then
    raise exception 'Solo un administrador ve el Inicio.';
  end if;

  select jsonb_build_object(
    'ventas_por_verificar', (select count(*) from (select distinct venta_id from v_ventas_por_verificar
                                                     where credito_vence is null) x),
    'por_verificar_bs',     (select coalesce(sum(total_bs), 0) from (select distinct venta_id, total_bs from v_ventas_por_verificar
                                                                       where credito_vence is null) x),
    'abonos_por_revisar',   (select count(*) from v_abonos_detalle where verificado_en is null and anulado_en is null),
    'pedidos_por_entregar', (select count(distinct reserva_id) from v_pedido_vendedora where fase = 'pagado'),
    'pedidos_vencidos',     (select count(distinct reserva_id) from v_pedido_vendedora where fase = 'vencido'),
    'apartados_por_aprobar',(select count(*) from v_apartados_revendedor
                              where venta_id is null and lux_falta_bcv <= 0.005
                                and fase in ('por_pagar_lux', 'en_revision')),
    'creditos_vencidos',    (select count(*) from v_credito where vencida),
    'vencido_bcv',          (select coalesce(round(sum(falta_bcv), 2), 0) from v_credito where vencida),
    'conteos_por_revisar',  (select count(*) from v_conteos where lineas_por_revisar > 0)
  ) into r;
  return r;
end;
$fn$;

revoke all on function admin_inicio() from public, anon;
grant execute on function admin_inicio() to authenticated;


-- ---------------------------------------------------------------------
-- 2. LA MERCANCÍA SIN RASTRO, LOTE POR LOTE
-- ---------------------------------------------------------------------

-- La regla de flujo_negocio (#75), en $ Binance y partida por lote: lo
-- vendido y lo que hay, por el lote de la pieza; lo que viene, por el lote
-- en que viene (una reposición es de ese lote, que es el que se pagó).
create or replace function sin_rastro_por_lote()
returns table (lote_id bigint, codigo text, comprado numeric, vendido numeric,
               en_tienda numeric, en_camino numeric, sin_rastro numeric)
language sql
stable
security definer
set search_path = public
as $fn$
  with
  comprado as (
    select l.id, sum(l.costo_mercancia_usd + l.flete_mercancia_usd) as v from lotes l group by l.id
  ),
  vendido as (
    select m.lote_id as id, sum(i.cantidad * i.costo_puesto_usd_snap) as v
      from venta_items i
      join ventas v on v.id = i.venta_id and not v.anulada
      join modelos m on m.id = i.modelo_id
     group by m.lote_id
  ),
  en_tienda as (
    select m.lote_id as id, sum(e.cantidad * m.costo_puesto_usd) as v
      from existencias e join modelos m on m.id = e.modelo_id
     group by m.lote_id
  ),
  en_camino as (
    select p.lote_id as id, sum(p.cantidad * m.costo_puesto_usd) as v
      from por_llegar p
      join lotes l on l.id = p.lote_id and l.en_camino
      join modelos m on m.id = p.modelo_id
     group by p.lote_id
  ),
  claves as (
    select id from comprado
    union select id from vendido
    union select id from en_tienda
    union select id from en_camino
  )
  select k.id, l.codigo,
         round(coalesce(c.v, 0), 2),
         round(coalesce(v.v, 0), 2),
         round(coalesce(t.v, 0), 2),
         round(coalesce(w.v, 0), 2),
         round(coalesce(c.v, 0) - coalesce(v.v, 0) - coalesce(t.v, 0) - coalesce(w.v, 0), 2)
    from claves k
    left join lotes l on l.id = k.id
    left join comprado c on c.id is not distinct from k.id
    left join vendido v on v.id is not distinct from k.id
    left join en_tienda t on t.id is not distinct from k.id
    left join en_camino w on w.id is not distinct from k.id
   order by l.fecha_llegada desc nulls last, k.id desc nulls last;
$fn$;

revoke all on function sin_rastro_por_lote() from public, anon, authenticated;

create or replace function admin_sin_rastro_lotes()
returns table (lote_id bigint, codigo text, comprado numeric, vendido numeric,
               en_tienda numeric, en_camino numeric, sin_rastro numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'Solo un administrador ve la mercancía por lote.';
  end if;
  return query select * from sin_rastro_por_lote();
end;
$fn$;

revoke all on function admin_sin_rastro_lotes() from public, anon;
grant execute on function admin_sin_rastro_lotes() to authenticated;
