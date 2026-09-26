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
| 18 | `esquema-mensaje-catalogo.sql` | El texto que acompaña al enlace del catálogo |
| 19 | `esquema-pedido-completo.sql` | Datos del cliente, envío y pago en el pedido |
| 20 | `esquema-gastos-desglose.sql` | Los gastos del mes, partida por partida |
| 21 | `esquema-cobertura-mes.sql` | Cuánto del mes ya cubrieron las ventas |
| 22 | `esquema-valor-inventario.sql` | Cuánto vale lo que hay en vitrina |
| 23 | `esquema-parche-valor.sql` | Cierra una fila que se le escapaba a la vendedora |
| 24 | `esquema-reasignar-grupos.sql` | Botón para reacomodar precios tras cargar un lote |
| 25 | `esquema-piso-precio.sql` | El grupo se elige por el margen que deja |
| 26 | `esquema-recuperacion-bcv.sql` | La recuperación, toda en la misma moneda |
| 27 | `esquema-respaldo.sql` | Poder sacar un respaldo completo por HTTPS |
| 28 | `esquema-costos-cerrados.sql` | Cierra las funciones de costo a la vendedora |
| 29 | `esquema-indices-fk.sql` | Los índices que las claves foráneas no traen |
| 30 | `esquema-correcciones-datos.sql` | Arregla datos concretos; en base nueva no hace nada |
| 31 | `esquema-categorias-publicas.sql` | El filtro del catálogo, sin traerse mil filas |
| 32 | `esquema-tramos-en-mostrador.sql` | Fuera kits: el descuento por cantidad lo aplica el mostrador solo |
| 33 | `esquema-ubicacion-en-catalogo.sql` | Dónde está cada pieza, en el catálogo PDF y en clave en la vitrina |
| 34 | `esquema-clientes.sql` | El maestro de clientas: histórico, garantía y meses de servicio |
| 35 | `esquema-limpieza-kits.sql` | Suelta la función de venta de kits, que ya no llama nadie |
| 36 | `esquema-ubicacion-en-publico.sql` | El catálogo público también dice dónde está la pieza, en clave |
| 37 | `esquema-cuentas-claras.sql` | Una sola fórmula de gastos y de piezas a vender; arregla Costos, Reportes e Inversiones |
| 38 | `esquema-meta-vendedora.sql` | La meta de la vendedora, del día y del mes, sacada de las cuentas |
| 39 | `esquema-variantes-y-mostrador.sql` | Variantes, la tasa que fija la vendedora, el tramo que sí baja y por qué se rebajó cada pieza |
| 40 | `esquema-cedula-en-catalogo.sql` | El pedido del catálogo empieza por la cédula y reconoce a la clienta, enmascarada |
| 41 | `esquema-variantes-en-tabla.sql` | Las variantes se cargan en una tabla del formulario, en el mismo guardar |
| 42 | `esquema-pedidos-y-mover.sql` | Catálogo desde una pieza, mover piezas de ubicación, ventas por verificar, pedidos que se cobran y vitrina sin sesión |

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

## 5.1 Los dos comandos que hay que acordarse de correr

```bash
npm run respaldo          # saca los datos. Escribe FUERA del repositorio.
npm run verificar         # comprueba que la vendedora sigue sin ver costos.
```

`verificar` pide los dos códigos y no escribe nada: son todo lecturas. Córrelo
**después de tocar una vista, un permiso, una función o una política**, y antes
de publicar. Sale con código 1 si algo se abrió, así que sirve igual dentro de
un hook o de un workflow.

Lo que vigila no lo protege el compilador: un `revoke` que se cae, un
`where es_admin()` que alguien quita al reescribir una vista, un `having` que
vuelve a ser `where`. Esas cosas no rompen el build. Se rompen calladas.

## 6. GitHub Pages

En **Settings → Secrets and variables → Actions → Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

En **Settings → Pages**, source **GitHub Actions**. Cada push a `main` despliega
con `.github/workflows/desplegar.yml`.

---

## Comprobar que quedó bien

Abre **Verificación**, que es de administrador. Son dieciocho pruebas en vivo con
la sesión que tengas abierta: tablas revocadas, vistas de costo, la nómina
rechazada para todos, el maestro de clientas sin costo congelado y que
`registrar_venta` siga siendo una sola, también para un navegador que aún no se
ha actualizado. No escribe nada.

Es la comprobación que se puede hacer desde el teléfono. La fuerte sigue siendo
`npm run verificar`, que entra con **las dos sesiones** y prueba lo que esta
pantalla no puede: que a la vendedora, de verdad, no le llegue nada.

**Si falla una de las de fuga, no sigas.** Significa que la vendedora está
viendo algo que no debería.
