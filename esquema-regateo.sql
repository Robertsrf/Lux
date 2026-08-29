-- =====================================================================
-- Lux by Emory — margen de regateo para el mostrador
-- Ejecutar en el SQL Editor DESPUES de esquema-descuentos.sql
--
-- QUE RESUELVE
-- Hoy la vendedora o cobra el precio exacto o pierde el trato. Con esto
-- puede bajar el precio para cerrar una venta, pero solo hasta un piso
-- que fija el dueno, y registra en cuanto la vendio de verdad.
--
-- LO QUE ELLA VE: un precio minimo. "Puedes bajar hasta Bs 3.200."
-- LO QUE ELLA NO VE: el costo, el margen, ni de donde sale ese piso.
-- Esa sigue siendo la regla dura del PLAN y no se toca.
--
-- EL PISO SALE DE DOS TOPES, Y MANDA EL MAS RESTRICTIVO
--   1. descuento_max_mostrador_pct: cuanto puede rebajar como maximo.
--   2. margen_minimo_pct: el margen por debajo del cual no se baja NUNCA,
--      aunque el descuento del punto 1 lo permitiera.
--
-- El segundo tope es el que de verdad protege. Un descuento plano no
-- conoce el costo: sobre una pieza de margen fino, un 15 % la puede dejar
-- por debajo de lo que costo. Con el tope de margen, eso no pasa.
--
-- Si el margen minimo ya no cabe en el precio de lista, la pieza
-- simplemente no admite rebaja: el piso queda en su propio precio.
-- =====================================================================

insert into configuracion (clave, valor, descripcion) values
  ('descuento_max_mostrador_pct', 10, 'Cuanto puede rebajar la vendedora en el mostrador, como maximo'),
  ('margen_minimo_pct',           25, 'Margen real por debajo del cual no se puede bajar el precio')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 1. EL PISO DE CADA PIEZA
-- Lee costos, asi que es SECURITY DEFINER y NO se otorga a nadie: se usa
-- por dentro de la vista y de registrar_venta. Lo unico que sale al
-- mundo es el numero final.
-- ---------------------------------------------------------------------

create or replace function precio_minimo_de(p_modelo_id bigint)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_precio     numeric(12,4);
  v_costo      numeric(12,4);
  v_tasa       tasas%rowtype;
  v_desc_max   numeric(12,4);
  v_margen_min numeric(12,4);
  v_piso_desc  numeric(12,4);
  v_piso_marg  numeric(12,4);
begin
  select coalesce(m.precio_override_usd, g.precio_usd), m.costo_puesto_usd
    into v_precio, v_costo
    from modelos m
    left join grupos_precio g on g.id = m.grupo_precio_id
   where m.id = p_modelo_id and m.activo;

  if v_precio is null then
    return null;
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    return v_precio;
  end if;

  select valor into v_desc_max   from configuracion where clave = 'descuento_max_mostrador_pct';
  select valor into v_margen_min from configuracion where clave = 'margen_minimo_pct';
  v_desc_max   := least(coalesce(v_desc_max, 0), 99);
  v_margen_min := least(coalesce(v_margen_min, 0), 99);

  -- Tope 1: hasta donde deja bajar el descuento maximo.
  v_piso_desc := v_precio * (1 - v_desc_max / 100);

  -- Tope 2: el precio en BCV que todavia deja el margen minimo.
  -- El costo esta en dolares reales; se lleva a BCV con la brecha.
  v_piso_marg := (coalesce(v_costo, 0) * (v_tasa.tasa_venta / v_tasa.tasa_bcv))
                 / (1 - v_margen_min / 100);

  -- Manda el mas restrictivo, y nunca por encima del precio de lista.
  return round(least(v_precio, greatest(v_piso_desc, v_piso_marg)), 2);
end;
$$;

revoke all on function precio_minimo_de(bigint) from public, anon;
-- Se otorga a authenticated porque la vista la llama: Postgres comprueba el
-- permiso de EJECUTAR contra quien llama, no contra el dueno de la vista.
-- Es seguro: devuelve el piso, no el costo.
grant execute on function precio_minimo_de(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 2. EL PISO LLEGA AL MOSTRADOR, EL COSTO NO
-- Se anaden dos columnas al final de las vistas de venta. El catalogo
-- publico NO las lleva: el piso es informacion de mostrador.
-- ---------------------------------------------------------------------

create or replace view v_catalogo_venta
with (security_invoker = off) as
select
  m.id, m.sku, m.nombre, m.categoria, m.descripcion, m.variantes_nota,
  m.foto_path, m.foto_thumb_path,
  g.nombre as grupo,
  coalesce(m.precio_override_usd, g.precio_usd) as precio_usd,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_bcv, 2) as precio_bs,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_bcv / t.tasa_venta, 4) as precio_usd_real,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = m.id), 0) as existencia_total,
  m.activo,
  precio_minimo_de(m.id) as precio_minimo_usd,
  round(precio_minimo_de(m.id) * t.tasa_bcv, 2) as precio_minimo_bs
from modelos m
left join grupos_precio g on g.id = m.grupo_precio_id
left join lateral (select * from tasas where vigente limit 1) t on true
where m.activo;

create or replace view v_venta_ubicacion
with (security_invoker = off) as
select
  e.ubicacion_id, c.id as modelo_id, c.sku, c.nombre, c.categoria,
  c.variantes_nota, c.foto_thumb_path, c.foto_path, c.grupo,
  c.precio_usd, c.precio_bs, e.cantidad,
  c.precio_minimo_usd, c.precio_minimo_bs
