-- =====================================================================
-- Lux by Emory — inversiones y recuperación
-- Ejecutar en el SQL Editor DESPUÉS de esquema-costos.sql
--
-- DOS COSAS DISTINTAS QUE NO HAY QUE CONFUNDIR
--
--   AMORTIZAR   mete la inversión en el costo de cada pieza. Sube precios.
--   RECUPERAR   mide cuánto de lo invertido ya volvió. No toca precios.
--
-- Cada inversión decide si se amortiza o no (`amortizar_meses`). Una
-- vitrina cara puede seguirse sin que dispare la etiqueta de un anillo:
-- se recupera de la ganancia, que es de donde sale de verdad.
--
-- LA GANANCIA SE CONGELA AL VENDER
-- venta_items ya guardaba el costo puesto del momento. Ahora guarda
-- también lo que la pieza cargaba de gastos. Sin eso, subir el alquiler
-- reescribiría la ganancia de meses pasados y el historial mentiría.
-- =====================================================================

create table if not exists inversiones (
  id              bigserial primary key,
  nombre          text not null,
  categoria       text not null default 'mobiliario',
  monto_usd       numeric(12,4) not null check (monto_usd > 0),
  fecha           date not null default current_date,
  /* Si es null, la inversión NO entra al precio: solo se recupera de la
     ganancia. Si trae meses, además se amortiza en el costo por pieza. */
  amortizar_meses int check (amortizar_meses is null or amortizar_meses > 0),
  notas           text,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

alter table inversiones enable row level security;

drop policy if exists inversiones_admin on inversiones;
create policy inversiones_admin on inversiones for all to authenticated
  using (es_admin()) with check (es_admin());

grant select, insert, update, delete on inversiones to authenticated;
grant usage, select on sequence inversiones_id_seq to authenticated;

-- ---------------------------------------------------------------------
-- 1. LA GANANCIA DE CADA LÍNEA SE CONGELA
-- ---------------------------------------------------------------------

alter table venta_items add column if not exists costo_operativo_usd_snap numeric(12,4);

-- ---------------------------------------------------------------------
-- 2. SOLO SE AMORTIZA LO QUE EL DUEÑO DECIDIÓ AMORTIZAR
-- Los exhibidores de los lotes siguen su propia regla global
-- (capex_amortizar_meses); las inversiones manuales, la suya.
-- ---------------------------------------------------------------------

create or replace function costo_operativo_por_pieza()
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fijos   numeric := 0;
  v_piezas  numeric;
  v_empaque numeric;
  v_meses   numeric;
  v_capex   numeric := 0;
  v_manual  numeric := 0;
begin
  select coalesce(sum(valor), 0) into v_fijos
    from configuracion
   where clave in ('gasto_alquiler_mes_usd', 'gasto_sueldos_mes_usd',
                   'gasto_servicios_mes_usd', 'gasto_otros_mes_usd');

  select valor into v_piezas  from configuracion where clave = 'piezas_esperadas_mes';
  select valor into v_empaque from configuracion where clave = 'empaque_por_pieza_usd';
  select valor into v_meses   from configuracion where clave = 'capex_amortizar_meses';

  -- Exhibidores que vinieron en los lotes.
  select coalesce(sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd)), 0)
    into v_capex from lotes;
  if coalesce(v_meses, 0) > 0 then
    v_fijos := v_fijos + (v_capex / v_meses);
  end if;

  -- Inversiones manuales: SOLO las que el dueño marcó para amortizar.
  select coalesce(sum(monto_usd / amortizar_meses), 0) into v_manual
    from inversiones
   where activo and amortizar_meses is not null;
  v_fijos := v_fijos + v_manual;

  if coalesce(v_piezas, 0) <= 0 then
    return coalesce(v_empaque, 0);
  end if;

  return round((v_fijos / v_piezas) + coalesce(v_empaque, 0), 4);
end;
$$;

revoke all on function costo_operativo_por_pieza() from public, anon;
grant execute on function costo_operativo_por_pieza() to authenticated;

-- ---------------------------------------------------------------------
-- 3. LA VENTA CONGELA TAMBIÉN LO QUE LA PIEZA CARGABA DE GASTOS
-- ---------------------------------------------------------------------

