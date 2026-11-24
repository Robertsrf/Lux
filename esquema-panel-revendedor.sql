-- =====================================================================
-- #74 · esquema-panel-revendedor.sql
-- El panel del revendedor, y Vender fácil (fase 7, pedido del dueño del
-- 18/11/2026; decidido el 24/11/2026).
-- Depende del #73 (esquema-catalogo-revendedor.sql). Se puede correr
-- varias veces.
--
-- POR QUÉ
-- "Mejorar la forma en que tienen para vender dentro de su panel, porque
-- es muy engorroso; debe ser más fácil." Vender pedía siempre cédula,
-- nombre, apellido y teléfono de su clienta, también en persona y con la
-- pieza en la mano.
--
-- DECISIONES DEL DUEÑO (24/11/2026)
-- - Desde su panel, la cédula de su clienta NUNCA es obligatoria.
-- - Lo mínimo de una clienta nueva: nombre y teléfono. Apellido y cédula,
--   opcionales.
-- - El catálogo de su clienta (`rv_apartar`) sigue pidiendo todo: ahí la
--   cédula es la forma de reconocerla sin sesión.
--
-- QUÉ HACE
-- 1. `rv_crear_apartado` (revocada, por dentro) gana `p_cliente_id` al
--    final. Con `p_origen = 'panel'`: nombre y teléfono obligatorios;
--    reconoce a una clienta SUYA por `p_cliente_id`, por su cédula o por
--    su teléfono (los 10 últimos dígitos; la más reciente). Completa lo
--    vacío de su ficha y nunca pisa lo que ya tiene. Con `'catalogo'`,
--    como siempre (no reconoce por teléfono: sin sesión no se adivina a
--    nadie).
-- 2. `rv_vender` gana `p_cliente_id bigint default null` al final: la
--    clienta que eligió de su lista, que tiene que ser suya. Se borra la
--    firma vieja: una sola. `rv_apartar` no cambia (llama a la nueva con
--    `p_cliente_id` por defecto).
-- 3. `cliente_de_revendedor` (al aprobar, al maestro de la tienda): sin
--    cédula, si la misma clienta suya ya entró al maestro con otro pedido
--    aprobado, usa esa ficha en vez de crear otra. No busca por teléfono
--    en el maestro: podría juntar a dos personas.
-- 4. `rv_resumen` gana al final `tema` (el de su catálogo: su panel se
--    viste con él) y `vence_lux_en` (el plazo más próximo de lo que le
--    debe a Lux; null si no debe nada). Lo demás, igual.
--
-- DEBERÍA DAR
--   select count(*) from pg_proc where proname = 'rv_vender';          -- 1
--   select count(*) from pg_proc where proname = 'rv_crear_apartado';  -- 1
--   select rv_resumen('x') ...  -- error 28000, como siempre
-- Probado en PGlite con la instalación entera (ver INSTALACION.md, #74).
-- =====================================================================

drop function if exists rv_vender(text, jsonb, text, text, text, text, jsonb);
drop function if exists rv_crear_apartado(bigint, jsonb, text, text, text, text, text);

-- 1. rv_crear_apartado: la del #72, con la clienta del panel.
create or replace function rv_crear_apartado(
  p_revendedor_id bigint,
  p_items         jsonb,
  p_cedula        text,
  p_nombre        text,
  p_apellido      text,
  p_telefono      text,
  p_origen        text,
  p_cliente_id    bigint default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r           revendedores%rowtype;
  v_cli       revendedor_clientes%rowtype;
  v_ced       text := nullif(btrim(coalesce(p_cedula, '')), '');
  v_nom       text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_ape       text := nullif(btrim(coalesce(p_apellido, '')), '');
  v_tel       text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_desc      numeric;
  v_horas     numeric;
  v_linea     record;
  v_lista     numeric;
  v_lux       numeric;
  v_precio    numeric;
  v_nombre    text;
  v_hay       int;
  v_lineas    jsonb := '[]'::jsonb;
  v_nuevo     numeric := 0;
  v_tope      record;
  v_id        bigint;
  -- #72: lo suyo libre, por pieza, y cuánto sale de lo suyo y de la tienda.
  v_suyas     jsonb;
  v_activo    boolean;
  v_suyo      int;
  v_tienda    int;
  -- #74: la clienta del panel, por sus dígitos.
  v_panel     boolean := p_origen = 'panel';
  v_dig_ced   text;
  v_dig_tel   text;
begin
  -- La fila del revendedor, bloqueada: el tope y lo suyo, de a un pedido.
  select * into r from revendedores where id = p_revendedor_id for update;
  if not found or not r.activo then
    raise exception 'Este catálogo no está disponible.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No elegiste ninguna pieza.';
  end if;
  -- #72: el tope primero, antes de leer cada línea.
  if jsonb_array_length(p_items) > 300 then
    raise exception 'Son demasiadas piezas en un pedido.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x
              where coalesce((x->>'cantidad')::int, 0) <= 0) then
    raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
  end if;

  -- #74: desde su panel la cédula es opcional; desde el catálogo, no.
  if v_ced is null and not v_panel then raise exception 'Falta la cédula.'; end if;
  v_dig_ced := nullif(regexp_replace(coalesce(v_ced, ''), '[^0-9]', '', 'g'), '');
  if v_ced is not null and length(coalesce(v_dig_ced, '')) < 6 then
    raise exception 'Esa cédula está incompleta.';
  end if;
  v_dig_tel := right(regexp_replace(coalesce(v_tel, ''), '[^0-9]', '', 'g'), 10);

  -- Quién es: la que eligió de su lista (solo desde el panel y solo suya),
  -- la de esa cédula o, desde el panel y sin cédula, la de ese teléfono.
  if p_cliente_id is not null then
    if not v_panel then raise exception 'No encuentro esa clienta.'; end if;
    select * into v_cli
      from revendedor_clientes
     where id = p_cliente_id and revendedor_id = r.id;
    if not found then raise exception 'No encuentro esa clienta.'; end if;
  elsif v_dig_ced is not null then
    select * into v_cli
      from revendedor_clientes
     where revendedor_id = r.id
       and cedula_digitos = v_dig_ced;
  elsif v_panel and length(v_dig_tel) = 10 then
    select * into v_cli
      from revendedor_clientes
     where revendedor_id = r.id
       and right(regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g'), 10) = v_dig_tel
     order by id desc
     limit 1;
  end if;

  if v_cli.id is not null then
    v_nom := coalesce(nullif(btrim(v_cli.nombre), ''), v_nom);
    v_ape := coalesce(v_ape, nullif(btrim(coalesce(v_cli.apellido, '')), ''));
    if v_tel is null and length(regexp_replace(coalesce(v_cli.telefono, ''), '[^0-9]', '', 'g')) >= 10 then
      v_tel := btrim(v_cli.telefono);
    end if;
  end if;

  if v_nom is null then raise exception 'Falta el nombre.'; end if;
  if v_ape is null and not v_panel then raise exception 'Falta el apellido.'; end if;
  if v_tel is null then raise exception 'Falta el número de teléfono.'; end if;
  if length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 10 then
    raise exception 'Ese teléfono está incompleto. Escríbelo con el código, por ejemplo 0412 1234567.';
  end if;

  if v_cli.id is null then
    insert into revendedor_clientes (revendedor_id, nombre, apellido, cedula, telefono)
    values (r.id, v_nom, v_ape, v_ced, v_tel)
    returning * into v_cli;
  else
    update revendedor_clientes
       set apellido = coalesce(nullif(btrim(coalesce(apellido, '')), ''), v_ape),
           telefono = case when length(regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g')) >= 10
                           then telefono else v_tel end,
           -- #74: la cédula, solo si no tenía y no es de otra suya.
           cedula   = case when cedula_digitos is null and v_dig_ced is not null
                            and not exists (select 1 from revendedor_clientes o
                                             where o.revendedor_id = r.id and o.cedula_digitos = v_dig_ced
                                               and o.id <> v_cli.id)
                           then v_ced else cedula end
     where id = v_cli.id;
  end if;

  v_horas := config_requerida('revendedor_horas_pago');
  v_desc  := rv_descuento_de(r.id);

  for v_linea in
    select (x->>'modelo_id')::bigint as modelo_id
      from jsonb_array_elements(p_items) x
     group by 1
     order by 1
  loop
    perform pg_advisory_xact_lock(v_linea.modelo_id);
    perform 1 from existencias where modelo_id = v_linea.modelo_id for update;
  end loop;

  -- #72: lo suyo libre, una vez (con su fila bloqueada, nadie más lo toma).
  -- Las que tiene (aunque estén apartadas): de esas se dice cuántas quedan.
  select coalesce(jsonb_object_agg(i.modelo_id::text, greatest(i.libre, 0)), '{}'::jsonb)
    into v_suyas
    from rv_inventario(r.id) i
   where i.tiene > 0;

  for v_linea in
    select (x->>'modelo_id')::bigint as modelo_id, sum((x->>'cantidad')::int)::int as cantidad
      from jsonb_array_elements(p_items) x
     group by 1
     order by 1
  loop
    select m.nombre || coalesce(' · ' || m.variante, ''), coalesce(m.precio_override_usd, g.precio_usd), m.activo
      into v_nombre, v_lista, v_activo
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_linea.modelo_id;
    if not found or v_lista is null then
      raise exception 'Una de las piezas que elegiste ya no está disponible.';
    end if;

    -- #72: primero de lo suyo, que ya pagó; lo que falte, de la tienda.
    v_suyo   := least(coalesce((v_suyas->>v_linea.modelo_id::text)::int, 0), v_linea.cantidad);
    v_tienda := v_linea.cantidad - v_suyo;

    if v_tienda > 0 then
      v_lux := case when v_activo then rv_precio_lux(v_linea.modelo_id, v_desc) end;
      -- De la tienda solo lo que está en su catálogo (que el piso deje rebaja).
      if v_lux is null or v_lux >= v_lista then
        if not v_suyas ? v_linea.modelo_id::text then
          raise exception '"%" no está en este catálogo.', v_nombre;
        end if;
        raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, v_suyo, v_linea.cantidad;
      end if;

      select coalesce(sum(e.cantidad), 0) - apartadas_de(v_linea.modelo_id)
        into v_hay
        from existencias e
       where e.modelo_id = v_linea.modelo_id;
      if v_tienda > v_hay then
        raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, v_suyo + greatest(v_hay, 0), v_linea.cantidad;
      end if;
    end if;

    select rv_precio_clienta(rp.precio_usd, v_lista)
      into v_precio
      from (select 1) uno
      left join revendedor_precios rp on rp.revendedor_id = r.id and rp.modelo_id = v_linea.modelo_id;

    if v_suyo > 0 then
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
        'modelo_id', v_linea.modelo_id, 'cantidad', v_suyo,
        'lista', v_lista, 'lux', 0, 'precio', v_precio, 'suyo', true));
    end if;
    if v_tienda > 0 then
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
        'modelo_id', v_linea.modelo_id, 'cantidad', v_tienda,
        'lista', v_lista, 'lux', v_lux, 'precio', v_precio, 'suyo', false));
      v_nuevo := v_nuevo + v_lux * v_tienda;
    end if;
  end loop;

  select * into v_tope from rv_tope(r.id);
  if v_tope.usado_usd + v_nuevo > v_tope.tope_usd + 0.005 then
    raise exception 'Por ahora no se pueden apartar más piezas en este catálogo. Escríbele a % para apartarlas.',
      split_part(btrim(r.nombre), ' ', 1);
  end if;

  insert into apartados (revendedor_id, cliente_id, expira_en, plazo_pago_en, origen)
  values (r.id, v_cli.id, now() + make_interval(hours => v_horas::int),
          now() + make_interval(hours => v_horas::int), p_origen)
  returning id into v_id;

  insert into apartado_items (apartado_id, modelo_id, cantidad, precio_lista_usd, precio_lux_usd, precio_clienta_usd,
                              de_su_inventario)
  select v_id, l.modelo_id, l.cantidad, l.lista, l.lux, l.precio, l.suyo
    from jsonb_to_recordset(v_lineas)
      as l(modelo_id bigint, cantidad int, lista numeric, lux numeric, precio numeric, suyo boolean);

  return v_id;
