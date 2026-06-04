# Deploy paso a paso — youarethead

De cero a `youarethead.com.ar` en vivo. Tres bloques: GitHub → Railway → Cloudflare.
Todo lo que tenés que correr está en bloques de código. Tiempo real: ~20-30 min.

---

## 0) Antes de empezar

- `node_modules`, `dist` y `.env` ya están en `.gitignore`, así que es seguro subir todo.
- Generá tu `IP_SALT` (lo pegás en Railway en el paso 2 — **NO va al repo**). En una terminal:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
(o `openssl rand -hex 32`). Copiá el resultado y guardalo aparte.

---

## 1) GitHub

1. Entrá a github.com → **New repository**. Nombre: `youarethead`. Privado. **No** marques
   "Add a README" (la carpeta ya tiene archivos).
2. En tu compu, terminal dentro de `H:\youarethead`:

```bash
cd /d H:\youarethead
git init
git add .
git commit -m "init: youarethead landing + wishlist"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/youarethead.git
git push -u origin main
```

(Si usás SSH: `git remote add origin git@github.com:TU-USUARIO/youarethead.git`.)

---

## 2) Railway

1. railway.app → **New Project** → **Deploy from GitHub repo** → elegí `youarethead`
   (si es la primera vez, autorizá el acceso de Railway a GitHub).
2. Railway detecta el `Dockerfile` (vía `railway.json`) y arranca el build solo.
3. En el proyecto: **New** → **Database** → **Add PostgreSQL**. Espera a que quede verde.
4. Clic en el servicio **web** (el de tu repo) → pestaña **Variables** → **New Variable**,
   y cargá estas:

```
DATABASE_URL = ${{ Postgres.DATABASE_URL }}
IP_SALT      = <el hex que generaste en el paso 0>
WISHLIST_GOAL = 10000
```

   - `DATABASE_URL` se escribe tal cual, con `${{ }}`: es una referencia al plugin Postgres.
   - (Opcional) `ONE_PER_IP = false` si no querés limitar por IP.
5. Railway redeploya con las variables. La tabla se crea sola al arrancar.

### Probar que levantó

1. Servicio web → **Settings** → **Networking** → **Generate Domain**. Te da algo como
   `youarethead-production.up.railway.app`.
2. Abrí en el navegador:
   - `https://<eso>.up.railway.app/healthz` → debe responder `{"ok":true}`
   - `https://<eso>.up.railway.app/` → la landing
   - `https://<eso>.up.railway.app/api/stats` → `{"ok":true,"count":0,...}`

> Si a los segundos da 404, esperá 3-5 min: el primer deploy todavía está buildeando.

---

## 3) Dominio: Cloudflare + nic.ar (youarethead.com.ar)

Tu dominio está en nic.ar, así que primero hay que delegárselo a Cloudflare (cambiar los
nameservers) y después cargar los registros. Arrancá esto en paralelo al deploy: la
propagación en .ar puede tardar de minutos a unas horas.

### 3.1 — Sumá el dominio a Cloudflare

1. cloudflare.com → login → **Add a site** → `youarethead.com.ar` → plan **Free**.
2. Cloudflare te da **2 nameservers** (tipo `gina.ns.cloudflare.com` y `rick.ns.cloudflare.com`).
   Anotá esos dos.

### 3.2 — Cambiá los nameservers en nic.ar

1. Entrá a **nic.ar** con tu Clave Fiscal (AFIP).
2. **Mis dominios** → `youarethead.com.ar` → **Editar delegación** (servidores DNS).
3. Borrá los DNS que tenga y poné los **2 de Cloudflare**. Guardá.
4. Esperá: Cloudflare te manda un mail cuando el dominio queda **Active** (ahí ya maneja
   el DNS Cloudflare).

### 3.3 — Apuntá a Railway

1. En Railway, servicio web → **Settings** → **Networking** → **Custom Domain** →
   escribí `youarethead.com.ar` y (opcional) `www.youarethead.com.ar`.
   Railway te muestra un destino **CNAME** (algo tipo `abc123.up.railway.app`). Copialo.
2. En Cloudflare → tu dominio → **DNS** → **Add record**:

```
Tipo: CNAME   Nombre: @     Destino: abc123.up.railway.app   Proxy: DNS only (nube gris)
Tipo: CNAME   Nombre: www   Destino: abc123.up.railway.app   Proxy: DNS only (nube gris)
```

   (Cloudflare "aplana" el CNAME en la raíz, por eso `@` funciona.)
3. Esperá a que Railway verifique el dominio y emita el certificado (unos minutos; el
   estado pasa a "Active").
4. Cuando ya cargue por HTTPS, si querés el proxy/cache de Cloudflare: poné las dos nubes
   en **naranja** (proxied) y en **SSL/TLS → Overview** elegí **Full (strict)**.

---

## 4) Checklist final

- [ ] `https://youarethead.com.ar` carga la landing con el fondo animado.
- [ ] Te anotás con un mail → "Listo. Estás en la lista." y el contador baja.
- [ ] El mismo mail de nuevo → "Ese mail ya está en la lista."
- [ ] Reemplazaste el mockup SVG por la foto real (`<img src="/shirt.png">`) — ver README.
- [ ] Cambiaste el botón de compra (`id="buyBtn"`) por el link real de venta.

## Cómo actualizar después

Cualquier cambio: `git add . && git commit -m "..." && git push`. Railway redeploya solo.

## Ver / exportar los mails

Railway → Postgres → **Data** (o **Query**):

```sql
SELECT email, created_at FROM wishlist ORDER BY created_at;
SELECT count(*) FROM wishlist;
```