create or replace function registrar_venta(
  p_tipo             text,
  p_metodo           text,
  p_items            jsonb,
  p_kit_id           bigint default null,
  p_cliente_nombre   text default null,
  p_cliente_telefono text default null,
  p_notas            text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta_id     bigint;
  v_tasa         tasas%rowtype;
  v_item         jsonb;
  v_modelo_id    bigint;
  v_ubicacion_id bigint;
  v_cantidad     int;
  v_disponible   int;
  v_precio_usd   numeric(12,4);
  v_precio_lista numeric(12,4);
  v_pedido       numeric(12,4);
  v_piso         numeric(12,4);
  v_precio_bs    numeric(14,2);
  v_costo        numeric(12,4);
  v_operativo    numeric(12,4);
  v_nombre       text;
  v_ubi_nombre   text;
  v_kit_desc     numeric(5,2) := 0;
  v_total_bs     numeric(14,2) := 0;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesion para registrar una venta.';
  end if;
  if not exists (select 1 from perfiles where id = auth.uid() and activo) then
    raise exception 'Tu usuario no tiene un perfil activo.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene piezas.';
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Un administrador tiene que fijarla antes de cobrar.';
  end if;

  -- Se calcula una vez y se congela en cada linea: si manana sube el
  -- alquiler, la ganancia de hoy no se reescribe.
  v_operativo := coalesce(costo_operativo_por_pieza(), 0);

  if p_kit_id is not null then
    select descuento_pct into v_kit_desc from kits where id = p_kit_id and activo;
    if not found then
      raise exception 'Ese kit no existe o esta inactivo.';
    end if;
  end if;

  insert into ventas (usuario_id, tipo, metodo, tasa_venta_usada, tasa_bcv_usada,
                      kit_id, cliente_nombre, cliente_telefono, notas)
  values (auth.uid(), p_tipo::tipo_venta, p_metodo::metodo_pago,
          v_tasa.tasa_venta, v_tasa.tasa_bcv,
          p_kit_id, p_cliente_nombre, p_cliente_telefono, p_notas)
  returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_modelo_id    := (v_item->>'modelo_id')::bigint;
    v_ubicacion_id := (v_item->>'ubicacion_id')::bigint;
    v_cantidad     := (v_item->>'cantidad')::int;
    v_pedido       := nullif(v_item->>'precio_unitario_usd', '')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
    end if;

    select e.cantidad into v_disponible
      from existencias e
     where e.modelo_id = v_modelo_id and e.ubicacion_id = v_ubicacion_id
     for update;

    select m.nombre, coalesce(m.precio_override_usd, g.precio_usd), m.costo_puesto_usd
      into v_nombre, v_precio_usd, v_costo
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_modelo_id and m.activo;

    if not found then
      raise exception 'El modelo % no existe o esta retirado.', v_modelo_id;
    end if;

    select nombre into v_ubi_nombre from ubicaciones where id = v_ubicacion_id;

    if v_disponible is null or v_disponible < v_cantidad then
      raise exception 'No hay suficiente "%" en %. Quedan %, y pides %.',
        v_nombre, coalesce(v_ubi_nombre, 'esa ubicacion'), coalesce(v_disponible, 0), v_cantidad;
    end if;

    if v_precio_usd is null then
      raise exception 'El modelo "%" no tiene precio: falta asignarle un grupo.', v_nombre;
    end if;

    v_precio_lista := v_precio_usd;

    if p_kit_id is not null then
      if coalesce(v_kit_desc, 0) > 0 then
        v_precio_usd := round(v_precio_usd * (1 - v_kit_desc / 100), 4);
      end if;

    elsif v_pedido is not null then
      v_piso := coalesce(precio_minimo_de(v_modelo_id), v_precio_lista);
      if v_pedido < v_piso then
        raise exception 'No puedes vender "%" por menos de Bs %. Ese es el minimo.',
          v_nombre, to_char(round(v_piso * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
      end if;
      if v_pedido > v_precio_lista then
        raise exception 'El precio de "%" no puede pasar de su precio de lista.', v_nombre;
      end if;
      v_precio_usd := v_pedido;
    end if;

    v_precio_bs := round(v_precio_usd * v_tasa.tasa_bcv, 2);

    update existencias
       set cantidad = cantidad - v_cantidad, actualizado_en = now()
     where modelo_id = v_modelo_id and ubicacion_id = v_ubicacion_id;

    insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                             precio_unitario_usd, precio_unitario_bs,
                             precio_lista_usd, costo_puesto_usd_snap,
                             costo_operativo_usd_snap)
    values (v_venta_id, v_modelo_id, v_ubicacion_id, v_cantidad,
            v_precio_usd, v_precio_bs, v_precio_lista, v_costo, v_operativo);

    v_total_bs := v_total_bs + (v_precio_bs * v_cantidad);
  end loop;

  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta_id;

  return v_venta_id;
end;
$$;

revoke all on function registrar_venta(text, text, jsonb, bigint, text, text, text) from public, anon;
grant execute on function registrar_venta(text, text, jsonb, bigint, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. CUÁNTO SE HA RECUPERADO
--
-- La mercancía se recupera al venderse: cada pieza vendida devuelve su
-- costo puesto, y lo que no se ha vendido sigue en la vitrina.
--
-- Los muebles y exhibidores se recuperan de la GANANCIA acumulada, que
-- es de donde salen de verdad. Ganancia = lo cobrado en dólares reales,
-- menos el costo de la pieza, menos lo que cargaba de gastos.
-- ---------------------------------------------------------------------

create or replace view v_recuperacion
with (security_invoker = off) as
with vendido as (
  select
    coalesce(sum(i.precio_unitario_bs * i.cantidad / v.tasa_venta_usada), 0) as ingreso_usd,
    coalesce(sum(i.costo_puesto_usd_snap * i.cantidad), 0)                   as costo_mercancia_usd,
    coalesce(sum(coalesce(i.costo_operativo_usd_snap, 0) * i.cantidad), 0)   as costo_gastos_usd,
    coalesce(sum(i.cantidad), 0)                                            as piezas
  from venta_items i
  join ventas v on v.id = i.venta_id and not v.anulada
),
invertido as (
  select
    coalesce((select sum(costo_mercancia_usd + flete_mercancia_usd) from lotes), 0) as mercancia,
    coalesce((select sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd)) from lotes), 0) as exhibidores,
    coalesce((select sum(monto_usd) from inversiones where activo), 0) as mobiliario
)
select
  i.mercancia                                  as invertido_mercancia_usd,
  i.exhibidores                                as invertido_exhibidores_usd,
  i.mobiliario                                 as invertido_mobiliario_usd,
  (i.exhibidores + i.mobiliario)               as invertido_activos_usd,
  (i.mercancia + i.exhibidores + i.mobiliario) as invertido_total_usd,

  d.costo_mercancia_usd                        as mercancia_recuperada_usd,
  greatest(i.mercancia - d.costo_mercancia_usd, 0) as mercancia_en_vitrina_usd,

  round(d.ingreso_usd - d.costo_mercancia_usd - d.costo_gastos_usd, 4) as ganancia_acumulada_usd,
  d.ingreso_usd                                as ingreso_acumulado_usd,
  d.piezas                                     as piezas_vendidas,

  case when (i.exhibidores + i.mobiliario) > 0
       then least(round(((d.ingreso_usd - d.costo_mercancia_usd - d.costo_gastos_usd)
                         / (i.exhibidores + i.mobiliario)) * 100, 1), 999)
       end                                     as activos_recuperado_pct,
  case when i.mercancia > 0
       then least(round((d.costo_mercancia_usd / i.mercancia) * 100, 1), 100)
       end                                     as mercancia_recuperada_pct
from invertido i
cross join vendido d
where es_admin();

grant select on v_recuperacion to authenticated;

-- ---------------------------------------------------------------------
-- 5. CUÁNTAS PIEZAS HAY QUE VENDER AL MES PARA TAPAR LOS GASTOS
-- Punto de equilibrio clásico: los gastos fijos del mes divididos entre
-- lo que deja cada pieza por encima de su costo de mercancía.
-- ---------------------------------------------------------------------

create or replace view v_equilibrio
with (security_invoker = off) as
with fijos as (
  select
    coalesce((select sum(valor) from configuracion
               where clave in ('gasto_alquiler_mes_usd', 'gasto_sueldos_mes_usd',
                               'gasto_servicios_mes_usd', 'gasto_otros_mes_usd')), 0)
    + coalesce((select sum(monto_usd / amortizar_meses) from inversiones
                 where activo and amortizar_meses is not null), 0)
    + coalesce((select sum(costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd)) from lotes), 0)
      / nullif((select valor from configuracion where clave = 'capex_amortizar_meses'), 0)
    as gastos_mes_usd
),
promedio as (
  select
    coalesce(sum(i.cantidad), 0) as piezas,
    coalesce(sum(i.precio_unitario_bs * i.cantidad / v.tasa_venta_usada)
             - sum(i.costo_puesto_usd_snap * i.cantidad), 0) as contribucion_usd
  from venta_items i
  join ventas v on v.id = i.venta_id and not v.anulada
)
select
  f.gastos_mes_usd,
  p.piezas                                                        as piezas_vendidas,
  case when p.piezas > 0 then round(p.contribucion_usd / p.piezas, 4) end as contribucion_por_pieza_usd,
  case when p.piezas > 0 and p.contribucion_usd > 0
       then ceil(f.gastos_mes_usd / (p.contribucion_usd / p.piezas))
       end                                                        as piezas_para_equilibrio
from fijos f
cross join promedio p
where es_admin();

grant select on v_equilibrio to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select * from v_recuperacion;
--   select * from v_equilibrio;
-- =====================================================================
