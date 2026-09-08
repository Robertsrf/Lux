# Estado del proyecto

Cierre de la auditoría del 7 de septiembre de 2026. Este archivo responde a una
sola pregunta: si mañana otra persona toma este sistema, ¿qué necesita saber para
no romperlo?

Para instalarlo desde cero, **INSTALACION.md**. Para entender por qué es como es,
**PLAN.md**. Para convenciones de código y de dinero, las skills en
`.claude/skills/`. Esto es lo demás.

---

## 1. Qué es, en tres líneas

Sistema de inventario, punto de venta y catálogo de Lux by Emory, una joyería
hipoalergénica en Sabana de Mendoza, Venezuela. Vite, React 19, TypeScript
estricto, CSS plano sin Tailwind, Supabase detrás y GitHub Pages delante. Tres
usuarios: dos administradores y una vendedora.

## 2. La regla que manda sobre todas

**La vendedora no puede ver un solo número de costo.** No es una preferencia de
interfaz: es la regla de negocio. Y no basta con esconderlo de la pantalla,
porque el sitio es estático y cualquiera puede abrir la consola del navegador y
consultar la base con su propia sesión.

Por eso los costos no se protegen en el código sino en Postgres, con tres capas:

1. Las tablas con costo (`modelos`, `lotes`, `venta_items`) están revocadas
   incluso para el administrador. Se leen por sus vistas.
2. Las vistas de costo filtran con `es_admin()` y son de definidor.
3. Las funciones que revelan costo están revocadas de `authenticated`.

Nada de esto lo comprueba el compilador. Se rompe callado. Por eso existe
`npm run verificar`, que es lo primero que hay que correr después de tocar una
vista, un permiso, una función o una política.

## 3. Las dos monedas, que es lo que más confunde

La mercancía se compra en dólares Binance. Los gastos de la tienda (alquiler,
sueldos, servicios) se pagan en dólares BCV. La brecha entre las dos tasas
multiplica **solo la mercancía**, nunca los gastos.

```
costo BCV = costo_puesto × brecha × merma + gastos_de_tienda
precio    = costo BCV / (1 − margen)
```

El objetivo de ganancia que fija el dueño es en dólares BCV. Confundir esto
infla todos los precios de la tienda a la vez, y ya pasó una vez.

## 4. Dónde está cada cosa

```
src/paginas/venta/       lo que usa la vendedora. Va en el bundle principal.
src/paginas/admin/       lo que usa el dueño. Viaja en archivos aparte.
src/paginas/publico/     el catálogo que se comparte por WhatsApp. Sin sesión.
src/lib/dinero.ts        toda la aritmética de dinero y tasas.
src/lib/tipos.ts         el contrato con cada vista de la base.
esquema*.sql             31 migraciones, en el orden de INSTALACION.md.
scripts/verificar.mjs    37 comprobaciones de seguridad.
scripts/respaldar.mjs    el respaldo, por HTTPS.
```

Cuatro archivos `.sql` están **sellados**: lanzan excepción en su primera línea.
Se quedan como historia. INSTALACION.md dice cuáles y por qué.

## 5. Estado al cerrar la auditoría

Todo lo diagnosticado está corregido o anotado como pendiente del dueño.

```
carga de la clienta       ≈183 KB → ≈159 KB gzip
login de la vendedora     3 viajes → 1 viaje
filtro del catálogo       88 filas → 11 filas
funciones de costo abiertas   3 → 0
índices de clave foránea que faltaban   10 → 0
modelos activos sin lote      1 → 0
tsc, npm audit, npm run verificar    limpios
```

Pendiente, y le toca al dueño:

1. Cambiar el PIN de la vendedora. El actual está en el historial público de
   git. Entró en `c93d5c1` y se borró en `b66203b`, dentro de un script de
   verificación desechable; los mensajes de esos dos commits hablan de otra
   cosa, así que se encuentran con `git log --all -S "<la contraseña>"` y no
   leyendo el historial. Borrarlo del árbol no lo borra del historial: mientras
   el PIN no cambie, sigue ahí para quien lo busque. Se cambia con
   `node scripts/derivar-pin.mjs <PIN>` y pegando el resultado en Supabase.
   El código del administrador nunca entró al historial: comprobado.
2. Distinguir dos piezas activas que se llaman igual, `CIN-G25-001` y
   `CIN-G14-002`. El `update` está escrito y comentado al final de
   `esquema-correcciones-datos.sql`. No se hizo porque nada en los datos dice
   qué las diferencia, y no se inventan datos del catálogo.
