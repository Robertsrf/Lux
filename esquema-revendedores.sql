-- =====================================================================
-- Lux by Emory — revendedores: su catálogo, sus apartados y su panel
-- Ejecutar en el SQL Editor DESPUÉS de esquema-abonos.sql
--
-- QUÉ ES
-- Personas de confianza, elegidas por el dueño una por una, que venden
-- las joyas de Lux a su propia clientela. Cada una tiene:
--
--   - su catálogo, un enlace que comparte: /#/r/<usuario>, con su nombre
--     y su paleta de colores, "joyas Lux by Emory" debajo;
--   - su panel: en cuánto le sale cada pieza, qué precio le pone, sus
--     apartados, sus clientas, lo que cada una le debe y lo que va ganando.
--
-- EL NEGOCIO, COMO LO DECIDIÓ EL DUEÑO (27/09/2026)
--
--   - Al revendedor la pieza le sale 25 % por debajo de la etiqueta
--     (`revendedor_descuento_pct`). Nunca por debajo del piso de margen,
--     el mismo que frena los tramos (`piso_margen_de`): ese piso ya trae
--     la mercancía a la brecha de hoy, el flete, la merma, el empaque y la
--     parte del mes de alquiler y sueldos, más el margen mínimo. Por eso
--     "pagando todo" no es una promesa, es la fórmula.
--   - Él le pone precio a cada pieza, y ese precio nunca baja de la
--     etiqueta de Lux más diez centavos (`revendedor_sobre_etiqueta_usd`).
--     El revendedor no le hace la competencia a la tienda con su propia
--     mercancía.
--   - Su clienta aparta desde el enlace. La pieza sale de lo libre de la
--     tienda (el mostrador ya no la ve) hasta 15 días
--     (`revendedor_dias_apartado`). Si en ese plazo él no la retira
--     pagándola, vuelve sola a la tienda.
--   - Dos deudas separadas. Lo que la clienta le debe al revendedor lo
--     lleva él en su panel, abono por abono. Lo que él le debe a Lux se
--     paga al retirar, en la tienda, y la pieza la entrega él en persona.
--
-- EL TOPE: CUÁNTO PUEDE TENER APARTADO A LA VEZ
-- El dueño fijó $200 como techo para no quedarse sin inventario ni sin
-- caja, y dejó a criterio cómo se llega ahí. Se llega por niveles, con
-- lo apartado contado a lo que el revendedor le paga a Lux:
--
--   nivel 1   $100   todo revendedor empieza aquí
--   nivel 2   $150   cuando ya retiró y pagó $200  (dos veces su tope)
--   nivel 3   $200   cuando ya retiró y pagó $500  (200 + dos veces 150)
--
-- "Sube cuando ha hecho girar dos veces su tope": quien paga lo que
-- aparta demuestra que el apartado no es inventario parado. Y baja un
-- nivel mientras tenga dos apartados vencidos en los últimos 30 días; se
-- recupera solo cuando esos salen de la ventana. El dueño puede fijarle a
-- alguien un tope a mano (`revendedores.tope_manual_usd`).
-- Todo son claves de `configuracion` y se cambian en la pantalla de
-- Revendedores.
--
-- POR QUÉ EL REVENDEDOR NO TIENE SESIÓN DE SUPABASE
-- Toda la base da por hecho que quien tiene sesión es personal de la
-- tienda: `existencias` acepta cambios de cualquier sesión, `clientes` se
-- lee entera, `fijar_tasa` la ejecuta cualquiera. Con la vendedora vale,
-- porque es de confianza. A un revendedor con sesión le habría dado todo
-- eso desde la consola del navegador.
--
-- Cerrar cada una de esas puertas habría sido reescribir unas cincuenta
-- funciones y treinta y cinco vistas que la tienda usa todos los días.
-- En cambio, para la base el revendedor es alguien SIN sesión, como una
-- clienta del catálogo, con la llave de su propio cajón: entra con un
-- código, recibe un testigo, y cada función `rv_*` mira ese testigo y
-- solo le devuelve lo suyo. Todo lo que `npm run verificar` ya comprueba
-- de quien no tiene sesión le aplica a él sin tocar nada.
--
-- El código son doce caracteres al azar de un alfabeto sin letras que se
-- confundan (59 bits): no se adivina probando. Se guarda su huella
-- (sha256), nunca el código. El testigo de la sesión, igual.
--
-- LO QUE CAMBIA EN LO QUE YA HABÍA
--   - `apartadas_de` cuenta también lo apartado por revendedores: el
--     mostrador, el catálogo público y los pedidos dejan de verlo.
--   - `ventas.revendedor_id` y `motivo_rebaja = 'revendedor'`: la venta
--     al revendedor queda en la caja como cualquier otra, y en Reportes se
--     ve cuánto se le rebajó.
--
-- Firmas de lo que ya existía: las mismas.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LAS CIFRAS DEL NEGOCIO
-- Las tres primeras las dijo el dueño; las del tope, ver la cabecera.
-- `on conflict do nothing`: correr el archivo otra vez no pisa lo que él
-- haya cambiado desde la pantalla.
-- ---------------------------------------------------------------------

insert into configuracion (clave, valor, descripcion) values
  ('revendedor_descuento_pct',       25,   'Cuánto por debajo de la etiqueta le sale la pieza al revendedor, en %'),
  ('revendedor_sobre_etiqueta_usd',  0.10, 'Lo mínimo que el precio del revendedor pasa de la etiqueta de la tienda, en $ BCV'),
  ('revendedor_dias_apartado',       15,   'Días que dura un apartado de revendedor antes de volver a la tienda'),
  ('revendedor_tope_inicial_usd',    100,  'Tope de apartado con el que empieza un revendedor, en $ BCV a su precio'),
  ('revendedor_tope_paso_usd',       50,   'Cuánto sube el tope en cada nivel, en $ BCV'),
  ('revendedor_tope_maximo_usd',     200,  'Tope más alto al que se llega por niveles, en $ BCV'),
  ('revendedor_vueltas_para_subir',  2,    'Cuántas veces su tope tiene que haber retirado y pagado para subir de nivel'),
  ('revendedor_vencidos_para_bajar', 2,    'Apartados vencidos en la ventana que lo bajan un nivel'),
  ('revendedor_dias_ventana',        30,   'Días hacia atrás en que se cuentan los apartados vencidos')
on conflict (clave) do nothing;


-- ---------------------------------------------------------------------
-- 2. ¿QUIEN LLAMA ES DE LA TIENDA?
-- La vendedora o un administrador con perfil activo. Es lo que ya
-- escribían a mano `registrar_venta`, `cobrar_pedido` y compañía.
-- ---------------------------------------------------------------------

create or replace function es_personal()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from perfiles where id = auth.uid() and activo);
$fn$;

revoke all on function es_personal() from public, anon;
grant execute on function es_personal() to authenticated;


-- ---------------------------------------------------------------------
-- 3. LAS TABLAS
-- Ninguna se lee ni se escribe en crudo: todo pasa por las funciones de
-- abajo, que miran quién llama.
-- ---------------------------------------------------------------------

create table if not exists revendedores (
  id              bigserial primary key,
  nombre          text not null check (length(btrim(nombre)) between 2 and 80),
  -- Va en el enlace: /#/r/<usuario>.
  usuario         text not null unique check (usuario ~ '^[a-z0-9][a-z0-9-]{2,29}$'),
  telefono        text,
  cedula          text,
  catalogo_nombre text check (catalogo_nombre is null or length(btrim(catalogo_nombre)) between 2 and 60),
  -- La misma lista que PALETAS en src/lib/revendedor.ts: si cambia una,
  -- cambia la otra. Cada paleta está medida a 4,5:1.
  paleta          text not null default 'lux'
                  check (paleta in ('lux', 'noche', 'vino', 'grafito', 'ciruela', 'oliva')),
  logo_path       text,
  -- Null: el general de `configuracion`.
  descuento_pct   numeric(5,2) check (descuento_pct is null or (descuento_pct > 0 and descuento_pct < 100)),
  -- Null: el de su nivel.
  tope_manual_usd numeric(12,2) check (tope_manual_usd is null or tope_manual_usd >= 0),
  -- La huella del código de entrada. El código no se guarda.
  clave_hash      text not null unique,
  activo          boolean not null default true,
  notas           text,
  creado_en       timestamptz not null default now(),
  creado_por      uuid references perfiles(id)
);

create table if not exists revendedor_sesiones (
  token_hash    text primary key,
  revendedor_id bigint not null references revendedores(id),
  creada_en     timestamptz not null default now(),
  usada_en      timestamptz not null default now(),
  expira_en     timestamptz not null
);

create index if not exists revendedor_sesiones_rv_idx on revendedor_sesiones (revendedor_id);

-- El precio que él le pone a cada pieza. Sin fila, la pieza sale a su
-- mínimo: la etiqueta más diez centavos.
create table if not exists revendedor_precios (
  revendedor_id  bigint not null references revendedores(id),
  modelo_id      bigint not null references modelos(id) on delete cascade,
  precio_usd     numeric(12,2) not null check (precio_usd > 0),
  actualizado_en timestamptz not null default now(),
  primary key (revendedor_id, modelo_id)
);

create index if not exists revendedor_precios_modelo_idx on revendedor_precios (modelo_id);

-- Sus clientas. No son las de la tienda: la tienda no las ve en su
-- maestro, y una misma persona puede ser clienta de dos revendedores.
create table if not exists revendedor_clientes (
  id             bigserial primary key,
  revendedor_id  bigint not null references revendedores(id),
  nombre         text not null,
  apellido       text,
  cedula         text,
  cedula_digitos text generated always as
                 (nullif(regexp_replace(coalesce(cedula, ''), '[^0-9]', '', 'g'), '')) stored,
  telefono       text,
  notas          text,
  creado_en      timestamptz not null default now()
);

