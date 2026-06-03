# youarethead

Landing con wishlist para la remera **YOU ARE THE AD**. Fondo oscuro animado
(constelación tipo `dark.netflix.io`), contador en reversa ("Faltan X para que vos seas
la AD") y captura de un mail por persona / por IP. Cuando llega a 10.000, se desbloquea
el estado "a la venta".

## Stack

Node + TypeScript + **Fastify** sirviendo la landing estática y la API. **Postgres** para
guardar los mails. Deploy en **Railway** (Dockerfile incluido), dominio por **Cloudflare**.

```
youarethead/
├── src/server.ts        API + estáticos (POST /api/wishlist, GET /api/stats, /healthz)
├── public/              index.html, styles.css, app.js, favicon.svg  (la landing)
├── db/schema.sql        esquema (el server lo aplica solo al arrancar)
├── Dockerfile           build + runtime
├── railway.json         builder Docker + healthcheck /healthz
├── .env.example         variables
└── PROMPT-REMERA.md     prompts para generar la remera
```

## Endpoints

- `POST /api/wishlist` — body `{ "email": "..." }`. Valida, dedupe por mail y 1 alta por IP
  (IP hasheada con `IP_SALT`). Devuelve `{ ok, message, count, goal, remaining, unlocked }`.
- `GET /api/stats` — `{ ok, count, goal, remaining, unlocked }`.
- `GET /healthz` — para el healthcheck de Railway.

## Variables (.env)

| Var | Default | Qué hace |
|-----|---------|----------|
| `DATABASE_URL` | — | Conexión a Postgres (Railway la inyecta). **Obligatoria.** |
| `WISHLIST_GOAL` | `10000` | Meta para desbloquear la venta. |
| `IP_SALT` | (default inseguro) | Salt para hashear IPs. **Poné uno random.** |
| `ONE_PER_IP` | `true` | `false` desactiva el límite por IP (solo dedupe por mail). |
| `PGSSL` | auto | `require` / `disable` si necesitás forzar SSL. |
| `PORT` | `3000` | Railway lo setea solo. |

## Local

Necesitás un Postgres corriendo. Rápido con Docker:

```bash
docker run -d --name yath-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=youarethead -p 5432:5432 postgres:16
cp .env.example .env   # y editá DATABASE_URL=postgres://postgres:pg@localhost:5432/youarethead
npm install
npm run dev            # http://localhost:3000
```

## Deploy en Railway

1. Subí esta carpeta a un repo (GitHub) o usá `railway up` con el CLI.
2. En Railway: **New Project → Deploy from repo** (toma el `Dockerfile` por `railway.json`).
3. En el proyecto: **New → Database → PostgreSQL**.
4. En el servicio web → **Variables**:
   - `DATABASE_URL = ${{ Postgres.DATABASE_URL }}`  (referencia al plugin)
   - `IP_SALT = ` (algo random largo, ej. salida de `openssl rand -hex 32`)
   - opcional: `WISHLIST_GOAL`, `ONE_PER_IP`
5. Deploy. El server crea la tabla solo. Probá `https://<sub>.up.railway.app/healthz`.

## Dominio en Cloudflare (youarethead.com.ar)

1. Railway → servicio → **Settings → Networking → Custom Domain** → agregá
   `youarethead.com.ar` (y si querés `www.youarethead.com.ar`). Railway te da un destino
   CNAME (algo tipo `xxxx.up.railway.app`).
2. Cloudflare → tu dominio → **DNS → Add record**:
   - Type `CNAME`, Name `@`, Target = el valor de Railway. (Cloudflare aplana el CNAME en
     el apex, así que en la raíz funciona.)
   - Otro `CNAME` `www` → mismo destino.
   - **Proxy:** ponelo en **DNS only** (nube gris) hasta que Railway emita el certificado;
     después podés activar el proxy (nube naranja).
3. Si dejás el proxy activado, en Cloudflare **SSL/TLS → Overview → Full (strict)**.
4. Esperá a que Railway verifique el dominio y emita el cert (unos minutos).

## Exportar los mails

Desde Railway → Postgres → **Data/Query**, o con psql:

```sql
SELECT email, created_at FROM wishlist ORDER BY created_at;
-- total:
SELECT count(*) FROM wishlist;
```

## Notas

- **1 mail por IP**: bueno contra spam, pero IPs compartidas (oficinas, datos móviles con
  NAT) pueden quedar bloqueadas. Si te molesta, poné `ONE_PER_IP=false`.
- **La remera**: el mockup del sitio es un SVG (Montserrat 800 espejado). Cuando tengas la
  foto real (ver `PROMPT-REMERA.md`), reemplazá el `<svg class="tee">` por
  `<img src="/shirt.png" class="tee">` y subí `public/shirt.png`. Para la preview al
  compartir, agregá `public/og.png` (1200×630).
- **Botón de compra**: cuando se desbloquee, el botón apunta a `#comprar`. Cambialo en
  `public/index.html` (`id="buyBtn"`) por el link real de venta.
