# Puesta en marcha — Fase 1

El codigo de la Fase 1 esta completo. Lo que falta son los pasos que solo se
pueden hacer con tu cuenta: crear el proyecto de Supabase, ejecutar el SQL y
crear los usuarios. Estan aqui en orden.

---

## 1. Supabase

1. Crea el proyecto (plan gratuito) en <https://supabase.com>.
2. SQL Editor → pega **`esquema.sql`** completo → Run.
3. SQL Editor → pega **`esquema-complemento.sql`** completo → Run.
   Este segundo archivo crea el bucket `fotos` con sus politicas y las funciones
   `admin_*` con las que el administrador escribe. Sin el, el admin no puede
   cargar modelos: `esquema.sql` revoca la tabla `modelos` para todos.
4. Authentication → Providers → Email: desactiva "Confirm email" o usa
   "Auto confirm" al crear cada usuario. Son correos sinteticos y no existen.
5. Authentication → Rate limits: deja activo el limite de intentos de login.
   Es la mitigacion real del PIN de 4 digitos.

### Los tres usuarios

Authentication → Users → Add user, con "Auto confirm user" activado:

| Correo | Contrasena | Rol |
|---|---|---|
| `admin@lux.local` | una contrasena larga real, tuya | admin |
| `socio@lux.local` | una contrasena larga real | admin |
| `vendedora@lux.local` | la que imprime `npm run pin -- 1234` | vendedora |

Para el PIN de la vendedora:

```bash
npm run pin -- 1234
```

Imprime la contrasena que le corresponde a ese PIN (`lux.1234.emory`). Si
cambias la receta en `src/lib/auth.ts`, cambia tambien `scripts/derivar-pin.mjs`.

### Las filas de perfiles

Despues de crear los tres usuarios, ejecuta esto en el SQL Editor. Busca cada
uuid por correo, asi no tienes que copiarlos a mano:

```sql
insert into perfiles (id, nombre, rol)
select id, 'Administrador', 'admin' from auth.users where email = 'admin@lux.local'
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol;

insert into perfiles (id, nombre, rol)
select id, 'Socio', 'admin' from auth.users where email = 'socio@lux.local'
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol;

insert into perfiles (id, nombre, rol)
select id, 'Vendedora', 'vendedora' from auth.users where email = 'vendedora@lux.local'
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol;

select p.nombre, p.rol, u.email from perfiles p join auth.users u on u.id = p.id;
```

### Claves del proyecto

Project Settings → API. Copia la **URL** y la **anon key**.
La `service_role` key no se usa en ningun lado de este repo. No la copies.

---

## 2. Correr en local

```bash
cp .env.example .env      # y pega URL y anon key
npm install
npm run dev
```

Abre lo que imprima Vite. Deberia aparecer el login con el wordmark de Lux.

---

## 3. GitHub Pages

1. Crea el repo en GitHub y sube esta carpeta.
2. Settings → Secrets and variables → Actions → **Variables** → New:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   Van como *variables*, no como secretos: la anon key es publica por diseno y
   de todos modos queda visible en el bundle.
3. Settings → Pages → Source: **GitHub Actions**.
4. Empuja a `main`. El workflow `.github/workflows/desplegar.yml` construye y
   publica solo.

El sitio usa `HashRouter` (rutas tipo `/#/admin/inventario`) y `base: './'`, asi
que funciona igual en un Pages de usuario que en uno de proyecto, sin el truco
del `404.html`.

---

## 4. Orden para cargar los datos reales

El sistema no trae ninguna cifra de negocio quemada, a proposito. Cargalas en
este orden, porque cada paso depende del anterior:

1. **Tasas** → fija `tasa_venta` y `tasa_bcv`. Sin tasa vigente no hay precios
   en bolivares en ninguna pantalla.
2. **Grupos** → G9, G11, G13, G20, G28 con su precio en dolares.
3. **Lotes** → el lote actual con su tasa Binance, costos, flete y pesos.
4. **Inventario → Cargar modelo** → los modelos, con foto y cantidad por
   ubicacion.
5. **Catalogo** → revisa e imprime.

---

## 5. Checklist de verificacion de la Fase 1

Cada punto del PLAN, y como comprobarlo:

| Punto | Como se comprueba |
|---|---|
| Los 3 usuarios entran | Entra con cada uno. El admin cae en Inventario; la vendedora, en Mostrador. |
| La vendedora no puede consultar `modelos`; `v_catalogo_venta` si, sin columnas de costo | Con sesion de vendedora, abre **Verificacion**. Las 5 pruebas deben decir "Pasa". |
| El lote de ejemplo da costo puesto $2,68 y CAPEX $320 | Registra un lote con mercancia 1000, exhibidores 200, flete 150, pesos 2000 y 8000, metodo peso. La tabla debe mostrar flete a mercancia **$30,00** y CAPEX **$320,00**. Carga un modelo de 12 g con costo 2,50 en ese lote: costo puesto **$2,6800**. |
| 10 modelos con foto de menos de 200 KB | Al elegir cada foto, el aviso dice cuanto peso quedo. Confirmalo tambien en Storage → `fotos`. |
| Cambiar la tasa repricia todo el catalogo | Anota un precio en Bs en Inventario, cambia la tasa de venta en Tasas, vuelve a Inventario. Cambio sin editar ningun modelo. |
| El PDF sale con la identidad de Lux y omite los modelos en cero | Catalogo → Imprimir. La portada lleva el monograma y el wordmark; solo aparecen los modelos con existencia. |
| El sitio carga en GitHub Pages desde un telefono | Abre la URL de Pages en el telefono de la tienda y entra con el PIN. |

Cuando los siete pasen, haz commit y arranca la Fase 2 en una sesion nueva.

---

## 6. Lo que este repo NO hace todavia

- Punto de venta, cobro, kits y cuadre diario: **Fase 2**.
- Catalogo publico, armador de kits y reservas: **Fase 3**.
- Los tipos de Supabase estan escritos a mano en `src/lib/tipos.ts` porque
  todavia no hay proyecto del que generarlos. Cuando exista, corre
  `supabase gen types typescript --project-id <id> > src/lib/basedatos.tipos.ts`
  y haz que `tipos.ts` derive de ahi.