3. Registrar una venta de prueba y anularla, para confirmar de primera mano que
   cerrar las funciones de costo no afectó el cobro. La evidencia indirecta dice
   que no, pero es indirecta.

## 6. Trampas que ya mordieron

Se documentan porque ninguna da error al escribirla.

**`create or replace view` solo sabe añadir columnas al final.** Si metes una en
medio, Postgres lo lee como un renombrado y se niega con `42P16`. Toda columna
nueva va al final, aunque quede fea.

**Una vista no te presta su permiso para ejecutar funciones.** Postgres comprueba
el `EXECUTE` contra quien consulta. Dentro de una función `security definer`, en
cambio, lo comprueba contra el dueño. De ahí sale el patrón de
`costo_operativo_admin()`: la envoltura existe porque revocar la función cruda a
secas habría dejado al administrador sin sus propias pantallas.

**`es_admin()` mira `auth.uid()`, no el rol de Postgres.** Sigue dando falso
dentro de una función de definidor. Poner el guardián dentro de una función que
usa la venta rompe la venta.

**Un agregado sin `GROUP BY` devuelve una fila aunque no entre ninguna.** Un
`where es_admin()` no alcanza ahí: hace falta `having es_admin()`. Así se le
escapaba una fila a la vendedora en `v_valor_inventario`.

**Los heredoc de Bash se comen las barras invertidas.** Así entró
`/^d{4}$/` donde iba `/^\d{4}$/`, un patrón que busca la palabra "dddd" y nunca
coincide con un PIN. Para editar código con barras invertidas, usa la herramienta
de edición, no un heredoc.

**Todos los `useMemo` van antes del primer `return` temprano.** Si no, React
lanza el error 310 en producción y no en desarrollo.

---

## 7. Cómo mantenerlo sano

### Respaldos

```bash
npm run respaldo            # datos y esquema, unos 8 segundos
npm run respaldo --fotos    # además las fotos, unos 2 minutos
```

Escribe en `../Respaldos Lux/<fecha>/`, **fuera del repositorio**, porque el
repositorio es público y el respaldo lleva cédulas y teléfonos de clientas,
costos y márgenes. El `.gitignore` tiene esa carpeta como cinturón por si alguien
cambia el destino.

Cadencia razonable: uno con fotos al cargar cada lote nuevo, y uno sin fotos
cada semana en que haya ventas. Sale con código 1 si algo falló, así que si
termina en silencio es que está completo.

El plan gratuito de Supabase no ofrece descarga de respaldos y el puerto 5432
está filtrado en la red de la tienda, por eso el respaldo va por HTTPS. Si algún
día se abre ese puerto, `pg_dump` sigue siendo mejor y este script sobra.

### Dependencias

```bash
npm outdated
npm audit --omit=dev
```

Al día de hoy, cero vulnerabilidades. La que hay que vigilar de verdad es
`@supabase/supabase-js`, porque es la que habla con la base y la que sostiene la
sesión. Las mayores de `vite` y `typescript` no corren prisa: este proyecto no
tiene tests, así que una mayor se prueba a mano o no se prueba.

Después de subir cualquier dependencia: `npm run build`, entrar con las dos
sesiones y abrir el catálogo público sin sesión.

### Vigilancia

No hay monitoreo automático y para una tienda de este tamaño tampoco hace falta.
Lo que sí hace falta es correr esto en los momentos correctos:

```bash
npm run verificar     # después de tocar vistas, permisos, funciones o políticas
npm run build         # antes de publicar
```

`verificar` sale con código 1 si algo se abrió, así que sirve dentro de un hook
de git o del workflow de despliegue si algún día se quiere automático.

Dentro del sistema, la pantalla **Verificación** hace comprobaciones parecidas
desde el navegador, con la sesión que tengas abierta. Es de administrador.

### Lo que caduca solo

**Las tasas.** El precio en bolívares sale de la tasa vigente. Si nadie la
actualiza, los precios quedan viejos sin avisar. Las ventas ya registradas no se
tocan: guardan su tasa congelada, y eso es a propósito.

**Supabase pausa el proyecto gratuito tras unos 7 días sin actividad.** Si la
tienda vende a diario no ocurre. Si ocurre, se reactiva con un clic y no se
pierde nada.

**El PIN.** Rótalo cuando cambie el personal. Son cuatro dígitos, diez mil
combinaciones, y el sitio es estático: cualquiera puede leer la receta en el
bundle. Aguanta porque la vendedora no puede ver ni borrar nada, no porque el
PIN sea fuerte. Los administradores usan contraseña larga real, y eso no se
cambia por comodidad.