create unique index if not exists revendedor_clientes_cedula_idx
  on revendedor_clientes (revendedor_id, cedula_digitos) where cedula_digitos is not null;

-- "Vencido" no se guarda: es un apartado abierto cuyo plazo pasó. Así no
-- hace falta nada que lo marque a la hora en punto.
create table if not exists apartados (
  id            bigserial primary key,
  -- El enlace de la clienta para ver su apartado.
  token         uuid not null unique default gen_random_uuid(),
  revendedor_id bigint not null references revendedores(id),
  cliente_id    bigint not null references revendedor_clientes(id),
  estado        text not null default 'abierto' check (estado in ('abierto', 'retirado', 'cancelado')),
  creado_en     timestamptz not null default now(),
  expira_en     timestamptz not null,
  -- Mientras se cobra: suelta sus piezas para poder tomarlas, igual que
  -- `reservas.cerrada_en`. Si el cobro falla, se deshace con él.
  cerrado_en    timestamptz,
  venta_id      bigint references ventas(id),
  retirado_en   timestamptz,
  retirado_por  uuid references perfiles(id),
  cancelado_en  timestamptz,
  cancelado_por text check (cancelado_por is null or cancelado_por in ('revendedor', 'tienda')),
  motivo        text
);

create index if not exists apartados_revendedor_idx on apartados (revendedor_id, creado_en desc);
create index if not exists apartados_cliente_idx    on apartados (cliente_id);
create index if not exists apartados_abiertos_idx   on apartados (expira_en) where estado = 'abierto';

-- Los tres precios se congelan al apartar: si mañana cambia la etiqueta,
-- lo que ya se apartó vale lo que valía.
create table if not exists apartado_items (
  id                 bigserial primary key,
  apartado_id        bigint not null references apartados(id),
  modelo_id          bigint not null references modelos(id),
  cantidad           int not null check (cantidad > 0),
  -- La etiqueta de la tienda al apartar.
  precio_lista_usd   numeric(12,4) not null,
  -- Lo que el revendedor le paga a Lux.
  precio_lux_usd     numeric(12,2) not null,
  -- Lo que el revendedor le cobra a su clienta.
  precio_clienta_usd numeric(12,2) not null
);

create index if not exists apartado_items_apartado_idx on apartado_items (apartado_id);
create index if not exists apartado_items_modelo_idx   on apartado_items (modelo_id);

-- Lo que la clienta le paga AL REVENDEDOR. Misma cuenta que `abonos`: la
-- deuda es en dólares BCV y cada abono se convierte a la tasa de su día.
create table if not exists apartado_abonos (
  id          bigserial primary key,
  apartado_id bigint not null references apartados(id),
  fecha       timestamptz not null default now(),
  metodo      metodo_pago not null,
  monto_bs    numeric(14,2) not null check (monto_bs > 0),
  monto_usd   numeric(12,2) check (monto_usd is null or monto_usd > 0),
  monto_bcv   numeric(16,6) not null check (monto_bcv > 0),
  tasa_bcv    numeric(12,4) not null,
  tasa_venta  numeric(12,4) not null,
  referencia  text
);

create index if not exists apartado_abonos_apartado_idx on apartado_abonos (apartado_id);

alter table revendedores        enable row level security;
alter table revendedor_sesiones enable row level security;
alter table revendedor_precios  enable row level security;
alter table revendedor_clientes enable row level security;
alter table apartados           enable row level security;
alter table apartado_items      enable row level security;
alter table apartado_abonos     enable row level security;

revoke all on revendedores, revendedor_sesiones, revendedor_precios, revendedor_clientes,
              apartados, apartado_items, apartado_abonos
  from anon, authenticated;
revoke all on sequence revendedores_id_seq, revendedor_clientes_id_seq, apartados_id_seq,
                       apartado_items_id_seq, apartado_abonos_id_seq
  from anon, authenticated;

-- Los apartados y sus abonos son histórico, como las ventas: no se borran.
drop trigger if exists apartados_no_se_borran        on apartados;
drop trigger if exists apartados_no_se_vacian        on apartados;
drop trigger if exists apartado_items_no_se_borran   on apartado_items;
drop trigger if exists apartado_items_no_se_vacian   on apartado_items;
drop trigger if exists apartado_abonos_no_se_borran  on apartado_abonos;
drop trigger if exists apartado_abonos_no_se_vacian  on apartado_abonos;

create trigger apartados_no_se_borran       before delete   on apartados       for each row       execute function historico_no_se_borra();
create trigger apartados_no_se_vacian       before truncate on apartados       for each statement execute function historico_no_se_borra();
create trigger apartado_items_no_se_borran  before delete   on apartado_items  for each row       execute function historico_no_se_borra();
create trigger apartado_items_no_se_vacian  before truncate on apartado_items  for each statement execute function historico_no_se_borra();
create trigger apartado_abonos_no_se_borran before delete   on apartado_abonos for each row       execute function historico_no_se_borra();
create trigger apartado_abonos_no_se_vacian before truncate on apartado_abonos for each statement execute function historico_no_se_borra();

-- La venta al revendedor, en la caja de la tienda.
alter table ventas add column if not exists revendedor_id bigint references revendedores(id);
create index if not exists ventas_revendedor_idx on ventas (revendedor_id) where revendedor_id is not null;

alter table venta_items drop constraint if exists venta_items_motivo_rebaja_check;
alter table venta_items add constraint venta_items_motivo_rebaja_check
  check (motivo_rebaja is null or motivo_rebaja in ('regateo', 'tramo', 'revendedor'));


-- ---------------------------------------------------------------------
-- 4. LAS FÓRMULAS: UNA CIFRA, UN SITIO
--
--   rv_precio_lux(modelo, %)   lo que el revendedor le paga a Lux
--   rv_minimo_clienta(lista)   lo mínimo que él puede cobrar
--   rv_precio_clienta(...)     lo que cobra: el suyo, o el mínimo
--
-- Las leen su catálogo, su panel, el apartado y el cobro en la tienda.
-- Ninguna pantalla repite la cuenta: la pantalla de precios enseña el
-- mínimo que le manda la base.
-- ---------------------------------------------------------------------

create or replace function rv_descuento_de(p_revendedor_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select descuento_pct from revendedores where id = p_revendedor_id),
    (select valor from configuracion where clave = 'revendedor_descuento_pct'),
    0);
$fn$;

revoke all on function rv_descuento_de(bigint) from public, anon;
grant execute on function rv_descuento_de(bigint) to authenticated;