from existencias e
join v_catalogo_venta c on c.id = e.modelo_id;

grant select on v_catalogo_venta  to authenticated;
grant select on v_venta_ubicacion to authenticated;

-- ---------------------------------------------------------------------
-- 3. LA LINEA GUARDA EL PRECIO DE LISTA
-- Asi "cuanto rebajo" queda como hecho permanente, sin depender de que el
-- grupo siga costando lo mismo dentro de seis meses.
-- ---------------------------------------------------------------------

alter table venta_items add column if not exists precio_lista_usd numeric(12,4);

-- ---------------------------------------------------------------------
-- 4. COBRAR PUDIENDO REGATEAR
-- Cada item admite un precio_unitario_usd opcional. La base valida que
-- este entre el piso y el precio de lista: el navegador no decide nada.
-- En una venta de kit se ignora, porque el kit ya trae su propio trato.
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
      -- El kit trae su propio trato: no se regatea encima.
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
                             precio_lista_usd, costo_puesto_usd_snap)
    values (v_venta_id, v_modelo_id, v_ubicacion_id, v_cantidad,
            v_precio_usd, v_precio_bs, v_precio_lista, v_costo);

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
-- 5. QUE SE VEA QUIEN REBAJO Y CUANTO
-- La vendedora ve su propia linea con el precio de lista al lado, para
-- saber que rebajo. El dueno ve el reporte completo.
-- ---------------------------------------------------------------------

create or replace view v_venta_items_venta
with (security_invoker = off) as
select
  i.id, i.venta_id, i.modelo_id, i.ubicacion_id, i.cantidad,
  i.precio_unitario_usd, i.precio_unitario_bs,
  i.precio_lista_usd
from venta_items i
join ventas v on v.id = i.venta_id
where es_admin()
   or (v.usuario_id = auth.uid() and v.fecha::date = current_date);

grant select on v_venta_items_venta to authenticated;

create or replace view v_descuentos_mostrador
with (security_invoker = off) as
select
  v.id            as venta_id,
  v.fecha,
  p.nombre        as vendedora,
  m.sku,
  m.nombre        as pieza,
  i.cantidad,
  i.precio_lista_usd,
  i.precio_unitario_usd,
  round((i.precio_lista_usd - i.precio_unitario_usd) * i.cantidad, 4) as rebaja_usd,
  case when i.precio_lista_usd > 0
       then round((1 - i.precio_unitario_usd / i.precio_lista_usd) * 100, 2)
       end as rebaja_pct,
  round((i.precio_unitario_usd * i.cantidad * v.tasa_bcv_usada / v.tasa_venta_usada)
        - (i.costo_puesto_usd_snap * i.cantidad), 4) as ganancia_usd
from venta_items i
join ventas v   on v.id = i.venta_id and not v.anulada
join perfiles p on p.id = v.usuario_id
join modelos m  on m.id = i.modelo_id
where es_admin()
  and i.precio_lista_usd is not null
  and i.precio_unitario_usd < i.precio_lista_usd;

grant select on v_descuentos_mostrador to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- 6. COMPROBACION
--
-- Con sesion de VENDEDORA:
--   select nombre, precio_bs, precio_minimo_bs from v_venta_ubicacion;
--     -> ve el piso, y ninguna columna de costo ni de margen
--
--   select registrar_venta('detal','efectivo_bs',
--     '[{"modelo_id":1,"ubicacion_id":1,"cantidad":1,
--        "precio_unitario_usd":0.01}]'::jsonb);
--     -> debe FALLAR diciendo el minimo en bolivares
--
-- Con sesion de ADMIN:
--   select * from v_descuentos_mostrador;
--     -> quien rebajo, cuanto, y que ganancia quedo igual
-- =====================================================================

-- ---------------------------------------------------------------------
-- 7. TEXTOS DE MARCA
-- Lo que hace especial a Lux no es un dato por pieza: es lo mismo para
-- toda la linea. Va aqui, editable por el dueno, y no quemado en el
-- codigo ni tecleado 150 veces.
--
-- `configuracion` solo guarda numeros, por eso hace falta esta tabla.
-- ---------------------------------------------------------------------

create table if not exists textos (
  clave          text primary key,
  valor          text not null default '',
  descripcion    text,
  actualizado_en timestamptz not null default now()
);

alter table textos enable row level security;

drop policy if exists textos_leer  on textos;
drop policy if exists textos_admin on textos;

create policy textos_leer  on textos for select to anon, authenticated using (true);
create policy textos_admin on textos for all to authenticated
  using (es_admin()) with check (es_admin());

grant select on textos to anon, authenticated;

insert into textos (clave, valor, descripcion) values
  ('materiales_largo',
   'Acero inoxidable 316L con titanio, bañado en oro PVD de 18 quilates. Hipoalergénico: no mancha la piel ni se pone verde.',
   'La explicación completa. Va en la cabecera del catálogo y en el visor de cada pieza.'),
  ('materiales_corto',
   'Acero 316L · Oro PVD 18K · Hipoalergénico',
   'La versión corta, para la ficha de cada pieza.'),
  ('catalogo_intro',
   '',
   'Texto de la portada del catálogo impreso. Lo escribe el dueño.'),
  ('catalogo_pie',
   'Lux by Emory · Desde Sabana de Mendoza para toda Venezuela',
   'Pie de página del catálogo impreso.')
on conflict (clave) do nothing;

notify pgrst, 'reload schema';
