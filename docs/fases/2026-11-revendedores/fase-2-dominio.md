# Fase 2 — Dominio, SSL y un subdominio por revendedor

## Lo que pidió el dueño (18/11/2026)

Compra `luxbyemory` en Namecheap. Lux va en el dominio; cada revendedor en
el suyo: `www.jadujoyas.luxbyemory.com`, para que se vea "de ellos".

## La respuesta corta

- **El SSL del dominio principal es gratis y lo pone GitHub Pages** (Let's
  Encrypt). No hay que comprarle SSL a Namecheap.
- **Los subdominios por revendedor sí necesitan Cloudflare** (plan gratis):
  GitHub Pages solo sirve UN dominio por sitio y no acepta comodines. Si
  `jadujoyas.luxbyemory.com` apunta a GitHub, GitHub responde "Site not
  found". Cloudflare pone delante un certificado que cubre
  `*.luxbyemory.com` y un **Worker** (un programita gratis, hasta 100.000
  visitas al día) que, para cualquier subdominio, pide la página a
  `luxbyemory.com` y la devuelve. La aplicación mira en qué subdominio está
  y abre ese catálogo.
- **Sin `www` delante del revendedor**: `jadujoyas.luxbyemory.com`, no
  `www.jadujoyas.luxbyemory.com`. El certificado gratis cubre un nivel
  (`*.luxbyemory.com`); dos niveles piden el certificado avanzado de
  Cloudflare, que se paga cada mes. Además es más corto de dictar.

## Pasos fuera del código (los hace el dueño, guiado)

1. **Namecheap**: comprar el dominio. No comprar SSL ni PremiumDNS.
2. **Cloudflare**: crear la cuenta gratis → "Add a site" → el dominio →
   plan Free. Cloudflare da dos *nameservers*.
3. **Namecheap** → Domain List → el dominio → Nameservers: "Custom DNS" →
   pegar los dos de Cloudflare. Tarda de minutos a unas horas.
4. **Cloudflare → DNS** (todo en gris, "DNS only", salvo el comodín):
   - `A` `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
     `185.199.111.153` (los de GitHub Pages; comprobar en su documentación
     el día que se haga).
   - `CNAME` `www` → `<usuario-de-github>.github.io`.
   - `CNAME` `*` → `luxbyemory.com`, **en naranja (proxied)**: es el único
     que pasa por Cloudflare.
   El dominio principal va en gris para que GitHub emita y renueve su
   certificado sin estorbos.
5. **GitHub** → el repositorio → Settings → Pages → Custom domain:
   `luxbyemory.com`. Esperar el certificado y marcar **Enforce HTTPS**.
6. **Cloudflare → SSL/TLS**: modo **Full (strict)**.
7. **Cloudflare → Workers**: crear el Worker (el código lo deja esta fase en
   el repo, `cloudflare/subdominio-revendedor.js`) y su ruta
   `*.luxbyemory.com/*`.
8. **Supabase → Authentication → URL Configuration**: poner
   `https://luxbyemory.com` como Site URL si el inicio de sesión lo usa
   (comprobar; hoy se entra con correo y contraseña).

## Lo que hace el código

1. **Cómo se publica hoy**: mirar si el despliegue es por GitHub Actions o
   por la rama `gh-pages`. Con la rama, hace falta `public/CNAME` con
   `luxbyemory.com` o cada despliegue borra el dominio.
2. **`src/lib/dominio.ts`** (nuevo): `revendedorDeHost(hostname)` → el
   usuario si el sitio está en `<usuario>.luxbyemory.com`, null si no (o si
   es `www`). El dominio base sale de una variable de entorno de Vite, no
   escrito a mano en diez sitios.
3. **Las rutas**: en un subdominio de revendedor, la raíz abre su catálogo
   (lo de `/#/r/<usuario>`) y `/#/apartado/<token>` su pedido. Cualquier
   ruta de la tienda (admin, venta, publico) no se abre ahí: lleva al
   catálogo del revendedor. Así su clienta nunca cae en Lux por accidente.
4. **Los enlaces**: `enlaceCatalogoRv` y `enlaceApartado` de
   `src/lib/revendedor.ts` dan `https://<usuario>.luxbyemory.com/...` cuando
   el sitio corre en el dominio propio, y el `#/r/` de siempre si no (en
   desarrollo y en github.io). Los enlaces viejos `#/r/<usuario>` siguen
   funcionando.
5. **Nombres reservados**: un revendedor no puede llamarse `www`, `admin`,
   `api`, `app`, `mail`, `tienda`, `lux`, `rv`, `catalogo`... La lista va en
   el `check` de `revendedores.usuario` (SQL nuevo) y en el formulario de
   Revendedores. El patrón de hoy (`^[a-z0-9][a-z0-9-]{2,29}$`) ya es un
   nombre válido de subdominio salvo que termine en guion: corregirlo.
6. **La política de seguridad** (`vite.config.ts`): `'self'` en un
   subdominio es el subdominio, y el Worker sirve todo desde ahí. No debería
   cambiar; comprobarlo con la consola abierta.
7. **El navegador guarda por dominio**: la sesión del revendedor y el
   carrito de su clienta viven en su subdominio. El panel (`/#/rv`) sigue en
   `luxbyemory.com`.

## Decisiones abiertas (preguntar al empezar)

- ¿`.com`? ¿Se compró también `www`? (viene incluido.)
- ¿El panel del revendedor también en su subdominio
  (`jadujoyas.luxbyemory.com/#/rv`)? Recomendación: no, en el de Lux; su
  subdominio es para sus clientas.
- ¿Qué pasa con un revendedor pausado? Recomendación: su subdominio dice
  "Este catálogo no está disponible", sin nombrar a Lux.

## Cómo se comprueba

- `https://luxbyemory.com` abre con candado; `http://` redirige a `https://`.
- `https://jadujoyas.luxbyemory.com` abre su catálogo con candado; un
  usuario que no existe dice que no existe; `/#/admin` en un subdominio no
  abre la administración.
- El enlace viejo `<usuario>.github.io/...#/r/jadujoyas` sigue llegando.
- El QR de la vitrina y el del catálogo PDF apuntan al dominio nuevo.

## Documentos que cambian

- `INSTALACION.md`: el dominio, Cloudflare, el Worker y la variable de
  entorno.
- `ESTADO.md`: **la renovación anual del dominio** (caduca) y el Worker.
- `CLAUDE.md`: el árbol (`lib/dominio.ts`, `cloudflare/`) y la regla del
  subdominio en "Los revendedores".
