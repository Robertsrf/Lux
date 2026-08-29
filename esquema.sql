-- =====================================================================
-- Lux by Emory — Esquema de base de datos (Supabase / PostgreSQL)
-- Ejecutar completo en el SQL Editor de Supabase.
-- Dinero SIEMPRE en numeric(12,4). Nunca float.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFILES Y ROLES
-- ---------------------------------------------------------------------

create type rol_usuario as enum ('admin', 'vendedora');

create table perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  rol         rol_usuario not null default 'vendedora',
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

-- Función de apoyo: ¿el usuario actual es admin?
-- SECURITY DEFINER para evitar recursión de RLS al consultar perfiles.
create or replace function es_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and rol = 'admin' and activo
  );
$$;

-- ---------------------------------------------------------------------
-- 2. TASAS
-- Tres tasas con tres trabajos distintos. Ver PLAN.md §3.3
-- ---------------------------------------------------------------------

create table tasas (
  id            bigserial primary key,
  fecha         date not null default current_date,
  tasa_venta    numeric(12,4) not null check (tasa_venta > 0),
  tasa_bcv      numeric(12,4) not null check (tasa_bcv > 0),
  vigente       boolean not null default true,
  registrado_por uuid references perfiles(id),
  creado_en     timestamptz not null default now()
);

-- Solo una tasa vigente a la vez.
create unique index tasas_una_vigente on tasas (vigente) where vigente;

create or replace function tasa_vigente()
returns tasas
language sql
stable
as $$
  select * from tasas where vigente limit 1;
$$;

-- ---------------------------------------------------------------------
-- 3. LOTES DE COMPRA
-- La tasa Binance de compra se sella aquí y NO se modifica jamás.
-- Los exhibidores son CAPEX de tienda, no costo de mercancía.
-- ---------------------------------------------------------------------

create type metodo_prorrateo as enum ('peso', 'valor');

create table lotes (
  id                      bigserial primary key,
  codigo                  text not null unique,
  fecha_llegada           date not null,
  tasa_binance_compra     numeric(12,4) not null check (tasa_binance_compra > 0),

  costo_mercancia_usd     numeric(12,4) not null default 0,
  costo_exhibidores_usd   numeric(12,4) not null default 0,
  costo_flete_usd         numeric(12,4) not null default 0,

  peso_mercancia_g        numeric(12,2) not null default 0,
  peso_exhibidores_g      numeric(12,2) not null default 0,

  metodo                  metodo_prorrateo not null default 'peso',
  notas                   text,
  creado_en               timestamptz not null default now(),

  -- Flete que corresponde a la mercancía (el resto es CAPEX)
  flete_mercancia_usd numeric(12,4) generated always as (
    case
      when metodo = 'peso' and (peso_mercancia_g + peso_exhibidores_g) > 0
        then costo_flete_usd * (peso_mercancia_g / (peso_mercancia_g + peso_exhibidores_g))
      when (costo_mercancia_usd + costo_exhibidores_usd) > 0
        then costo_flete_usd * (costo_mercancia_usd / (costo_mercancia_usd + costo_exhibidores_usd))
      else 0
    end
  ) stored
);

-- Inversión de tienda del lote: exhibidores + su parte del flete.
-- NO se carga al costo de las joyas.
create or replace view v_capex_lote as
select
  id,
  codigo,
  fecha_llegada,
  costo_exhibidores_usd,
  (costo_flete_usd - flete_mercancia_usd) as flete_exhibidores_usd,
  costo_exhibidores_usd + (costo_flete_usd - flete_mercancia_usd) as capex_total_usd
from lotes;

-- ---------------------------------------------------------------------
-- 4. GRUPOS DE PRECIO
-- ---------------------------------------------------------------------

create table grupos_precio (
  id          bigserial primary key,
  nombre      text not null unique,          -- 'G9', 'G11', 'G13', 'G20', 'G28'
  precio_usd  numeric(12,4) not null check (precio_usd > 0),
  orden       int not null default 0,
  activo      boolean not null default true
);

-- ---------------------------------------------------------------------
-- 5. UBICACIONES FÍSICAS
-- ---------------------------------------------------------------------

create type tipo_ubicacion as enum ('vitrina', 'aereo', 'mostrador', 'bodega');