end;
$fn$;

revoke all on function rv_crear_apartado(bigint, jsonb, text, text, text, text, text, bigint) from public, anon, authenticated;

-- 2. rv_vender: la de esquema-revendedores-plazos.sql, con la clienta que
-- eligió de su lista al final. Si ya le pagó, lo anota y lo confirma en el
-- mismo paso; si no, espera las horas de siempre y él le manda el enlace.
create or replace function rv_vender(
  p_sesion     text,
  p_items      jsonb,
  p_cedula     text,
  p_nombre     text   default null,
  p_apellido   text   default null,
  p_telefono   text   default null,
  p_pago       jsonb  default null,
  p_cliente_id bigint default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id  bigint := rv_de_sesion(p_sesion);
  v_ap  bigint;
begin
  v_ap := rv_crear_apartado(v_id, p_items, p_cedula, p_nombre, p_apellido, p_telefono, 'panel', p_cliente_id);

  if p_pago is not null and jsonb_typeof(p_pago) = 'object' then
    perform rv_anotar_de_clienta(v_ap, 'revendedor', p_pago->>'metodo',
                                 nullif(p_pago->>'monto', '')::numeric, p_pago->>'referencia', true);
    perform rv_confirmar_de(v_id, v_ap);
  end if;

  return jsonb_build_object('id', v_ap,
                            'token', (select token from apartados where id = v_ap),
                            'fase', rv_fase_de(v_ap));
end;
$fn$;

revoke all on function rv_vender(text, jsonb, text, text, text, text, jsonb, bigint) from public;
grant execute on function rv_vender(text, jsonb, text, text, text, text, jsonb, bigint) to anon, authenticated;

-- 3. cliente_de_revendedor: la de esquema-revendedores-plazos.sql. Sin
-- cédula, la ficha que la misma clienta suya ya tiene en el maestro por
-- otro pedido aprobado; si no tiene, una nueva.
create or replace function cliente_de_revendedor(p_apartado_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a     apartados%rowtype;
  c     revendedor_clientes%rowtype;
  v_id  bigint;
begin
  select * into a from apartados where id = p_apartado_id;
  if a.cliente_maestro_id is not null then
    return a.cliente_maestro_id;
  end if;
  select * into c from revendedor_clientes where id = a.cliente_id;

  if c.cedula_digitos is not null then
    select id into v_id from clientes where cedula_digitos = c.cedula_digitos;
    if found then
      return v_id;
    end if;
  else
    select o.cliente_maestro_id into v_id
      from apartados o
     where o.cliente_id = c.id and o.id <> a.id and o.cliente_maestro_id is not null
     order by o.id desc
     limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into clientes (cedula, nombre, apellido, telefono, creado_por, revendedor_id)
  values (c.cedula, c.nombre, c.apellido, c.telefono, auth.uid(), a.revendedor_id)
  returning id into v_id;
  return v_id;
end;
$fn$;

revoke all on function cliente_de_revendedor(bigint) from public, anon, authenticated;

-- 4. rv_resumen: la del #72, con tema y vence_lux_en al final.
create or replace function rv_resumen(p_sesion text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id    bigint := rv_de_sesion(p_sesion);
  r       revendedores%rowtype;
  v_tope  record;
  v_mes   jsonb;
  v_meses jsonb;
  v_cred  numeric;
  v_fases jsonb;
  v_vent  numeric;
  v_venc  int;
begin
  select * into r from revendedores where id = v_id;
  select * into v_tope from rv_tope(v_id);
  select valor into v_vent from configuracion where clave = 'revendedor_dias_ventana';

  select jsonb_build_object(
           'piezas',    coalesce(sum(i.cantidad), 0),
           'vendido_usd', coalesce(sum(i.precio_clienta_usd * i.cantidad), 0),
           'pagado_usd',  coalesce(sum(i.precio_lux_usd * i.cantidad), 0),
           -- #72: lo suyo no: no se sabe lo que pagó por cada unidad.
           'ganancia_usd', coalesce(sum((i.precio_clienta_usd - i.precio_lux_usd) * i.cantidad)
                                      filter (where not i.de_su_inventario), 0))
    into v_mes
    from apartados a
    join apartado_items i on i.apartado_id = a.id
   where a.revendedor_id = v_id and a.estado = 'retirado'
     and a.retirado_en >= date_trunc('month', now());

  select jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'piezas', coalesce(x.piezas, 0),
           'vendido_usd', coalesce(x.vendido, 0),
           'ganancia_usd', coalesce(x.ganancia, 0)) order by m.mes)
    into v_meses
    from generate_series(date_trunc('month', now()) - interval '5 months',
                         date_trunc('month', now()), interval '1 month') m(mes)
    left join (
      select date_trunc('month', a.retirado_en) as mes,
             sum(i.cantidad) as piezas,
             sum(i.precio_clienta_usd * i.cantidad) as vendido,
             sum((i.precio_clienta_usd - i.precio_lux_usd) * i.cantidad)
               filter (where not i.de_su_inventario) as ganancia
        from apartados a
        join apartado_items i on i.apartado_id = a.id
       where a.revendedor_id = v_id and a.estado = 'retirado'
         and a.retirado_en >= date_trunc('month', now()) - interval '5 months'
       group by 1
    ) x on x.mes = m.mes;

  -- Lo que sus clientas le deben: pedidos confirmados vigentes y vendidos.
  select coalesce(sum(rv_falta_de(a.id)), 0)
    into v_cred
    from apartados a
   where a.revendedor_id = v_id
     and (a.estado = 'retirado'
          or (a.estado = 'abierto' and a.confirmado_en is not null and a.expira_en > now()));

  select jsonb_object_agg(f.fase, f.n)
    into v_fases
    from (select rv_fase_de(a.id) as fase, count(*)::int as n
            from apartados a
           where a.revendedor_id = v_id
             and (a.estado = 'abierto' or (a.estado = 'retirado' and a.entregado_en is null))
           group by 1) f;

  select count(*)::int into v_venc
    from apartados a
   where a.revendedor_id = v_id and a.estado = 'abierto' and a.confirmado_en is not null
     and a.expira_en <= now()
     and a.expira_en > now() - make_interval(days => greatest(coalesce(v_vent, 0), 0)::int);

  return jsonb_build_object(
    'usuario',          r.usuario,
    'nombre',           r.nombre,
    'catalogo_nombre',  coalesce(r.catalogo_nombre, r.nombre),
    'catalogo_propio',  r.catalogo_nombre,
    'telefono',         r.telefono,
    'paleta',           r.paleta,
    'logo_path',        r.logo_path,
    'descuento_pct',    rv_descuento_de(v_id),
    'sobre_etiqueta_usd', coalesce((select valor from configuracion where clave = 'revendedor_sobre_etiqueta_usd'), 0),
    'dias_apartado',    0,
    'vencidos_para_bajar', coalesce((select valor from configuracion where clave = 'revendedor_vencidos_para_bajar'), 0),
    'dias_ventana',     coalesce(v_vent, 0),
    'tope',             to_jsonb(v_tope),
    'mes',              v_mes,
    'meses',            v_meses,
    'credito_usd',      round(v_cred, 2),
    'abiertos',         (select count(*)::int from apartados a
                          where a.revendedor_id = v_id and a.estado = 'abierto' and a.expira_en > now()),
    'por_vencer',       coalesce((v_fases->>'por_pagar_lux')::int, 0),
    'vencidos',         v_venc,
    -- Nuevas.
    'fases',            coalesce(v_fases, '{}'::jsonb),
    'horas_pago',       (select valor from configuracion where clave = 'revendedor_horas_pago'),
    'horas_para_pagar', (select valor from configuracion where clave = 'revendedor_horas_para_pagar'),
    'inicial_pct',      (select valor from configuracion where clave = 'apartado_inicial_pct'),
    'dias_credito',     r.dias_credito,
    'pago_movil_cedula',   r.pago_movil_cedula,
    'pago_movil_telefono', r.pago_movil_telefono,
    'pago_movil_banco',    r.pago_movil_banco,
    -- #74: su panel se viste con el tema de su catálogo, y dice cuándo
    -- vence lo primero que le debe a Lux.
    'tema',             r.tema,
    'vence_lux_en',     (select min(a.plazo_lux_en)
                           from apartados a
                          where a.revendedor_id = v_id and a.estado = 'abierto'
                            and rv_fase_de(a.id) = 'por_pagar_lux'));
end;
$fn$;

revoke all on function rv_resumen(text) from public;
grant execute on function rv_resumen(text) to anon, authenticated;