-- La etiqueta menos su descuento, sin bajar del piso de margen, al
-- centavo HACIA ARRIBA: redondear hacia abajo lo dejaría un pelo por
-- debajo del piso. Null si la pieza no tiene precio.
create or replace function rv_precio_lux(p_modelo_id bigint, p_descuento_pct numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_lista numeric;
  v_desc  numeric := least(greatest(coalesce(p_descuento_pct, 0), 0), 99);
begin
  select coalesce(m.precio_override_usd, g.precio_usd)
    into v_lista
    from modelos m
    left join grupos_precio g on g.id = m.grupo_precio_id
   where m.id = p_modelo_id and m.activo;

  if v_lista is null then
    return null;
  end if;

  return ceil(greatest(v_lista * (1 - v_desc / 100),
                       coalesce(piso_margen_de(p_modelo_id), v_lista)) * 100) / 100;
end;
$fn$;

-- Lleva el piso de margen dentro: solo la llaman funciones de definidor.
revoke all on function rv_precio_lux(bigint, numeric) from public, anon, authenticated;

create or replace function rv_minimo_clienta(p_lista numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select ceil((p_lista + coalesce((select valor from configuracion
                                    where clave = 'revendedor_sobre_etiqueta_usd'), 0)) * 100) / 100;
$fn$;

revoke all on function rv_minimo_clienta(numeric) from public, anon, authenticated;

-- Si la etiqueta sube por encima de lo que él había puesto, manda el
-- mínimo: su precio nunca queda por debajo del de la tienda.
create or replace function rv_precio_clienta(p_propio numeric, p_lista numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select greatest(coalesce(p_propio, 0), rv_minimo_clienta(p_lista));
$fn$;

revoke all on function rv_precio_clienta(numeric, numeric) from public, anon, authenticated;

-- Lo que la clienta todavía le debe al revendedor por un apartado, en
-- dólares BCV. Medio centavo de tolerancia, como `falta_bcv_de`.
create or replace function rv_falta_de(p_apartado_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select case when x.falta < 0.005 then 0 else round(x.falta, 4) end
    from (
      select coalesce((select sum(i.precio_clienta_usd * i.cantidad)
                         from apartado_items i where i.apartado_id = p_apartado_id), 0)
           - coalesce((select sum(b.monto_bcv)
                         from apartado_abonos b where b.apartado_id = p_apartado_id), 0) as falta
    ) x;
$fn$;

revoke all on function rv_falta_de(bigint) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. EL TOPE Y SU NIVEL
--
--   rv_escalera()   los niveles: cuánto puede apartar cada uno y desde
--                   cuánto retirado se llega. Sale de `configuracion`.
--   rv_tope(id)     en qué nivel está uno, cuánto tiene apartado y cuánto
--                   le falta para subir.
--
-- La escalera es una sola: la lee rv_tope y la enseña la pantalla del
-- dueño. Si el navegador la calculara para enseñarla, serían dos cuentas.
-- ---------------------------------------------------------------------

create or replace function rv_escalera()
returns table (nivel int, tope_usd numeric, desde_usd numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_ini     numeric;
  v_paso    numeric;
  v_max     numeric;
  v_vueltas numeric;
  v_niveles int;
  v_acum    numeric := 0;
  k         int;
begin
  select valor into v_ini     from configuracion where clave = 'revendedor_tope_inicial_usd';
  select valor into v_paso    from configuracion where clave = 'revendedor_tope_paso_usd';
  select valor into v_max     from configuracion where clave = 'revendedor_tope_maximo_usd';
  select valor into v_vueltas from configuracion where clave = 'revendedor_vueltas_para_subir';

  v_ini     := greatest(coalesce(v_ini, 0), 0);
  v_paso    := greatest(coalesce(v_paso, 0), 0);
  v_max     := greatest(coalesce(v_max, v_ini), v_ini);
  v_vueltas := greatest(coalesce(v_vueltas, 0), 0);

  -- Si el paso no cae justo en el máximo, el último nivel es el máximo.
  v_niveles := case when v_paso > 0 then ceil((v_max - v_ini) / v_paso)::int + 1 else 1 end;

  -- Al nivel k se llega cuando lo retirado alcanza las vueltas pedidas
  -- sobre la suma de los topes de los niveles anteriores.
  for k in 1..v_niveles loop
    nivel     := k;
    tope_usd  := least(v_ini + v_paso * (k - 1), v_max);
    desde_usd := v_vueltas * v_acum;
    return next;
    v_acum := v_acum + tope_usd;
  end loop;
end;
$fn$;

-- Son reglas, no costos: la pantalla del dueño las enseña.
revoke all on function rv_escalera() from public, anon;
grant execute on function rv_escalera() to authenticated;

create or replace function rv_tope(p_revendedor_id bigint)
returns table (
  nivel                int,
  niveles              int,
  tope_usd             numeric,
  usado_usd            numeric,
  libre_usd            numeric,
  retirado_usd         numeric,
  siguiente_tope_usd   numeric,
  falta_para_subir_usd numeric,
  vencidos_recientes   int,
  bajado               boolean,
  manual               boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_bajar     numeric;
  v_ventana   numeric;
  v_manual    numeric;
  v_retirado  numeric;
  v_usado     numeric;
  v_vencidos  int;
  v_ganado    int;
  v_nivel     int;
  v_siguiente record;
begin
  select valor into v_bajar   from configuracion where clave = 'revendedor_vencidos_para_bajar';
  select valor into v_ventana from configuracion where clave = 'revendedor_dias_ventana';
  v_bajar   := coalesce(v_bajar, 0);
  v_ventana := greatest(coalesce(v_ventana, 0), 0);

  select r.tope_manual_usd into v_manual from revendedores r where r.id = p_revendedor_id;

  -- Lo que ya retiró y pagó, a lo que le costó a él.
  select coalesce(sum(i.precio_lux_usd * i.cantidad), 0)
    into v_retirado
    from apartados a
    join apartado_items i on i.apartado_id = a.id
   where a.revendedor_id = p_revendedor_id and a.estado = 'retirado';

  -- Lo que tiene apartado ahora mismo.
  select coalesce(sum(i.precio_lux_usd * i.cantidad), 0)
    into v_usado
    from apartados a
    join apartado_items i on i.apartado_id = a.id
   where a.revendedor_id = p_revendedor_id
     and a.estado = 'abierto' and a.cerrado_en is null and a.expira_en > now();

  -- Los que dejó vencer en la ventana. Cancelar a tiempo no cuenta: es lo
  -- que se le pide que haga cuando la clienta se echa para atrás.
  select count(*)::int
    into v_vencidos
    from apartados a
   where a.revendedor_id = p_revendedor_id
     and a.estado = 'abierto'
     and a.expira_en <= now()
     and a.expira_en > now() - make_interval(days => v_ventana::int);

  -- El nivel que se ganó retirando, y el que le toca con sus vencidos.
  select coalesce(max(e.nivel), 1) into v_ganado from rv_escalera() e where e.desde_usd <= v_retirado;
  select count(*)::int into niveles from rv_escalera();

  bajado  := v_bajar > 0 and v_vencidos >= v_bajar and v_ganado > 1;
  v_nivel := case when bajado then v_ganado - 1 else v_ganado end;

  manual             := v_manual is not null;
  usado_usd          := round(v_usado, 2);
  retirado_usd       := round(v_retirado, 2);
  vencidos_recientes := v_vencidos;

  if manual then
    nivel := null;
    tope_usd := v_manual;
    siguiente_tope_usd := null;
    falta_para_subir_usd := null;
  else
    nivel := v_nivel;
    select e.tope_usd into tope_usd from rv_escalera() e where e.nivel = v_nivel;
    -- Lo que falta para subir se dice solo si no está castigado: primero
    -- tiene que salir de los vencidos.
    select e.tope_usd, e.desde_usd into v_siguiente from rv_escalera() e where e.nivel = v_ganado + 1;
    if v_siguiente.tope_usd is not null and not bajado then
      siguiente_tope_usd := v_siguiente.tope_usd;
      falta_para_subir_usd := round(greatest(v_siguiente.desde_usd - v_retirado, 0), 2);
    else
      siguiente_tope_usd := null;
      falta_para_subir_usd := null;
    end if;
  end if;

  libre_usd := round(greatest(tope_usd - v_usado, 0), 2);
  return next;
end;
$fn$;

-- La lee `v_revendedores`, que consulta el administrador: una vista no
-- presta su permiso para ejecutar. No lleva costo ni margen.
revoke all on function rv_tope(bigint) from public, anon;
grant execute on function rv_tope(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 6. QUÉ APARTA UN PEDIDO, Y AHORA TAMBIÉN UN REVENDEDOR
-- La de esquema-apartadas-en-mostrador.sql más los apartados abiertos
-- que no han vencido. Sigue siendo la única regla: la usan el catálogo
-- público, el mostrador, `crear_reserva`, `cobrar_pedido` y los apartados.
-- ---------------------------------------------------------------------

create or replace function apartadas_de(p_modelo_id bigint)
returns int
language sql
stable
security definer
set search_path = public
as $fn$
  select (
    coalesce((select sum(ri.cantidad)
                from reserva_items ri
                join reservas r on r.id = ri.reserva_id
               where ri.modelo_id = p_modelo_id
                 and r.venta_id is null
                 and r.cerrada_en is null
                 and ((r.estado = 'abierta' and r.expira_en > now()) or r.estado = 'confirmada')), 0)
  + coalesce((select sum(ai.cantidad)
                from apartado_items ai
                join apartados a on a.id = ai.apartado_id
               where ai.modelo_id = p_modelo_id
                 and a.estado = 'abierto'
                 and a.cerrado_en is null
                 and a.expira_en > now()), 0)
  )::int;
$fn$;

revoke all on function apartadas_de(bigint) from public;
grant execute on function apartadas_de(bigint) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 7. ENTRAR: EL CÓDIGO Y LA SESIÓN
-- ---------------------------------------------------------------------

-- Doce caracteres de un alfabeto de 31 (sin 0, O, 1, I ni L): 59 bits.
-- Salen de los bytes de un uuid v4, que Postgres saca de su generador
-- fuerte. Se saltan los bytes 6 y 8, que llevan la versión y la variante.
create or replace function rv_codigo_nuevo()
returns text
language plpgsql
volatile
set search_path = public
as $fn$
declare
  v_letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes  bytea := uuid_send(gen_random_uuid());
  v_codigo text := '';
  i        int;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13] loop
    v_codigo := v_codigo || substr(v_letras, get_byte(v_bytes, i) % 31 + 1, 1);
  end loop;
  return substr(v_codigo, 1, 4) || '-' || substr(v_codigo, 5, 4) || '-' || substr(v_codigo, 9, 4);
end;
$fn$;

revoke all on function rv_codigo_nuevo() from public, anon, authenticated;

-- La huella de un código: sin guiones, sin espacios, en mayúsculas.
create or replace function rv_huella_codigo(p_codigo text)
returns text
language sql
immutable
set search_path = public
as $fn$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
$fn$;

revoke all on function rv_huella_codigo(text) from public, anon, authenticated;

-- Quién es el dueño de un testigo de sesión. La llaman todas las `rv_*`
-- de su panel. Treinta días desde la última vez que se usó; se renueva
-- como mucho una vez al día para no escribir en cada consulta.
--
-- El error lleva el código 28000: la pantalla lo reconoce y lo manda a
-- entrar otra vez, en vez de enseñar un mensaje de base de datos.
create or replace function rv_de_sesion(p_sesion text)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_huella text;
  v_id     bigint;
  v_expira timestamptz;
begin
  if p_sesion is null or length(p_sesion) < 32 then
    raise exception 'Tu sesión se cerró. Entra otra vez con tu código.' using errcode = '28000';
  end if;

  v_huella := encode(sha256(convert_to(p_sesion, 'UTF8')), 'hex');

  select s.revendedor_id, s.expira_en
    into v_id, v_expira
    from revendedor_sesiones s
    join revendedores r on r.id = s.revendedor_id and r.activo
   where s.token_hash = v_huella;

  if v_id is null or v_expira <= now() then
    raise exception 'Tu sesión se cerró. Entra otra vez con tu código.' using errcode = '28000';
  end if;

  update revendedor_sesiones
     set usada_en = now(), expira_en = now() + interval '30 days'
   where token_hash = v_huella and usada_en < now() - interval '1 day';

  return v_id;
end;
$fn$;

revoke all on function rv_de_sesion(text) from public, anon, authenticated;

create or replace function rv_entrar(p_codigo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  r        revendedores%rowtype;
  v_testigo text;
begin
  if length(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')) <> 12 then
    raise exception 'El código tiene doce letras y números. Revísalo.' using errcode = '28000';
  end if;

  select * into r from revendedores where clave_hash = rv_huella_codigo(p_codigo);
  if not found then
    raise exception 'Ese código no sirve. Revísalo, o pídele uno nuevo a Lux.' using errcode = '28000';
  end if;
  if not r.activo then
    raise exception 'Tu acceso está pausado. Escríbele a Lux.' using errcode = '28000';
  end if;

  v_testigo := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into revendedor_sesiones (token_hash, revendedor_id, expira_en)
  values (encode(sha256(convert_to(v_testigo, 'UTF8')), 'hex'), r.id, now() + interval '30 days');

  -- Las vencidas de todos se limpian aquí: sin cron.
  delete from revendedor_sesiones where expira_en < now() - interval '1 day';

  return jsonb_build_object('sesion', v_testigo, 'nombre', r.nombre, 'usuario', r.usuario);
end;
$fn$;

revoke all on function rv_entrar(text) from public;
grant execute on function rv_entrar(text) to anon, authenticated;

create or replace function rv_salir(p_sesion text)
returns void
language sql
volatile
security definer
set search_path = public
as $fn$
  delete from revendedor_sesiones
   where token_hash = encode(sha256(convert_to(coalesce(p_sesion, ''), 'UTF8')), 'hex');
$fn$;

revoke all on function rv_salir(text) from public;
grant execute on function rv_salir(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 8. SU CATÁLOGO: LO QUE VE SU CLIENTA, SIN SESIÓN
-- ---------------------------------------------------------------------

create or replace function rv_perfil_publico(p_usuario text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'usuario',         r.usuario,
    'nombre',          r.nombre,
    'catalogo_nombre', coalesce(r.catalogo_nombre, r.nombre),
    'telefono',        r.telefono,
    'paleta',          r.paleta,
    'logo_path',       r.logo_path,
    'dias_apartado',   coalesce((select valor from configuracion where clave = 'revendedor_dias_apartado'), 0))
    from revendedores r
   where r.usuario = lower(btrim(coalesce(p_usuario, ''))) and r.activo;
$fn$;

revoke all on function rv_perfil_publico(text) from public;
grant execute on function rv_perfil_publico(text) to anon, authenticated;

-- Las piezas de su catálogo, a SU precio. Solo las que le dejan algo:
-- si el piso de margen no deja rebajarle nada, la pieza no sale.
-- Mismas columnas que v_disponible_publico, menos la ubicación: dónde
-- está la pieza en la tienda no le dice nada a su clienta.
create or replace function rv_catalogo_publico(p_usuario text)
returns table (
  id              bigint,
  sku             text,
  nombre          text,
  categoria       text,
  variantes_nota  text,
  foto_path       text,
  foto_thumb_path text,
  precio_usd      numeric,
  precio_bs       numeric,
  disponible      int,
  familia         bigint,
  variante        text
)
language sql
stable
security definer
set search_path = public
as $fn$
  with r as (
    select rv.id, rv_descuento_de(rv.id) as descuento
      from revendedores rv
     where rv.usuario = lower(btrim(coalesce(p_usuario, ''))) and rv.activo
  )
  select p.id, p.sku, p.nombre, p.categoria, p.variantes_nota, p.foto_path, p.foto_thumb_path,
         x.precio,
         round(x.precio * t.tasa_bcv, 2),
         p.disponible::int,
         p.familia,
         p.variante
    from v_disponible_publico p
   cross join r
    left join revendedor_precios rp on rp.revendedor_id = r.id and rp.modelo_id = p.id
    left join lateral (select tasa_bcv from tasas where vigente limit 1) t on true
   cross join lateral (
     select rv_precio_lux(p.id, r.descuento)                 as lux,
            rv_precio_clienta(rp.precio_usd, p.precio_usd)   as precio
   ) x
   where x.lux < p.precio_usd;
$fn$;

revoke all on function rv_catalogo_publico(text) from public;
grant execute on function rv_catalogo_publico(text) to anon, authenticated;

-- La búsqueda por cédula de su catálogo, enmascarada como la de la
-- tienda y con las mismas claves (el formulario es el mismo). Busca solo
-- entre SUS clientas.
create or replace function rv_buscar_cliente(p_usuario text, p_cedula text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_ced      text := nullif(regexp_replace(coalesce(p_cedula, ''), '[^0-9]', '', 'g'), '');
  v_c        revendedor_clientes%rowtype;
  v_palabras text[];
  v_tel      text;
  v_faltan   text[] := '{}';
begin
  if v_ced is null or length(v_ced) < 6 then
    return jsonb_build_object('encontrada', false);
  end if;

  select c.* into v_c
    from revendedor_clientes c
    join revendedores r on r.id = c.revendedor_id and r.activo
   where r.usuario = lower(btrim(coalesce(p_usuario, ''))) and c.cedula_digitos = v_ced;
  if not found then
    return jsonb_build_object('encontrada', false);
  end if;

  v_palabras := regexp_split_to_array(btrim(v_c.nombre), '\s+');
  v_tel := regexp_replace(coalesce(v_c.telefono, ''), '[^0-9]', '', 'g');

  if nullif(btrim(coalesce(v_c.apellido, '')), '') is null then
    v_faltan := v_faltan || 'apellido';
  end if;
  if length(v_tel) < 10 then
    v_faltan := v_faltan || 'telefono';
  end if;

  return jsonb_build_object(
    'encontrada',     true,
    'nombre',         v_palabras[1],
    'inicial',        upper(left(coalesce(nullif(btrim(v_c.apellido), ''), v_palabras[2], ''), 1)),
    'telefono_final', case when length(v_tel) >= 10 then right(v_tel, 2) end,
    'faltan',         to_jsonb(v_faltan));
end;
$fn$;

revoke all on function rv_buscar_cliente(text, text) from public;
grant execute on function rv_buscar_cliente(text, text) to anon, authenticated;

-- Apartar desde su catálogo. Todo o nada: si una pieza no alcanza o el
-- tope no da, no se aparta ninguna.
create or replace function rv_apartar(
  p_usuario  text,
  p_items    jsonb,
  p_cedula   text,
  p_nombre   text default null,
  p_apellido text default null,
  p_telefono text default null
) returns uuid
language plpgsql
volatile
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
  v_dias      numeric;
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
  v_token     uuid;
begin
  select * into r from revendedores
   where usuario = lower(btrim(coalesce(p_usuario, '')))
     for update;   -- dos apartados a la vez no pueden pasarse del tope
  if not found or not r.activo then
    raise exception 'Este catálogo no está disponible.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No elegiste ninguna pieza.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x
              where coalesce((x->>'cantidad')::int, 0) <= 0) then
    raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.';
  end if;

  if v_ced is null then raise exception 'Falta tu cédula.'; end if;
  if length(regexp_replace(v_ced, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Esa cédula está incompleta.';
  end if;

  -- Si ya es su clienta, lo que no escribió sale de su ficha. La ficha no
  -- se reescribe desde el catálogo (con la cédula de otra se le podría
  -- cambiar el teléfono): solo se llenan los huecos.
  select * into v_cli
    from revendedor_clientes
   where revendedor_id = r.id
     and cedula_digitos = regexp_replace(v_ced, '[^0-9]', '', 'g');

  if found then
    v_nom := coalesce(v_nom, nullif(btrim(v_cli.nombre), ''));
    v_ape := coalesce(v_ape, nullif(btrim(coalesce(v_cli.apellido, '')), ''));
    if v_tel is null and length(regexp_replace(coalesce(v_cli.telefono, ''), '[^0-9]', '', 'g')) >= 10 then
      v_tel := btrim(v_cli.telefono);
    end if;
  end if;

  if v_nom is null then raise exception 'Falta tu nombre.'; end if;
  if v_ape is null then raise exception 'Falta tu apellido.'; end if;
  if v_tel is null then raise exception 'Falta tu número de teléfono.'; end if;
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
                           then telefono else v_tel end
     where id = v_cli.id;
  end if;

  select valor into v_dias from configuracion where clave = 'revendedor_dias_apartado';
  if coalesce(v_dias, 0) <= 0 then
    raise exception 'Falta fijar cuántos días dura un apartado. Avísale a Lux.';
  end if;

  v_desc := rv_descuento_de(r.id);

  -- Las mismas cerraduras que `crear_reserva` (por pieza), más las filas
  -- de existencia: una venta del mostrador que toma la última pieza espera
  -- a este apartado, o este espera a la venta.
  for v_linea in
    select (x->>'modelo_id')::bigint as modelo_id
      from jsonb_array_elements(p_items) x
     group by 1
     order by 1
  loop
    perform pg_advisory_xact_lock(v_linea.modelo_id);
    perform 1 from existencias where modelo_id = v_linea.modelo_id for update;
  end loop;

  for v_linea in
    select (x->>'modelo_id')::bigint as modelo_id, sum((x->>'cantidad')::int)::int as cantidad
      from jsonb_array_elements(p_items) x
     group by 1
     order by 1
  loop
    select m.nombre || coalesce(' · ' || m.variante, ''), coalesce(m.precio_override_usd, g.precio_usd)
      into v_nombre, v_lista
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_linea.modelo_id and m.activo;
    if not found or v_lista is null then
      raise exception 'Una de las piezas que elegiste ya no está disponible.';
    end if;

    v_lux := rv_precio_lux(v_linea.modelo_id, v_desc);
    if v_lux is null or v_lux >= v_lista then
      raise exception '"%" no está en este catálogo.', v_nombre;
    end if;

    select coalesce(sum(e.cantidad), 0) - apartadas_de(v_linea.modelo_id)
      into v_hay
      from existencias e
     where e.modelo_id = v_linea.modelo_id;
    if v_linea.cantidad > v_hay then
      raise exception 'De "%" quedan % disponibles y pediste %.', v_nombre, greatest(v_hay, 0), v_linea.cantidad;
    end if;

    select rv_precio_clienta(rp.precio_usd, v_lista)
      into v_precio
      from (select 1) uno
      left join revendedor_precios rp on rp.revendedor_id = r.id and rp.modelo_id = v_linea.modelo_id;

    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'modelo_id', v_linea.modelo_id, 'cantidad', v_linea.cantidad,
      'lista', v_lista, 'lux', v_lux, 'precio', v_precio));
    v_nuevo := v_nuevo + v_lux * v_linea.cantidad;
  end loop;

  select * into v_tope from rv_tope(r.id);
  if v_tope.usado_usd + v_nuevo > v_tope.tope_usd + 0.005 then
    raise exception 'Por ahora no se pueden apartar más piezas en este catálogo. Escríbele a % para apartarlas.',
      split_part(btrim(r.nombre), ' ', 1);
  end if;

  insert into apartados (revendedor_id, cliente_id, expira_en)
  values (r.id, v_cli.id, now() + make_interval(days => v_dias::int))
  returning id, token into v_id, v_token;

  insert into apartado_items (apartado_id, modelo_id, cantidad, precio_lista_usd, precio_lux_usd, precio_clienta_usd)
  select v_id, l.modelo_id, l.cantidad, l.lista, l.lux, l.precio
    from jsonb_to_recordset(v_lineas)
      as l(modelo_id bigint, cantidad int, lista numeric, lux numeric, precio numeric);

  return v_token;
end;
$fn$;

revoke all on function rv_apartar(text, jsonb, text, text, text, text) from public;
grant execute on function rv_apartar(text, jsonb, text, text, text, text) to anon, authenticated;

-- La página de la clienta, con el enlace que recibe al apartar. Su
-- primer nombre, sus piezas a SU precio y lo que le falta. Nada de Lux.
create or replace function rv_ver_apartado(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'usuario',         r.usuario,
    'catalogo_nombre', coalesce(r.catalogo_nombre, r.nombre),
    'revendedor',      split_part(btrim(r.nombre), ' ', 1),
    'telefono',        r.telefono,
    'paleta',          r.paleta,
    'logo_path',       r.logo_path,
    'estado',          case when a.estado = 'abierto' and a.expira_en <= now() then 'vencido' else a.estado end,
    'creado_en',       a.creado_en,
    'expira_en',       a.expira_en,
    'clienta',         split_part(btrim(c.nombre), ' ', 1),
    'items',           (select jsonb_agg(jsonb_build_object(
                                 'nombre', m.nombre, 'variante', m.variante,
                                 'foto_thumb_path', m.foto_thumb_path,
                                 'cantidad', i.cantidad, 'precio_usd', i.precio_clienta_usd)
                               order by m.nombre)
                          from apartado_items i join modelos m on m.id = i.modelo_id
                         where i.apartado_id = a.id),
    'total_usd',       (select sum(i.precio_clienta_usd * i.cantidad) from apartado_items i where i.apartado_id = a.id),
    'falta_usd',       rv_falta_de(a.id))
    from apartados a
    join revendedores r on r.id = a.revendedor_id
    join revendedor_clientes c on c.id = a.cliente_id
   where a.token = p_token;
$fn$;

revoke all on function rv_ver_apartado(uuid) from public;
grant execute on function rv_ver_apartado(uuid) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 9. SU PANEL
-- Todas empiezan igual: `rv_de_sesion(p_sesion)` dice quién es, y de ahí
-- en adelante solo se toca lo que tiene su `revendedor_id`.
-- ---------------------------------------------------------------------

-- Lo que ve al entrar: quién es, su tope, cómo va el mes.
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
  v_abier int;
  v_pronto int;
  v_venc  int;
begin
  select * into r from revendedores where id = v_id;
  select * into v_tope from rv_tope(v_id);

  select jsonb_build_object(
           'piezas',    coalesce(sum(i.cantidad), 0),
           'vendido_usd', coalesce(sum(i.precio_clienta_usd * i.cantidad), 0),
           'pagado_usd',  coalesce(sum(i.precio_lux_usd * i.cantidad), 0),
           'ganancia_usd', coalesce(sum((i.precio_clienta_usd - i.precio_lux_usd) * i.cantidad), 0))
    into v_mes
    from apartados a
    join apartado_items i on i.apartado_id = a.id
   where a.revendedor_id = v_id and a.estado = 'retirado'
     and a.retirado_en >= date_trunc('month', now());

  -- Los últimos seis meses, con los vacíos en cero: una barra que falta
  -- engaña más que una en cero.
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
             sum((i.precio_clienta_usd - i.precio_lux_usd) * i.cantidad) as ganancia
        from apartados a
        join apartado_items i on i.apartado_id = a.id
       where a.revendedor_id = v_id and a.estado = 'retirado'
         and a.retirado_en >= date_trunc('month', now()) - interval '5 months'
       group by 1
    ) x on x.mes = m.mes;

  -- Lo que sus clientas le deben: apartados vigentes y ya retirados.
  select coalesce(sum(rv_falta_de(a.id)), 0)
    into v_cred
    from apartados a
   where a.revendedor_id = v_id
     and (a.estado = 'retirado' or (a.estado = 'abierto' and a.expira_en > now()));

  select count(*) filter (where a.expira_en > now()),
         count(*) filter (where a.expira_en > now() and a.expira_en <= now() + interval '3 days'),
         count(*) filter (where a.expira_en <= now() and a.expira_en > now() - interval '30 days')
    into v_abier, v_pronto, v_venc
    from apartados a
   where a.revendedor_id = v_id and a.estado = 'abierto';

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
    'dias_apartado',    coalesce((select valor from configuracion where clave = 'revendedor_dias_apartado'), 0),
    'vencidos_para_bajar', coalesce((select valor from configuracion where clave = 'revendedor_vencidos_para_bajar'), 0),
    'dias_ventana',     coalesce((select valor from configuracion where clave = 'revendedor_dias_ventana'), 0),
    'tope',             to_jsonb(v_tope),
    'mes',              v_mes,
    'meses',            v_meses,
    'credito_usd',      round(v_cred, 2),
    'abiertos',         v_abier,
    'por_vencer',       v_pronto,
    'vencidos',         v_venc);
end;
$fn$;

revoke all on function rv_resumen(text) from public;
grant execute on function rv_resumen(text) to anon, authenticated;

-- Sus piezas: en cuánto le salen, su mínimo, su precio y lo que gana.
-- Es lo único que ve de los precios de Lux, y no lleva ningún costo: lo
-- que le sale es la etiqueta menos su descuento.
create or replace function rv_piezas(p_sesion text)
returns table (
  id              bigint,
  sku             text,
  nombre          text,
  categoria       text,
  variantes_nota  text,
  foto_path       text,
  foto_thumb_path text,
  familia         bigint,
  variante        text,
  disponible      int,
  etiqueta_usd    numeric,
  precio_lux_usd  numeric,
  minimo_usd      numeric,
  precio_usd      numeric,
  precio_propio   numeric,
  ganancia_usd    numeric
)
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id   bigint := rv_de_sesion(p_sesion);
  v_desc numeric := rv_descuento_de(v_id);
begin
  return query
  select p.id, p.sku, p.nombre, p.categoria, p.variantes_nota, p.foto_path, p.foto_thumb_path,
         p.familia, p.variante, p.disponible::int,
         p.precio_usd,
         x.lux,
         rv_minimo_clienta(p.precio_usd),
         x.precio,
         rp.precio_usd,
         x.precio - x.lux
    from v_disponible_publico p
    left join revendedor_precios rp on rp.revendedor_id = v_id and rp.modelo_id = p.id
   cross join lateral (
     select rv_precio_lux(p.id, v_desc) as lux,
            rv_precio_clienta(rp.precio_usd, p.precio_usd) as precio
   ) x
   where x.lux < p.precio_usd
   order by p.categoria, p.nombre, p.variante;
end;
$fn$;

revoke all on function rv_piezas(text) from public;
grant execute on function rv_piezas(text) to anon, authenticated;

-- Fijar precios, de a uno o todos de una vez. `[{modelo_id, precio_usd}]`;
-- un precio null borra el suyo y la pieza vuelve a su mínimo.
create or replace function rv_fijar_precios(p_sesion text, p_precios jsonb)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id     bigint := rv_de_sesion(p_sesion);
  v_desc   numeric := rv_descuento_de(v_id);
  v_x      jsonb;
  v_modelo bigint;
  v_precio numeric;
  v_lista  numeric;
  v_nombre text;
  v_min    numeric;
  v_n      int := 0;
begin
  if p_precios is null or jsonb_typeof(p_precios) <> 'array' then
    raise exception 'No llegó ningún precio.';
  end if;

  for v_x in select * from jsonb_array_elements(p_precios) loop
    v_modelo := (v_x->>'modelo_id')::bigint;
    v_precio := nullif(v_x->>'precio_usd', '')::numeric;

    if v_precio is null then
      delete from revendedor_precios where revendedor_id = v_id and modelo_id = v_modelo;
      v_n := v_n + 1;
      continue;
    end if;

    select m.nombre || coalesce(' · ' || m.variante, ''), coalesce(m.precio_override_usd, g.precio_usd)
      into v_nombre, v_lista
      from modelos m
      left join grupos_precio g on g.id = m.grupo_precio_id
     where m.id = v_modelo and m.activo;
    if not found or v_lista is null then
      raise exception 'Una de las piezas ya no está en el catálogo.';
    end if;
    if rv_precio_lux(v_modelo, v_desc) >= v_lista then
      raise exception '"%" no está en tu catálogo.', v_nombre;
    end if;

    v_min := rv_minimo_clienta(v_lista);
    if round(v_precio, 2) < v_min then
      raise exception 'El precio de "%" no puede ser menor que $% BCV: el tuyo va siempre por encima del de la tienda.',
        v_nombre, to_char(v_min, 'FM999G999G990D00');
    end if;

    insert into revendedor_precios (revendedor_id, modelo_id, precio_usd)
    values (v_id, v_modelo, round(v_precio, 2))
    on conflict (revendedor_id, modelo_id)
    do update set precio_usd = excluded.precio_usd, actualizado_en = now();
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$fn$;

revoke all on function rv_fijar_precios(text, jsonb) from public;
grant execute on function rv_fijar_precios(text, jsonb) to anon, authenticated;

-- Sus apartados: los vigentes primero, y los de los últimos 120 días.
create or replace function rv_apartados(p_sesion text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id bigint := rv_de_sesion(p_sesion);
begin
  return coalesce((
    -- Los vigentes, el que vence antes primero. Después los retirados que
    -- todavía le deben, y al final el resto, lo más reciente primero.
    select jsonb_agg(fila order by orden, clave)
      from (
        select case when a.estado = 'abierto' and a.expira_en > now() then 0
                    when a.estado = 'retirado' and rv_falta_de(a.id) > 0 then 1
                    else 2 end as orden,
               case when a.estado = 'abierto' and a.expira_en > now()
                    then extract(epoch from a.expira_en)
                    else -extract(epoch from coalesce(a.retirado_en, a.cancelado_en, a.expira_en)) end as clave,
               jsonb_build_object(
                 'id',          a.id,
                 'token',       a.token,
                 'estado',      case when a.estado = 'abierto' and a.expira_en <= now() then 'vencido' else a.estado end,
                 'creado_en',   a.creado_en,
                 'expira_en',   a.expira_en,
                 'retirado_en', a.retirado_en,
                 'cancelado_en', a.cancelado_en,
                 'motivo',      a.motivo,
                 'cliente',     jsonb_build_object('id', c.id, 'nombre', c.nombre, 'apellido', c.apellido,
                                                   'telefono', c.telefono, 'cedula', c.cedula),
                 'items',       (select jsonb_agg(jsonb_build_object(
                                          'modelo_id', i.modelo_id, 'sku', m.sku, 'nombre', m.nombre,
                                          'variante', m.variante, 'foto_thumb_path', m.foto_thumb_path,
                                          'cantidad', i.cantidad,
                                          'precio_usd', i.precio_clienta_usd,
                                          'precio_lux_usd', i.precio_lux_usd) order by m.nombre)
                                   from apartado_items i join modelos m on m.id = i.modelo_id
                                  where i.apartado_id = a.id),
                 'total_usd',   (select sum(i.precio_clienta_usd * i.cantidad) from apartado_items i where i.apartado_id = a.id),
                 'lux_usd',     (select sum(i.precio_lux_usd * i.cantidad) from apartado_items i where i.apartado_id = a.id),
                 'abonado_usd', coalesce((select sum(b.monto_bcv) from apartado_abonos b where b.apartado_id = a.id), 0),
                 'falta_usd',   rv_falta_de(a.id),
                 'abonos',      coalesce((select jsonb_agg(jsonb_build_object(
                                          'fecha', b.fecha, 'metodo', b.metodo, 'monto_bs', b.monto_bs,
                                          'monto_usd', b.monto_usd, 'monto_bcv', b.monto_bcv,
                                          'referencia', b.referencia) order by b.fecha)
                                            from apartado_abonos b where b.apartado_id = a.id), '[]'::jsonb)
               ) as fila
          from apartados a
          join revendedor_clientes c on c.id = a.cliente_id
         where a.revendedor_id = v_id
           and (a.estado = 'abierto'
                or rv_falta_de(a.id) > 0
                or coalesce(a.retirado_en, a.cancelado_en, a.expira_en) > now() - interval '120 days')
         order by 1, 2
         limit 300
      ) x
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function rv_apartados(text) from public;
grant execute on function rv_apartados(text) to anon, authenticated;

-- Un abono de su clienta. En un apartado vigente, o en uno ya retirado
-- si le fió la pieza. Devuelve lo que falta.
create or replace function rv_abonar(
  p_sesion      text,
  p_apartado_id bigint,
  p_metodo      text,
  p_monto       numeric,
  p_referencia  text default null
) returns numeric
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id     bigint := rv_de_sesion(p_sesion);
  a        apartados%rowtype;
  v_tasa   tasas%rowtype;
  v_metodo metodo_pago;
  v_bs     numeric(14,2);
  v_usd    numeric(12,2);
  v_bcv    numeric;
  v_falta  numeric;
  v_margen numeric;
begin
  select * into a from apartados where id = p_apartado_id and revendedor_id = v_id for update;
  if not found then
    raise exception 'No encuentro ese apartado.';
  end if;
  if a.estado = 'cancelado' then
    raise exception 'Ese apartado está cancelado: ya no lleva abonos.';
  end if;
  if a.estado = 'abierto' and a.expira_en <= now() then
    raise exception 'Ese apartado venció: las piezas volvieron a la tienda.';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El abono tiene que ser mayor que cero.';
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'La tienda no tiene la tasa del día. Intenta más tarde.';
  end if;

  begin
    v_metodo := p_metodo::metodo_pago;
  exception when others then
    raise exception 'Esa forma de pago no existe.';
  end;

  -- La misma cuenta que `anotar_abono`: en dólares, a bolívares por la
  -- tasa Binance; de bolívares a dólares BCV por la del BCV.
  if metodo_en_dolares(v_metodo) then
    v_usd := round(p_monto, 2);
    v_bs  := round(v_usd * v_tasa.tasa_venta, 2);
  else
    v_bs  := round(p_monto, 2);
  end if;
  v_bcv := v_bs / v_tasa.tasa_bcv;

  v_margen := case when metodo_en_dolares(v_metodo)
                   then greatest(0.005, 0.01 * v_tasa.tasa_venta / v_tasa.tasa_bcv)
                   else 0.005 end;

  v_falta := rv_falta_de(a.id);
  if v_falta <= 0 then
    raise exception 'Ese apartado ya está pagado completo.';
  end if;
  if v_bcv > v_falta + v_margen then
    raise exception 'El abono pasa lo que falta. Faltan $% BCV: hoy son Bs %.',
      to_char(v_falta, 'FM999G999G990D00'),
      to_char(round(v_falta * v_tasa.tasa_bcv, 2), 'FM999G999G990D00');
  end if;

  insert into apartado_abonos (apartado_id, metodo, monto_bs, monto_usd, monto_bcv, tasa_bcv, tasa_venta, referencia)
  values (a.id, v_metodo, v_bs, v_usd, v_bcv, v_tasa.tasa_bcv, v_tasa.tasa_venta,
          nullif(btrim(coalesce(p_referencia, '')), ''));

  return rv_falta_de(a.id);
end;
$fn$;

revoke all on function rv_abonar(text, bigint, text, numeric, text) from public;
grant execute on function rv_abonar(text, bigint, text, numeric, text) to anon, authenticated;

-- Soltar un apartado antes de que venza: la clienta se echó para atrás.
-- No cuenta como vencido: es lo que se espera que haga.
create or replace function rv_cancelar_apartado(p_sesion text, p_apartado_id bigint, p_motivo text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id bigint := rv_de_sesion(p_sesion);
  a    apartados%rowtype;
begin
  select * into a from apartados where id = p_apartado_id and revendedor_id = v_id for update;
  if not found then
    raise exception 'No encuentro ese apartado.';
  end if;
  if a.estado <> 'abierto' or a.cerrado_en is not null then
    raise exception 'Ese apartado ya no está abierto.';
  end if;
  if a.expira_en <= now() then
    raise exception 'Ese apartado ya venció: las piezas volvieron solas a la tienda.';
  end if;

  update apartados
     set estado = 'cancelado', cancelado_en = now(), cancelado_por = 'revendedor',
         motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = a.id;
end;
$fn$;

revoke all on function rv_cancelar_apartado(text, bigint, text) from public;
grant execute on function rv_cancelar_apartado(text, bigint, text) to anon, authenticated;

-- Sus clientas, con lo que compraron y lo que le deben.
create or replace function rv_clientes(p_sesion text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id bigint := rv_de_sesion(p_sesion);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'nombre', c.nombre, 'apellido', c.apellido, 'cedula', c.cedula,
             'telefono', c.telefono, 'notas', c.notas, 'creado_en', c.creado_en,
             'abiertos', coalesce(x.abiertos, 0),
             'compras', coalesce(x.compras, 0),
             'comprado_usd', coalesce(x.comprado, 0),
             'falta_usd', coalesce(x.falta, 0),
             'ultima', x.ultima)
           order by coalesce(x.falta, 0) desc, x.ultima desc nulls last, c.nombre)
      from revendedor_clientes c
      left join lateral (
        select count(*) filter (where a.estado = 'abierto' and a.expira_en > now()) as abiertos,
               count(*) filter (where a.estado = 'retirado') as compras,
               sum(case when a.estado = 'retirado'
                        then (select sum(i.precio_clienta_usd * i.cantidad) from apartado_items i where i.apartado_id = a.id)
                   end) as comprado,
               sum(case when a.estado = 'retirado' or (a.estado = 'abierto' and a.expira_en > now())
                        then rv_falta_de(a.id) else 0 end) as falta,
               max(a.creado_en) as ultima
          from apartados a
         where a.cliente_id = c.id
      ) x on true
     where c.revendedor_id = v_id
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function rv_clientes(text) from public;
grant execute on function rv_clientes(text) to anon, authenticated;

-- Crear o corregir una clienta suya. Devuelve su id.
create or replace function rv_guardar_cliente(
  p_sesion   text,
  p_id       bigint,
  p_nombre   text,
  p_apellido text,
  p_cedula   text,
  p_telefono text,
  p_notas    text default null
) returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id  bigint := rv_de_sesion(p_sesion);
  v_cli bigint;
begin
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Falta el nombre.';
  end if;
  if nullif(btrim(coalesce(p_cedula, '')), '') is not null
     and length(regexp_replace(p_cedula, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Esa cédula está incompleta.';
  end if;

  begin
    if p_id is null then
      insert into revendedor_clientes (revendedor_id, nombre, apellido, cedula, telefono, notas)
      values (v_id, btrim(p_nombre), nullif(btrim(coalesce(p_apellido, '')), ''),
              nullif(btrim(coalesce(p_cedula, '')), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
              nullif(btrim(coalesce(p_notas, '')), ''))
      returning id into v_cli;
    else
      update revendedor_clientes
         set nombre   = btrim(p_nombre),
             apellido = nullif(btrim(coalesce(p_apellido, '')), ''),
             cedula   = nullif(btrim(coalesce(p_cedula, '')), ''),
             telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
             notas    = nullif(btrim(coalesce(p_notas, '')), '')
       where id = p_id and revendedor_id = v_id
      returning id into v_cli;
      if v_cli is null then
        raise exception 'No encuentro esa clienta.';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya tienes una clienta con esa cédula.';
  end;

  return v_cli;
end;
$fn$;

revoke all on function rv_guardar_cliente(text, bigint, text, text, text, text, text) from public;
grant execute on function rv_guardar_cliente(text, bigint, text, text, text, text, text) to anon, authenticated;

-- El nombre de su catálogo, su paleta y su WhatsApp. El logo lo sube Lux:
-- sin sesión de Supabase no puede escribir en el almacén de fotos.
create or replace function rv_ajustes(p_sesion text, p_catalogo_nombre text, p_paleta text, p_telefono text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_id bigint := rv_de_sesion(p_sesion);
begin
  begin
    update revendedores
       set catalogo_nombre = nullif(btrim(coalesce(p_catalogo_nombre, '')), ''),
           paleta          = coalesce(nullif(btrim(coalesce(p_paleta, '')), ''), paleta),
           telefono        = nullif(btrim(coalesce(p_telefono, '')), '')
     where id = v_id;
  exception when check_violation then
    raise exception 'El nombre del catálogo va de 2 a 60 letras, y la paleta tiene que ser una de la lista.';
  end;
end;
$fn$;

revoke all on function rv_ajustes(text, text, text, text) from public;
grant execute on function rv_ajustes(text, text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 10. EN LA TIENDA: RETIRAR Y PAGAR
-- El revendedor llega, paga lo suyo y se lleva las piezas. Lo cobra
-- quien esté: la vendedora o el administrador.
-- ---------------------------------------------------------------------

-- Los apartados que se pueden retirar hoy, con lo que se le cobra a él.
-- Nada de lo que él le cobra a su clienta: eso es de su negocio.
create or replace view v_apartados_revendedor
with (security_invoker = off) as
select
  a.id,
  a.creado_en,
  a.expira_en,
  a.revendedor_id,
  r.nombre   as revendedor,
  r.telefono as revendedor_telefono,
  btrim(c.nombre || ' ' || coalesce(c.apellido, '')) as clienta,
  x.piezas,
  x.total_usd,
  x.lista_usd,
  x.items
from apartados a
join revendedores r on r.id = a.revendedor_id
join revendedor_clientes c on c.id = a.cliente_id
cross join lateral (
  select sum(i.cantidad)::int                    as piezas,
         sum(i.precio_lux_usd * i.cantidad)      as total_usd,
         sum(i.precio_lista_usd * i.cantidad)    as lista_usd,
         jsonb_agg(jsonb_build_object(
           'modelo_id', i.modelo_id, 'sku', m.sku, 'nombre', m.nombre, 'variante', m.variante,
           'foto_thumb_path', m.foto_thumb_path, 'cantidad', i.cantidad,
           'precio_usd', i.precio_lux_usd,
           -- Dónde buscarla, empezando por donde hay más: el mismo orden
           -- en que `cobrar_apartado` toma las piezas.
           'donde', (select string_agg(u.nombre, ' · ' order by e.cantidad desc, u.orden, u.id)
                       from existencias e join ubicaciones u on u.id = e.ubicacion_id
                      where e.modelo_id = i.modelo_id and e.cantidad > 0)
         ) order by m.nombre) as items
    from apartado_items i
    join modelos m on m.id = i.modelo_id
   where i.apartado_id = a.id
) x
where a.estado = 'abierto'
  and a.cerrado_en is null
  and a.expira_en > now()
  and es_personal();

revoke all on v_apartados_revendedor from anon;
grant select on v_apartados_revendedor to authenticated;

-- Retirar: se registra la venta al revendedor a su precio, las piezas
-- salen de lo libre en el mismo orden que un pedido del catálogo, y el
-- apartado queda retirado. Con "por verificar", la venta espera en
-- Pedidos a que alguien compruebe el pago, como cualquier otra.
create or replace function cobrar_apartado(
  p_apartado_id     bigint,
  p_metodo          text,
  p_pago_referencia text default null,
  p_por_verificar   boolean default false
) returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  a           apartados%rowtype;
  r           revendedores%rowtype;
  v_clienta   text;
  v_tasa      tasas%rowtype;
  v_linea     record;
  v_ex        record;
  v_falta     int;
  v_toma      int;
  v_venta     bigint;
  v_operativo numeric(12,4);
  v_precio_bs numeric(14,2);
  v_total_bs  numeric(14,2) := 0;
begin
  if not es_personal() then
    raise exception 'Hay que iniciar sesion.';
  end if;

  select * into a from apartados where id = p_apartado_id for update;
  if not found then
    raise exception 'Ese apartado no existe.';
  end if;
  if a.estado = 'retirado' then
    raise exception 'Ese apartado ya se retiró.';
  end if;
  if a.estado = 'cancelado' or a.cerrado_en is not null then
    raise exception 'Ese apartado está cancelado.';
  end if;
  if a.expira_en <= now() then
    raise exception 'Ese apartado venció el %: las piezas ya volvieron a la tienda. Que lo aparte otra vez desde su catálogo.',
      to_char(a.expira_en at time zone 'America/Caracas', 'DD/MM');
  end if;

  select * into v_tasa from tasas where vigente limit 1;
  if not found then
    raise exception 'No hay tasa vigente. Fijala en la pantalla de Tasas antes de cobrar.';
  end if;

  select * into r from revendedores where id = a.revendedor_id;
  select btrim(nombre || ' ' || coalesce(apellido, '')) into v_clienta
    from revendedor_clientes where id = a.cliente_id;

  -- Se suelta: desde aquí sus piezas cuentan como libres.
  update apartados set cerrado_en = now() where id = a.id;

  v_operativo := coalesce(costo_operativo_por_pieza(), 0);

  -- 'mayor': es venta al por mayor. El disparador del mínimo de mayoreo
  -- no la frena: sus dos claves se borraron en esquema-pedidos-y-mover.sql
  -- y sin ellas deja pasar todo.
  insert into ventas (usuario_id, tipo, metodo, tasa_venta_usada, tasa_bcv_usada,
                      cliente_nombre, cliente_telefono, notas,
                      por_verificar, pago_referencia, revendedor_id)
  values (auth.uid(), 'mayor', p_metodo::metodo_pago, v_tasa.tasa_venta, v_tasa.tasa_bcv,
          r.nombre, r.telefono,
          'Apartado #' || a.id || ' de ' || r.nombre || coalesce(' para ' || v_clienta, ''),
          coalesce(p_por_verificar, false), nullif(btrim(coalesce(p_pago_referencia, '')), ''), r.id)
  returning id into v_venta;

  for v_linea in
    select i.modelo_id, i.cantidad, i.precio_lux_usd, i.precio_lista_usd, m.costo_puesto_usd,
           m.nombre || coalesce(' · ' || m.variante, '') as nombre
      from apartado_items i
      join modelos m on m.id = i.modelo_id
     where i.apartado_id = a.id
     order by i.id
  loop
    v_falta := v_linea.cantidad;
    v_precio_bs := round(v_linea.precio_lux_usd * v_tasa.tasa_bcv, 2);

    for v_ex in
      select l.ubicacion_id, l.libre
        from v_existencia_libre l
        join ubicaciones u on u.id = l.ubicacion_id
       where l.modelo_id = v_linea.modelo_id and l.libre > 0
       order by l.cantidad desc, u.orden, u.id
    loop
      v_toma := least(v_falta, v_ex.libre);

      update existencias
         set cantidad = cantidad - v_toma, actualizado_en = now()
       where modelo_id = v_linea.modelo_id and ubicacion_id = v_ex.ubicacion_id
         and cantidad >= v_toma;
      if not found then
        raise exception 'La existencia de "%" cambió mientras se cobraba. Intenta otra vez.', v_linea.nombre;
      end if;

      insert into venta_items (venta_id, modelo_id, ubicacion_id, cantidad,
                               precio_unitario_usd, precio_unitario_bs,
                               precio_lista_usd, costo_puesto_usd_snap,
                               costo_operativo_usd_snap, motivo_rebaja)
      values (v_venta, v_linea.modelo_id, v_ex.ubicacion_id, v_toma,
              v_linea.precio_lux_usd, v_precio_bs,
              v_linea.precio_lista_usd, v_linea.costo_puesto_usd,
              v_operativo,
              case when v_linea.precio_lux_usd < v_linea.precio_lista_usd then 'revendedor' end);

      v_total_bs := v_total_bs + v_precio_bs * v_toma;
      v_falta := v_falta - v_toma;
      exit when v_falta = 0;
    end loop;

    if v_falta > 0 then
      raise exception 'De "%" faltan % en la tienda para entregar el apartado.', v_linea.nombre, v_falta;
    end if;
  end loop;

  update ventas
     set total_bs  = v_total_bs,
         total_usd = round(v_total_bs / v_tasa.tasa_venta, 4)
   where id = v_venta;

  update apartados
     set estado = 'retirado', retirado_en = now(), retirado_por = auth.uid(), venta_id = v_venta
   where id = a.id;

  return v_venta;
end;
$fn$;

revoke all on function cobrar_apartado(bigint, text, text, boolean) from public, anon;
grant execute on function cobrar_apartado(bigint, text, text, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 11. EL DUEÑO: CREARLOS, SU CÓDIGO Y CÓMO VAN
-- ---------------------------------------------------------------------

-- Crear o editar. Al crear devuelve el código de entrada UNA sola vez:
-- no se guarda, así que después solo se puede generar otro.
create or replace function admin_guardar_revendedor(
  p_id              bigint,
  p_nombre          text,
  p_usuario         text,
  p_telefono        text    default null,
  p_cedula          text    default null,
  p_catalogo_nombre text    default null,
  p_paleta          text    default 'lux',
  p_logo_path       text    default null,
  p_descuento_pct   numeric default null,
  p_tope_manual_usd numeric default null,
  p_activo          boolean default true,
  p_notas           text    default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_usuario text := lower(btrim(coalesce(p_usuario, '')));
  v_codigo  text;
  v_id      bigint;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede crear o cambiar revendedores.';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Falta el nombre.';
  end if;
  if v_usuario !~ '^[a-z0-9][a-z0-9-]{2,29}$' then
    raise exception 'El usuario va en el enlace: de 3 a 30 letras minúsculas, números o guiones, sin espacios ni acentos.';
  end if;

  begin
    if p_id is null then
      v_codigo := rv_codigo_nuevo();
      insert into revendedores (nombre, usuario, telefono, cedula, catalogo_nombre, paleta, logo_path,
                                descuento_pct, tope_manual_usd, activo, notas, clave_hash, creado_por)
      values (btrim(p_nombre), v_usuario, nullif(btrim(coalesce(p_telefono, '')), ''),
              nullif(btrim(coalesce(p_cedula, '')), ''), nullif(btrim(coalesce(p_catalogo_nombre, '')), ''),
              coalesce(nullif(btrim(coalesce(p_paleta, '')), ''), 'lux'), nullif(btrim(coalesce(p_logo_path, '')), ''),
              p_descuento_pct, p_tope_manual_usd, coalesce(p_activo, true),
              nullif(btrim(coalesce(p_notas, '')), ''), rv_huella_codigo(v_codigo), auth.uid())
      returning id into v_id;
    else
      update revendedores
         set nombre = btrim(p_nombre),
             usuario = v_usuario,
             telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
             cedula = nullif(btrim(coalesce(p_cedula, '')), ''),
             catalogo_nombre = nullif(btrim(coalesce(p_catalogo_nombre, '')), ''),
             paleta = coalesce(nullif(btrim(coalesce(p_paleta, '')), ''), 'lux'),
             logo_path = nullif(btrim(coalesce(p_logo_path, '')), ''),
             descuento_pct = p_descuento_pct,
             tope_manual_usd = p_tope_manual_usd,
             activo = coalesce(p_activo, true),
             notas = nullif(btrim(coalesce(p_notas, '')), '')
       where id = p_id
      returning id into v_id;
      if v_id is null then
        raise exception 'Ese revendedor no existe.';
      end if;
      -- Pausarlo cierra sus sesiones en el acto.
      if not coalesce(p_activo, true) then
        delete from revendedor_sesiones where revendedor_id = v_id;
      end if;
    end if;
  exception
    when unique_violation then
      raise exception 'Ya hay un revendedor con el usuario "%". Elige otro.', v_usuario;
    when check_violation then
      raise exception 'Revisa los datos: el nombre va de 2 a 80 letras, el del catálogo de 2 a 60, el descuento entre 0 y 100 y el tope no puede ser negativo.';
  end;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end;
$fn$;

revoke all on function admin_guardar_revendedor(bigint, text, text, text, text, text, text, text, numeric, numeric, boolean, text) from public, anon;
grant execute on function admin_guardar_revendedor(bigint, text, text, text, text, text, text, text, numeric, numeric, boolean, text) to authenticated;

-- Un código nuevo: el viejo deja de servir y sus sesiones se cierran.
create or replace function admin_codigo_revendedor(p_id bigint)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_codigo text := rv_codigo_nuevo();
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede dar un código nuevo.';
  end if;
  update revendedores set clave_hash = rv_huella_codigo(v_codigo) where id = p_id;
  if not found then
    raise exception 'Ese revendedor no existe.';
  end if;
  delete from revendedor_sesiones where revendedor_id = p_id;
  return v_codigo;
end;
$fn$;

revoke all on function admin_codigo_revendedor(bigint) from public, anon;
grant execute on function admin_codigo_revendedor(bigint) to authenticated;

-- Soltar un apartado desde la tienda: una pieza se dañó, o el dueño lo
-- decide. Queda cancelado por la tienda, no cuenta como vencido.
create or replace function admin_cancelar_apartado(p_apartado_id bigint, p_motivo text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede soltar el apartado de un revendedor.';
  end if;
  update apartados
     set estado = 'cancelado', cancelado_en = now(), cancelado_por = 'tienda',
         motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_apartado_id and estado = 'abierto' and cerrado_en is null;
  if not found then
    raise exception 'Ese apartado ya no está abierto.';
  end if;
end;
$fn$;

revoke all on function admin_cancelar_apartado(bigint, text) from public, anon;
grant execute on function admin_cancelar_apartado(bigint, text) to authenticated;

-- Cómo va cada uno. Solo el dueño.
create or replace view v_revendedores
with (security_invoker = off) as
select
  r.id,
  r.nombre,
  r.usuario,
  r.telefono,
  r.cedula,
  r.catalogo_nombre,
  r.paleta,
  r.logo_path,
  r.descuento_pct,
  rv_descuento_de(r.id) as descuento_efectivo_pct,
  r.tope_manual_usd,
  r.activo,
  r.notas,
  r.creado_en,
  t.nivel,
  t.niveles,
  t.tope_usd,
  t.usado_usd,
  t.libre_usd,
  t.retirado_usd,
  t.siguiente_tope_usd,
  t.falta_para_subir_usd,
  t.vencidos_recientes,
  t.bajado,
  s.abiertos,
  s.piezas_mes,
  s.pagado_mes_usd,
  s.clientas,
  s.ultima_actividad
from revendedores r
cross join lateral rv_tope(r.id) t
cross join lateral (
  select
    (select count(*)::int from apartados a
      where a.revendedor_id = r.id and a.estado = 'abierto' and a.expira_en > now()) as abiertos,
    (select coalesce(sum(i.cantidad), 0)::int from apartados a join apartado_items i on i.apartado_id = a.id
      where a.revendedor_id = r.id and a.estado = 'retirado'
        and a.retirado_en >= date_trunc('month', now())) as piezas_mes,
    (select coalesce(sum(i.precio_lux_usd * i.cantidad), 0) from apartados a join apartado_items i on i.apartado_id = a.id
      where a.revendedor_id = r.id and a.estado = 'retirado'
        and a.retirado_en >= date_trunc('month', now())) as pagado_mes_usd,
    (select count(*)::int from revendedor_clientes c where c.revendedor_id = r.id) as clientas,
    (select max(greatest(a.creado_en, coalesce(a.retirado_en, a.creado_en))) from apartados a
      where a.revendedor_id = r.id) as ultima_actividad
) s
where es_admin();

revoke all on v_revendedores from anon;
grant select on v_revendedores to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--
-- 1. Con sesión de administrador, en la pantalla Revendedores, crea uno
--    de prueba. La pantalla enseña su código UNA vez (XXXX-XXXX-XXXX).
--
-- 2. En el SQL Editor, las cifras de una pieza de etiqueta $20 BCV con
--    margen sano (su piso de margen por debajo de $15):
--
--      select rv_precio_lux(<id de la pieza>, 25);     -- 15.00
--      select rv_minimo_clienta(20);                   -- 20.10
--
--    Y una de margen fino, cuyo piso de margen sea $17,30: le sale en
--    17.30, no en 15, y en su catálogo gana menos. Si el piso es $20 o
--    más, la pieza no aparece en su catálogo.
--
-- 3. El tope de uno recién creado:
--
--      select nivel, tope_usd, usado_usd, falta_para_subir_usd
--        from rv_tope(<id>);
--      -- 1 | 100 | 0 | 200
--
-- 4. Aparta una pieza desde /#/r/<usuario>. En el mostrador la ubicación
--    donde más hay de esa pieza muestra una menos y "1 apartada"; en el
--    catálogo de la tienda también baja. En Pedidos sale en "Apartados
--    de revendedores" con lo que él paga.
--
-- 5. Sin sesión, nada de esto responde a la consola:
--
--      select * from revendedores;           -- permiso denegado
--      select * from v_revendedores;         -- permiso denegado
--      select rv_precio_lux(1, 25);          -- permiso denegado
--
--    `npm run verificar` lo comprueba con la clienta y con la vendedora.
-- =====================================================================