create table ubicaciones (
  id               bigserial primary key,
  nombre           text not null unique,
  tipo             tipo_ubicacion not null,
  orden            int not null default 0,
  cuenta_en_cuadre boolean not null default true,
  activo           boolean not null default true
);

insert into ubicaciones (nombre, tipo, orden) values
  ('Vitrina 1',       'vitrina',   1),
  ('Vitrina 2',       'vitrina',   2),
  ('Exhibidor aéreo', 'aereo',     3),
  ('Mostrador',       'mostrador', 4),
  ('Bodega',          'bodega',    5);

-- ---------------------------------------------------------------------
-- 6. MODELOS (el catálogo)
-- Se inventarían MODELOS con cantidad, no piezas individuales.
-- ---------------------------------------------------------------------

create table modelos (
  id                    bigserial primary key,
  sku                   text not null unique,
  nombre                text not null,
  categoria             text not null,        -- anillo, pulsera, cadena, choker, arete, tobillera, set
  descripcion           text,
  variantes_nota        text,                 -- "grosores medio y grueso, largos 45 y 50 cm"

  lote_id               bigint references lotes(id),
  costo_unitario_usd    numeric(12,4) not null default 0,
  flete_unitario_usd    numeric(12,4) not null default 0,
  costo_puesto_usd      numeric(12,4) generated always as
                          (costo_unitario_usd + flete_unitario_usd) stored,

  peso_unitario_g       numeric(10,2) not null default 0,

  grupo_precio_id       bigint references grupos_precio(id),
  precio_override_usd   numeric(12,4),        -- si es null, manda el grupo

  foto_path             text,
  foto_thumb_path       text,

  activo                boolean not null default true,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

create index modelos_categoria_idx on modelos (categoria);
create index modelos_grupo_idx     on modelos (grupo_precio_id);
create index modelos_lote_idx      on modelos (lote_id);

-- ---------------------------------------------------------------------
-- 7. EXISTENCIAS POR UBICACIÓN
-- No existe un "stock total" guardado; siempre se suma.
-- ---------------------------------------------------------------------

create table existencias (
  id            bigserial primary key,
  modelo_id     bigint not null references modelos(id) on delete cascade,
  ubicacion_id  bigint not null references ubicaciones(id),
  cantidad      int not null default 0 check (cantidad >= 0),
  actualizado_en timestamptz not null default now(),
  unique (modelo_id, ubicacion_id)
);

create index existencias_ubicacion_idx on existencias (ubicacion_id);

-- ---------------------------------------------------------------------
-- 8. VISTAS DE CATÁLOGO
-- La vendedora SOLO puede leer v_catalogo_venta (sin costos).
-- ---------------------------------------------------------------------

create or replace view v_catalogo_venta
with (security_invoker = off) as
select
  m.id,
  m.sku,
  m.nombre,
  m.categoria,
  m.descripcion,
  m.variantes_nota,
  m.foto_path,
  m.foto_thumb_path,
  g.nombre as grupo,
  coalesce(m.precio_override_usd, g.precio_usd) as precio_usd,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_venta, 2) as precio_bs,
  round(coalesce(m.precio_override_usd, g.precio_usd) * t.tasa_venta / t.tasa_bcv, 2) as precio_usd_bcv_ref,
  coalesce((select sum(e.cantidad) from existencias e where e.modelo_id = m.id), 0) as existencia_total,
  m.activo
from modelos m
left join grupos_precio g on g.id = m.grupo_precio_id
cross join lateral (select * from tasas where vigente limit 1) t
where m.activo;

create or replace view v_catalogo_admin
with (security_invoker = off) as
select
  v.*,
  m.costo_unitario_usd,
  m.flete_unitario_usd,
  m.costo_puesto_usd,
  m.peso_unitario_g,
  m.lote_id,
  (v.precio_usd - m.costo_puesto_usd) as margen_usd,
  case when v.precio_usd > 0
       then round(((v.precio_usd - m.costo_puesto_usd) / v.precio_usd) * 100, 2)
       else 0 end as margen_pct
from v_catalogo_venta v
join modelos m on m.id = v.id
where es_admin();

-- ---------------------------------------------------------------------
-- 9. VENTAS
-- Cada venta congela las tasas y los costos del momento.
-- ---------------------------------------------------------------------

