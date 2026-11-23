# Fase 2 — Lo que hace el dueño para encender luxbyemory.com

Una vez, en este orden. Cada paso dice dónde tocar y cómo se ve que salió.
Lo que pide esperar, se espera: no hay que repetir nada.

**Nunca pegues el token de Cloudflare en un chat ni en un archivo.** Va solo
en GitHub, como secreto (paso 6).

## 1. Cloudflare: la cuenta y el dominio

1. Entra a <https://dash.cloudflare.com/sign-up> y crea la cuenta (gratis).
2. Arriba: **Add a domain** (o "Add a site") → escribe `luxbyemory.com` →
   elige el plan **Free**.
3. Cloudflare copia los registros DNS que tenga Namecheap. Si aparecen
   registros de "parking" de Namecheap (`A @` o `CNAME www` que apuntan a
   Namecheap), bórralos.
4. Al final te da **dos nameservers** (algo como `ana.ns.cloudflare.com` y
   `bob.ns.cloudflare.com`). Déjalos en pantalla.

## 2. Namecheap: que el dominio lo maneje Cloudflare

1. Namecheap → **Domain List** → `luxbyemory.com` → **Manage**.
2. **Nameservers** → **Custom DNS** → pega los dos de Cloudflare → el ✓ verde.
3. No compres SSL ni PremiumDNS: no hacen falta.
4. Espera el correo de Cloudflare "luxbyemory.com is now active" (de minutos
   a unas horas). En Cloudflare el dominio dice **Active**.

## 3. Cloudflare: los registros de los subdominios

En Cloudflare → el dominio → **DNS** → **Records** → **Add record**, dos veces:

| Type | Name | IPv6 address | Proxy status |
|---|---|---|---|
| AAAA | `*` | `100::` | **Proxied** (nube naranja) |
| AAAA | `www` | `100::` | **Proxied** (nube naranja) |

El `*` es el que hace que cualquier revendedor tenga su dirección sin tocar
nada más. `luxbyemory.com` y `entrar.luxbyemory.com` los crea solo el primer
despliegue (paso 7).

## 4. Cloudflare: el candado

1. **SSL/TLS** → **Overview** → **Full (strict)**.
2. **SSL/TLS** → **Edge Certificates** → **Always Use HTTPS**: encendido.
3. **Rules** → **Redirect Rules** → **Create rule** → plantilla
   **"Redirect from WWW to root"** → guardar. Así `www.luxbyemory.com` lleva
   a `luxbyemory.com`.

## 5. Cloudflare: el permiso para publicar

1. Arriba a la derecha, tu perfil → **My Profile** → **API Tokens** →
   **Create Token** → plantilla **"Edit Cloudflare Workers"** → **Use template**.
2. **Account Resources**: tu cuenta. **Zone Resources**: *Specific zone* →
   `luxbyemory.com`.
3. **Continue to summary** → **Create Token** → **cópialo** (solo se ve una vez).
4. El **Account ID**: en **Workers & Pages** → a la derecha, "Account ID" →
   copiar.

## 6. GitHub: los secretos y la variable

En github.com → el repositorio `Lux` → **Settings** → **Secrets and
variables** → **Actions**:

- Pestaña **Secrets** → **New repository secret**, dos:
  - `CLOUDFLARE_API_TOKEN` = el token del paso 5.
  - `CLOUDFLARE_ACCOUNT_ID` = el Account ID.
- Pestaña **Variables** → **New repository variable**:
  - `VITE_DOMINIO_BASE` = `luxbyemory.com`

## 7. Avísame, y probamos sin tocar la tienda

Dime "listo". Publico la rama `fase-2-dominio` en Cloudflare (**Actions** →
**Desplegar a Cloudflare** → **Run workflow** → rama `fase-2-dominio`, con la casilla **publicar_rama** marcada).
Eso **no** cambia `robertsrf.github.io`: la tienda sigue normal ahí.

Se comprueba:
- `https://luxbyemory.com` abre la landing con candado.
- `https://luxbyemory.com/rv` abre el panel del revendedor.
- `https://entrar.luxbyemory.com` pide el código del personal.
- `https://<un revendedor>.luxbyemory.com` abre su catálogo, y pegado en
  WhatsApp enseña su nombre y su logo.

## 8. Supabase (un minuto)

Supabase → el proyecto → **Authentication** → **URL Configuration** →
**Site URL**: `https://entrar.luxbyemory.com` → Save. (Hoy se entra con
código, no se usa, pero queda en orden.)

## 9. El día del cambio

Cuando todo lo del paso 7 esté bien, se fusiona la rama a `main`. Antes:

- **Que nadie tenga un conteo de inventario a medias**: el borrador vive en
  el teléfono y se queda en la dirección vieja.
- Avisa a las vendedoras: desde ahora entran por
  **entrar.luxbyemory.com**, y tienen que entrar con su código una vez más.
- Avisa a los revendedores: su panel es **luxbyemory.com/rv** (entran con
  su código una vez más) y su catálogo es **<su usuario>.luxbyemory.com**.

Después:

- El televisor de la vitrina: abrir **luxbyemory.com/vitrina** y volver a
  elegir sus ajustes.
- Cambiar el enlace de Instagram y de WhatsApp Business a
  **luxbyemory.com**.
- `robertsrf.github.io/Lux/...` (las imágenes del 17/11) pasa a llevar solo a
  `luxbyemory.com`.

## Lo que caduca

- **El dominio se renueva cada año en Namecheap** (la fecha exacta está en
  Domain List). Si se vence, se cae todo: la tienda, el personal y los
  revendedores. Deja la renovación automática encendida.
- El token de Cloudflare no caduca salvo que se le ponga fecha.
