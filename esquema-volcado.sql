-- =====================================================================
-- Lux by Emory — leer el esquema real sin abrir un puerto
-- Ejecutar en el SQL Editor. Se puede borrar después, o dejarlo.
--
-- POR QUÉ EXISTE
-- `supabase db dump` necesita el puerto 5432 y en esta red está filtrado.
-- Comprobado desde la máquina del dueño: 5432 cerrado, 6543 cerrado,
-- 443 abierto. El CLI reintenta ocho veces y se rinde.
--
-- Pero el sistema entero habla con la base por HTTPS a través de
-- PostgREST, y eso sí pasa. Así que en vez de pelear con el puerto, se le
-- pregunta a la base por donde ya funciona. Estas funciones devuelven la
-- definición REAL de cada objeto, salida del catálogo de Postgres, no de
-- los .sql ni de la memoria de nadie.
--
-- PARA QUÉ SIRVE
-- Para poder escribir un `esquema-completo.sql` de una sola pieza y
-- COMPROBAR que no se desvía de lo que hay montado. Sin esto, el archivo
-- consolidado sería mi reconstrucción a ciegas.
--
-- SEGURIDAD
-- Son SECURITY DEFINER y comprueban es_admin() de entrada. Tiene que ser
-- así: `pg_get_functiondef` devuelve el cuerpo de las funciones, y ahí
-- viven las fórmulas de costo. Para la vendedora devuelven null.
--
-- Nada de esto escribe. Solo lee el catálogo.
-- =====================================================================

create or replace function admin_esquema_tablas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select case when not es_admin() then null else (
    select jsonb_agg(t order by t->>'tabla')
    from (
      select jsonb_build_object(
        'tabla', c.relname,
        'rls', c.relrowsecurity,
        'columnas', (
          select jsonb_agg(jsonb_build_object(
            'n', a.attnum,
            'nombre', a.attname,
            'tipo', format_type(a.atttypid, a.atttypmod),
            'nulo', not a.attnotnull,
            'defecto', pg_get_expr(d.adbin, d.adrelid),
            'generada', a.attgenerated <> ''
          ) order by a.attnum)
          from pg_attribute a
          left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        ),
        'restricciones', (
          select jsonb_agg(jsonb_build_object('nombre', co.conname,
                                              'def', pg_get_constraintdef(co.oid))
                           order by co.conname)
          from pg_constraint co where co.conrelid = c.oid
        ),
        'indices', (
          select jsonb_agg(pg_get_indexdef(i.indexrelid)
                           order by i.indexrelid::regclass::text)
          from pg_index i where i.indrelid = c.oid
        )
      ) as t
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ) s
  ) end;
$fn$;

create or replace function admin_esquema_vistas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select case when not es_admin() then null else (
    select jsonb_agg(jsonb_build_object(
             'vista', c.relname,
             'invocador', coalesce((select option_value
                                      from pg_options_to_table(c.reloptions)
                                     where option_name = 'security_invoker'), 'off'),
             'def', pg_get_viewdef(c.oid, true))
           order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  ) end;
$fn$;

-- Las funciones se piden por tandas: sus cuerpos son largos y de una sola
-- vez la respuesta se hace incómoda de manejar.
create or replace function admin_esquema_funciones(p_desde int default 0,
                                                   p_cuantas int default 20)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select case when not es_admin() then null else (
    select jsonb_build_object(
      'total', (select count(*)
                  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.prokind = 'f'),
      'desde', p_desde,
      'funciones', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nombre', q.proname,
                 'firma', pg_get_function_identity_arguments(q.oid),
                 'definidor', q.prosecdef,
                 'def', pg_get_functiondef(q.oid))
               order by q.proname, q.oid)
        from (
          select p.oid, p.proname, p.prosecdef
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
           order by p.proname, p.oid
          offset p_desde limit p_cuantas
        ) q
      ), '[]'::jsonb))
  ) end;
$fn$;

create or replace function admin_esquema_permisos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select case when not es_admin() then null else jsonb_build_object(
    'politicas', (
      select jsonb_agg(jsonb_build_object(
               'tabla', tablename, 'nombre', policyname, 'para', roles,
               'orden', cmd, 'using', qual, 'check', with_check)
             order by tablename, policyname)
      from pg_policies where schemaname = 'public'
    ),
    'tablas', (
      select jsonb_agg(distinct jsonb_build_object(
               'objeto', table_name, 'rol', grantee, 'permiso', privilege_type))
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee in ('anon', 'authenticated', 'service_role')
    ),
    'funciones', (
      select jsonb_agg(jsonb_build_object(
               'objeto', p.proname,
               'firma', pg_get_function_identity_arguments(p.oid),
               'anon', has_function_privilege('anon', p.oid, 'execute'),
               'authenticated', has_function_privilege('authenticated', p.oid, 'execute'))
             order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
    ),
    'triggers', (
      select jsonb_agg(jsonb_build_object(
               'tabla', c.relname, 'nombre', t.tgname,
               'def', pg_get_triggerdef(t.oid))
             order by c.relname, t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal
    ),
    'tipos', (
      select jsonb_agg(jsonb_build_object(
               'nombre', t.typname,
               'valores', (select jsonb_agg(e.enumlabel order by e.enumsortorder)
                             from pg_enum e where e.enumtypid = t.oid)))
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typtype = 'e'
    )
  ) end;
$fn$;

revoke all on function admin_esquema_tablas()             from public, anon;
revoke all on function admin_esquema_vistas()             from public, anon;
revoke all on function admin_esquema_funciones(int, int)  from public, anon;
revoke all on function admin_esquema_permisos()           from public, anon;

grant execute on function admin_esquema_tablas()            to authenticated;
grant execute on function admin_esquema_vistas()            to authenticated;
grant execute on function admin_esquema_funciones(int, int) to authenticated;
grant execute on function admin_esquema_permisos()          to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- COMPROBACIÓN
--   select jsonb_array_length(admin_esquema_tablas());
--   select jsonb_array_length(admin_esquema_vistas());
--   select admin_esquema_funciones(0, 5) -> 'total';
--
-- Con sesión de vendedora las cuatro devuelven null.
-- =====================================================================
