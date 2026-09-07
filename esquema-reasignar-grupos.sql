-- =====================================================================
-- Lux by Emory — vuelve a poner cada pieza en el grupo que le toca
-- Ejecutar en el SQL Editor CADA VEZ que se cargue un lote nuevo.
--
-- POR QUÉ HACE FALTA
-- El grupo se elige al cargar la pieza, y ahí es fácil que quede mal: se
-- escoge antes de teclear el costo final, o se pone a mano guiándose por
-- el SKU. Nada avisa después.
--
-- Una auditoría de las 81 piezas cargadas encontró 20 fuera de sitio:
-- 19 por debajo del margen objetivo -una de ellas en 29,8 %, cinco
-- dólares por debajo de lo que debería costar- y una inflada tres
-- dólares sin razón.
--
-- Esto lo corrige de una pasada, con la misma fórmula de
-- `admin_sugerir_precio`, para que no existan dos verdades:
--
--   precio ideal = costo_total_bcv / (1 − margen objetivo)
--   grupo        = el más barato que cubra ese ideal
--
-- SE PUEDE CORRER LAS VECES QUE HAGA FALTA
-- Solo toca las piezas que están mal. Si todo está en su sitio, no
-- cambia nada y lo dice.
--
-- LO QUE NO TOCA
-- Las piezas con precio propio. Ese precio se puso a conciencia y el
-- sistema no tiene por qué discutirlo; si se quiere que vuelvan a la
-- escalera, se les quita el precio propio primero.
-- =====================================================================

create or replace function admin_reasignar_grupos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_margen  numeric;
  v_movidas int;
  v_altas   int;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede reasignar precios.';
  end if;

  select least(coalesce(valor, 45), 99) / 100 into v_margen
    from configuracion where clave = 'margen_objetivo_pct';
  v_margen := coalesce(v_margen, 0.45);

  with ideal as (
    select
      mo.id,
      round(costo_total_bcv(mo.costo_puesto_usd) / (1 - v_margen), 4) as precio_ideal
    from modelos mo
    where mo.activo and mo.precio_override_usd is null
  ),
  destino as (
    select
      i.id,
      coalesce(
        (select g.id from grupos_precio g
          where g.activo and g.precio_usd >= i.precio_ideal
          order by g.precio_usd asc limit 1),
        -- Si ninguno llega, al más alto: el inventario lo delata con un
        -- margen bajo, que es mejor que dejarlo sin precio.
        (select g.id from grupos_precio g where g.activo order by g.precio_usd desc limit 1)
      ) as grupo_id
    from ideal i
  ),
  movidas as (
    update modelos m
       set grupo_precio_id = d.grupo_id,
           actualizado_en  = now()
      from destino d
     where d.id = m.id
       and d.grupo_id is not null
       and m.grupo_precio_id is distinct from d.grupo_id
    returning 1
  )
  select count(*) into v_movidas from movidas;

  -- Cuántas siguen sin llegar al objetivo aunque estén en el grupo más
  -- alto: esas piden un grupo nuevo, no una reasignación.
  select count(*) into v_altas
    from modelos mo
    join grupos_precio g on g.id = mo.grupo_precio_id
   where mo.activo
     and mo.precio_override_usd is null
     and g.precio_usd < costo_total_bcv(mo.costo_puesto_usd) / (1 - v_margen);

  return jsonb_build_object(
    'margen_objetivo_pct', round(v_margen * 100, 1),
    'piezas_movidas', v_movidas,
    'sin_grupo_que_alcance', v_altas);
end;
$fn$;

revoke all on function admin_reasignar_grupos() from public, anon;
grant execute on function admin_reasignar_grupos() to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- CÓRRELO ASÍ
--   select admin_reasignar_grupos();
--
-- Devuelve cuántas movió y cuántas se quedaron sin un grupo que las
-- cubra. Si esa segunda cifra no es cero, hace falta crear un grupo más
-- alto: reasignar no puede inventar un precio que no existe.
-- =====================================================================