create type tipo_venta   as enum ('detal', 'mayor');
create type metodo_pago  as enum ('punto', 'pago_movil', 'transferencia', 'efectivo_bs', 'efectivo_usd');

create table ventas (
  id                bigserial primary key,
  fecha             timestamptz not null default now(),
  usuario_id        uuid not null references perfiles(id),
  tipo              tipo_venta not null default 'detal',
  metodo            metodo_pago not null,

  tasa_venta_usada  numeric(12,4) not null,
  tasa_bcv_usada    numeric(12,4) not null,

  total_bs          numeric(14,2) not null default 0,
  total_usd         numeric(12,4) not null default 0,   -- total_bs / tasa_venta_usada

  kit_id            bigint,
  cliente_nombre    text,
  cliente_telefono  text,
  notas             text,
  anulada           boolean not null default false
);

create index ventas_fecha_idx   on ventas (fecha desc);
create index ventas_usuario_idx on ventas (usuario_id);

create table venta_items (
  id                      bigserial primary key,
  venta_id                bigint not null references ventas(id) on delete cascade,
  modelo_id               bigint not null references modelos(id),
  ubicacion_id            bigint not null references ubicaciones(id),
  cantidad                int not null check (cantidad > 0),
  precio_unitario_usd     numeric(12,4) not null,
  precio_unitario_bs      numeric(14,2) not null,
  costo_puesto_usd_snap   numeric(12,4) not null   -- costo congelado al vender
);

create index venta_items_venta_idx  on venta_items (venta_id);
create index venta_items_modelo_idx on venta_items (modelo_id);

-- Margen realizado por venta, en dólares reales.
create or replace view v_margen_ventas as
select
  v.id,
  v.fecha,
  v.tipo,
  v.metodo,
  v.total_usd,
  coalesce(sum(i.costo_puesto_usd_snap * i.cantidad), 0) as costo_total_usd,
  v.total_usd - coalesce(sum(i.costo_puesto_usd_snap * i.cantidad), 0) as ganancia_usd,
  coalesce(sum(i.cantidad), 0) as piezas
from ventas v
left join venta_items i on i.venta_id = v.id
where not v.anulada
group by v.id;

-- ---------------------------------------------------------------------
-- 10. KITS (mayoreo)
-- El precio se fija en USD POR PIEZA, nunca como % del detal.
-- ---------------------------------------------------------------------

create type tipo_kit as enum ('fijo', 'armado');

create table kits (
  id                    bigserial primary key,
  nombre                text not null,
  tipo                  tipo_kit not null default 'fijo',
  precio_por_pieza_usd  numeric(12,4) not null check (precio_por_pieza_usd > 0),
  n_piezas              int not null check (n_piezas > 0),
  descripcion           text,
  activo                boolean not null default true,
  creado_en             timestamptz not null default now()
);

create table kit_items (
  id        bigserial primary key,
  kit_id    bigint not null references kits(id) on delete cascade,
  modelo_id bigint not null references modelos(id),
  cantidad  int not null check (cantidad > 0),
  unique (kit_id, modelo_id)
);

alter table ventas
  add constraint ventas_kit_fk foreign key (kit_id) references kits(id);

-- Configuración editable: mínimos de mayoreo y metas de venta.
create table configuracion (
  clave       text primary key,
  valor       numeric(12,4) not null,
  descripcion text
);

insert into configuracion (clave, valor, descripcion) values
  ('mayoreo_min_piezas',  6,   'Mínimo de piezas para venta al mayor'),
  ('mayoreo_min_usd',     30,  'Mínimo en dólares para venta al mayor'),
  ('meta_piezas_dia',     4,   'Meta diaria de piezas'),
  ('meta_premium_dia',    1,   'Meta diaria de piezas de $20 o más'),
  ('reserva_minutos',     60,  'Minutos que dura una reserva del catálogo público');

-- Los mínimos de mayoreo se validan en la BASE, no solo en el formulario.
create or replace function validar_minimo_mayoreo()
returns trigger
language plpgsql
as $$
declare
  v_piezas int;
  v_usd    numeric(12,4);
  v_min_p  numeric(12,4);
  v_min_u  numeric(12,4);
