# Puesta en marcha

Todo lo que el sistema necesita para existir en una cuenta nueva. Si ya está
funcionando, esto sirve como referencia del orden de los SQL.

---

## 1. Supabase

Crea el proyecto y anota de **Project Settings → API**:

- **Project URL**
- **anon public key** — es pública por diseño: vive en el navegador y la protege
  RLS, no el secreto.

La **service_role key jamás** entra al repo, ni al navegador, ni a un chat. Si
alguna vez se filtra, se rota desde el panel de Supabase.

## 2. Los SQL, en este orden

En **SQL Editor**, uno por uno. Cada archivo dice en su cabecera de qué depende.

| # | Archivo | Qué trae |
|---|---|---|
| 1 | `esquema.sql` | Tablas, RLS, grupos de precio, tasas |
| 2 | `esquema-complemento.sql` | Vistas de admin y RPC de escritura |
| 3 | `esquema-seguridad-01.sql` | Cierra tres fugas de costo a la vendedora |
| 4 | `esquema-fase2.sql` | Ventas, cierre de caja, conteo |
| 5 | `esquema-parche-mayoreo.sql` | Arregla el mínimo de mayoreo |
| 6 | `esquema-fase3.sql` | Catálogo público, reservas, pedidos |
| 7 | `esquema-precios-bcv.sql` | Precio anclado al BCV y brecha |
| 8 | `esquema-descuentos.sql` | Tramos y kits por porcentaje |
| 9 | `esquema-regateo.sql` | Margen de negociación del mostrador |
| 10 | `esquema-parche-piso.sql` | Repara el catálogo caído por un permiso |
| 11 | `esquema-guia.sql` | La Guía del Colaborador dentro del sistema |
| 12 | `esquema-costos.sql` | Gastos del negocio dentro del precio |
| 13 | `esquema-inversiones.sql` | Vitrinas, muebles y barras de recuperación |
| 14 | `esquema-flete-y-gastos.sql` | **El modelo de costos vigente** |
| 15 | `esquema-grupos-nuevos.sql` | La escalera de siete grupos |
| 16 | `esquema-frases.sql` | Quita consejos duplicados y pone su llave única |
| 17 | `esquema-banco-frases.sql` | Las 222 frases del banco de la casa |

### Los que NO se corren

Cuatro archivos están **sellados**: lanzan una excepción en su primera línea.
Se quedan en el repo como historia de por qué el modelo es como es.

- `esquema-margen-real.sql`, `esquema-diagnostico.sql`, `esquema-objetivo-bcv.sql`
  — los reemplaza `esquema-flete-y-gastos.sql`. Correrlos revertiría las
  fórmulas **en silencio**.
- `esquema-limpieza-pruebas.sql` — **borra todos los datos**. Se escribió para
  limpiar las pruebas de las tres fases y ya cumplió.

## 3. Los tres usuarios

En **Authentication → Users**, crea tres con correo sintético:

| Correo | Contraseña | Rol |
|---|---|---|
| `admin@lux.local` | larga y real, nunca un PIN | admin |
| `socio@lux.local` | larga y real | admin |
| `vendedora@lux.local` | `node scripts/derivar-pin.mjs <PIN>` | vendedora |

Luego, en `perfiles`, ponle a cada uno su `rol` y su `nombre`.

**El código del administrador ve costos, márgenes y puede retirar inventario, y
este sitio es estático.** Tiene que ser largo y no solo dígitos: seis cifras
numéricas son un millón de combinaciones y se prueban enteras. Activa además el
rate limiting de Auth en Supabase.

## 4. El bucket de fotos

**Storage → New bucket** llamado `modelos`, **público**. Las fotos del catálogo
se comparten por enlace; no hay nada privado en ellas.

## 5. Local

```bash
cp .env.example .env      # y rellena URL y anon key
npm install
npm run logos             # regenera los assets de marca
npm run dev
```

## 6. GitHub Pages

En **Settings → Secrets and variables → Actions → Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

En **Settings → Pages**, source **GitHub Actions**. Cada push a `main` despliega
con `.github/workflows/desplegar.yml`.

---

## Comprobar que quedó bien

Entra con **los dos códigos** y abre **Verificación**. Son nueve pruebas por
rol: tablas revocadas, vistas de costo vacías para la vendedora, la nómina
rechazada para todos.

**Si falla una de las de fuga, no sigas.** Significa que la vendedora está
viendo algo que no debería.