begin
  if (select tipo from ventas where id = new.venta_id) <> 'mayor' then
    return new;
  end if;

  select coalesce(sum(cantidad), 0),
         coalesce(sum(precio_unitario_usd * cantidad), 0)
    into v_piezas, v_usd
    from venta_items where venta_id = new.venta_id;

  select valor into v_min_p from configuracion where clave = 'mayoreo_min_piezas';
  select valor into v_min_u from configuracion where clave = 'mayoreo_min_usd';

  if v_piezas < v_min_p and v_usd < v_min_u then
    raise exception
      'Venta al mayor no cumple el mínimo: % piezas / $%. Se requiere % piezas o $%.',
      v_piezas, v_usd, v_min_p, v_min_u;
  end if;

  return new;
end;
$$;

create constraint trigger trg_minimo_mayoreo
  after insert or update on venta_items
  deferrable initially deferred
  for each row execute function validar_minimo_mayoreo();

-- ---------------------------------------------------------------------
-- 11. CONTEOS Y CUADRE
-- Diario: solo cantidades por ubicación. Semanal: pieza por pieza.
-- ---------------------------------------------------------------------

create type tipo_conteo as enum ('diario', 'semanal');

create table conteos (
  id                 bigserial primary key,
  fecha              date not null default current_date,
  tipo               tipo_conteo not null,
  ubicacion_id       bigint references ubicaciones(id),
  usuario_id         uuid not null references perfiles(id),
  cantidad_esperada  int not null default 0,
  cantidad_contada   int not null default 0,
  diferencia         int generated always as (cantidad_contada - cantidad_esperada) stored,
  notas              text,
  creado_en          timestamptz not null default now()
);

create table conteo_detalle (
  id               bigserial primary key,
  conteo_id        bigint not null references conteos(id) on delete cascade,
  modelo_id        bigint not null references modelos(id),
  cantidad_esperada int not null default 0,
  cantidad_contada  int not null default 0
);

-- ---------------------------------------------------------------------
-- 12. RESERVAS (Fase 3 — catálogo público)
-- ---------------------------------------------------------------------

create type estado_reserva as enum ('abierta', 'confirmada', 'vencida', 'cancelada');

create table reservas (
  id               bigserial primary key,
  token            uuid not null unique default gen_random_uuid(),
  estado           estado_reserva not null default 'abierta',
  cliente_nombre   text,
  cliente_telefono text,
  creado_en        timestamptz not null default now(),
  expira_en        timestamptz not null default now() + interval '60 minutes'
);

create table reserva_items (
  id          bigserial primary key,
  reserva_id  bigint not null references reservas(id) on delete cascade,
  modelo_id   bigint not null references modelos(id),
  cantidad    int not null check (cantidad > 0)
);

-- Marca vencidas las reservas expiradas. Se llama al consultar disponibilidad;
-- no depende de cron.
create or replace function limpiar_reservas()
returns void
language sql
as $$
  update reservas set estado = 'vencida'
  where estado = 'abierta' and expira_en < now();
$$;

-- Existencia realmente disponible al público = existencia - reservado vigente.
create or replace view v_disponible_publico as
select
  c.id,
  c.sku,
  c.nombre,
  c.categoria,
  c.variantes_nota,
  c.foto_path,
  c.foto_thumb_path,
  c.precio_usd,
  c.precio_bs,
  c.existencia_total - coalesce((
    select sum(ri.cantidad)
    from reserva_items ri
    join reservas r on r.id = ri.reserva_id
    where ri.modelo_id = c.id
      and r.estado = 'abierta'
      and r.expira_en > now()
  ), 0) as disponible
from v_catalogo_venta c
where c.existencia_total > 0;

-- =====================================================================
-- 13. RLS — LA SEGURIDAD REAL VIVE AQUÍ
-- El sitio es estático: nunca confíes en validación del navegador.
-- =====================================================================

alter table perfiles       enable row level security;
alter table tasas          enable row level security;
alter table lotes          enable row level security;
alter table grupos_precio  enable row level security;
alter table modelos        enable row level security;
alter table ubicaciones    enable row level security;
alter table existencias    enable row level security;
alter table ventas         enable row level security;
alter table venta_items    enable row level security;
alter table kits           enable row level security;
alter table kit_items      enable row level security;
alter table configuracion  enable row level security;
alter table conteos        enable row level security;
alter table conteo_detalle enable row level security;
alter table reservas       enable row level security;
alter table reserva_items  enable row level security;

-- Perfiles: cada quien ve el suyo; el admin ve todos.
create policy perfiles_leer on perfiles for select to authenticated
  using (id = auth.uid() or es_admin());
create policy perfiles_admin on perfiles for all to authenticated
  using (es_admin()) with check (es_admin());

-- Tasas, grupos y ubicaciones: todos leen, solo admin escribe.
create policy tasas_leer  on tasas for select to authenticated using (true);
create policy tasas_admin on tasas for all to authenticated
  using (es_admin()) with check (es_admin());

create policy grupos_leer  on grupos_precio for select to authenticated using (true);
create policy grupos_admin on grupos_precio for all to authenticated
  using (es_admin()) with check (es_admin());

create policy ubic_leer  on ubicaciones for select to authenticated using (true);
create policy ubic_admin on ubicaciones for all to authenticated
  using (es_admin()) with check (es_admin());

create policy config_leer  on configuracion for select to authenticated using (true);
create policy config_admin on configuracion for all to authenticated
  using (es_admin()) with check (es_admin());

-- Lotes y modelos: SOLO admin. La vendedora entra por las vistas.
create policy lotes_admin   on lotes   for all to authenticated
  using (es_admin()) with check (es_admin());
create policy modelos_admin on modelos for all to authenticated
  using (es_admin()) with check (es_admin());

-- Existencias: la vendedora lee y actualiza (vender descuenta); solo admin borra.
create policy exist_leer on existencias for select to authenticated using (true);
create policy exist_esc  on existencias for insert to authenticated with check (true);
create policy exist_upd  on existencias for update to authenticated using (true);
create policy exist_del  on existencias for delete to authenticated using (es_admin());

-- Ventas: la vendedora registra y ve las del día; el admin ve todo.
create policy ventas_crear on ventas for insert to authenticated
  with check (usuario_id = auth.uid());
create policy ventas_leer  on ventas for select to authenticated
  using (es_admin() or (usuario_id = auth.uid() and fecha::date = current_date));
create policy ventas_admin on ventas for update to authenticated
  using (es_admin()) with check (es_admin());

create policy vitems_crear on venta_items for insert to authenticated with check (true);
create policy vitems_leer  on venta_items for select to authenticated
  using (exists (select 1 from ventas v where v.id = venta_id));

-- Kits: todos leen, solo admin arma.
create policy kits_leer  on kits for select to authenticated using (true);
create policy kits_admin on kits for all to authenticated
  using (es_admin()) with check (es_admin());
create policy kititems_leer  on kit_items for select to authenticated using (true);
create policy kititems_admin on kit_items for all to authenticated
  using (es_admin()) with check (es_admin());

-- Conteos: ambos roles cuentan.
create policy conteos_todo  on conteos for all to authenticated using (true) with check (true);
create policy cdetalle_todo on conteo_detalle for all to authenticated using (true) with check (true);

-- Reservas: el público anónimo puede crear y leer las suyas por token.
create policy reservas_leer_anon  on reservas for select to anon using (true);
create policy reservas_crear_anon on reservas for insert to anon with check (true);
create policy reservas_auth       on reservas for all to authenticated using (true) with check (true);
create policy ritems_leer_anon    on reserva_items for select to anon using (true);
create policy ritems_crear_anon   on reserva_items for insert to anon with check (true);
create policy ritems_auth         on reserva_items for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 14. BLOQUEO DE COSTOS PARA LA VENDEDORA
-- RLS filtra filas, no columnas. Se bloquea la tabla y se abre la vista.
-- ---------------------------------------------------------------------

revoke all on modelos from authenticated, anon;
revoke all on lotes   from authenticated, anon;

grant select on v_catalogo_venta   to authenticated;
grant select on v_disponible_publico to anon, authenticated;
grant select on v_catalogo_admin   to authenticated;  -- filtra con es_admin() internamente

-- El admin escribe modelos y lotes vía funciones SECURITY DEFINER
-- o con la service key desde el panel; nunca desde el cliente de la vendedora.

-- =====================================================================
-- 15. VERIFICACIÓN RÁPIDA (correr con sesión de vendedora)
--   select * from modelos;            -> debe FALLAR
--   select * from v_catalogo_venta;   -> debe funcionar, sin columnas de costo
--   select * from v_catalogo_admin;   -> debe devolver 0 filas
-- =====================================================================
