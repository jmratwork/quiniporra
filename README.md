# quiniporra 🎯

Aplicación web para organizar una **porra colaborativa** alrededor de la
**jornada actual de La Quiniela española**. El administrador carga la jornada
(automáticamente desde la web oficial de SELAE o a mano), invita a cada jugador
a apostar un partido concreto mediante un enlace único, y gana **quien apueste
primero** cada partido. Cuando los 15 partidos están apostados, la porra se
cierra y se puede descargar el boleto completo en **PDF**.

Inspirado en la arquitectura de
[jmratwork/porrafutbol](https://github.com/jmratwork/porrafutbol) (Next.js 14),
pero con el stack actual.

**Repositorio:** <https://github.com/jmratwork/quiniporra>

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** (v3)
- **Prisma** + **PostgreSQL** (compatible con Vercel Postgres, Neon o Supabase)
- **pdf-lib** para generar el boleto en PDF (JS puro, funciona en serverless)
- **Zod** para validación
- Solo dependencias **open source** y gratuitas

> **Notas de Next 15** (respecto a 14): en los route handlers y páginas
> dinámicas `params` es asíncrono (se usa `await params` en `/apostar/[token]`
> y en `/api/invitaciones/[token]`); `fetch` ya no cachea por defecto (la
> petición a SELAE usa `cache: 'no-store'` y las vistas de estado usan
> `dynamic = 'force-dynamic'`).

---

## Dominio: La Quiniela

Una **Quiniela** representa la jornada actual y contiene exactamente **15
partidos**:

- **Partidos 1–14**: se apuesta con signos **`1`**, **`X`** o **`2`**.
- **Partido 15 (Pleno al 15)**: se apuesta el número de goles de **cada equipo
  por separado**, eligiendo entre **`0`**, **`1`** o **`M`** (M = 2 o más).

**Estados**: `ABIERTA` → `CERRADA`.

- `ABIERTA`: quedan partidos sin apostar.
- `CERRADA`: los 15 partidos ya tienen apuesta. El paso a `CERRADA` es
  **automático** en cuanto se registra la apuesta del último partido pendiente
  (dentro de la misma transacción).

### Multiplicidad de las invitaciones

Al invitar a un jugador a un partido, el admin fija la **multiplicidad**, que
determina cuántos signos debe marcar:

| Multiplicidad | Partidos 1–14        | Pleno al 15 (por equipo)       |
| ------------- | -------------------- | ------------------------------ |
| **Simple**    | 1 signo              | 1 valor por equipo             |
| **Doble**     | 2 signos distintos   | 2 valores distintos por equipo |
| **Triple**    | 3 signos (1, X y 2)  | los 3 valores (0, 1 y M)       |

> En el Pleno al 15 la multiplicidad se aplica **por equipo**: p. ej. "doble"
> significa 2 valores distintos para el equipo local **y** 2 para el visitante.
> El formulario del jugador impide marcar más o menos de lo exigido, y la API
> lo valida también en el servidor (400 si no cumple).

---

## Puesta en marcha en local

### 1. Requisitos

- Node.js 18.18+ (probado con Node 24)
- Una base de datos PostgreSQL (local o gratuita en la nube, ver más abajo)

### 2. Clonar e instalar dependencias

```bash
git clone https://github.com/jmratwork/quiniporra.git
cd quiniporra
npm install
```

(El `postinstall` ejecuta `prisma generate` automáticamente.)

### 3. Configurar variables de entorno

Copia el ejemplo y edítalo:

```bash
cp .env.example .env
```

| Variable            | Descripción                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`      | Cadena de conexión a PostgreSQL.                                        |
| `ADMIN_PIN`         | PIN del panel `/admin`. **Mín. 12 caracteres en producción.**          |
| `INVITACION_SECRET` | Secreto HMAC para firmar los tokens de invitación. **Oblig. en prod.** |

Genera un secreto aleatorio:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Crear las tablas

```bash
npx prisma migrate deploy   # aplica la migración inicial ya incluida
# o, en desarrollo, para crear/actualizar y regenerar el cliente:
npx prisma migrate dev
```

### 5. Arrancar

```bash
npm run dev
```

Abre <http://localhost:3000>. El panel de administración está en
<http://localhost:3000/admin> (entra con tu `ADMIN_PIN`).

### 6. Probar el fetcher de la jornada (opcional)

```bash
npm run fetch:jornada
```

Hace una petición **real** a SELAE y muestra los 15 partidos. Ver la sección
[Fuente de datos de la jornada](#fuente-de-datos-de-la-jornada).

---

## Crear una base de datos PostgreSQL gratuita

Cualquiera de estas opciones vale (todas tienen plan gratuito):

- **Neon** (<https://neon.tech>): crea un proyecto, copia la _connection string_
  (incluye `?sslmode=require`) en `DATABASE_URL`.
- **Supabase** (<https://supabase.com>): _Project Settings → Database →
  Connection string_ (usa la _connection pooling_ para serverless).
- **Vercel Postgres**: desde el _dashboard_ de tu proyecto en Vercel, pestaña
  _Storage → Create Database → Postgres_. Vercel inyecta `DATABASE_URL`
  automáticamente.

Luego aplica las migraciones: `npx prisma migrate deploy`.

---

## Despliegue en Vercel (sin pasos manuales)

1. Sube el repositorio a GitHub y **importa el proyecto en Vercel**.
2. Crea/enlaza una base de datos PostgreSQL y define las variables de entorno en
   Vercel: `DATABASE_URL`, `ADMIN_PIN` (≥ 12 caracteres), `INVITACION_SECRET`.
3. Vercel usará automáticamente el script **`vercel-build`**:

   ```
   prisma generate && prisma migrate deploy && next build
   ```

   Esto genera el cliente, **aplica las migraciones** y construye la app en cada
   despliegue. No hay pasos manuales de base de datos.

---

## Roles y flujo

### Administrador (`/admin`, protegido por PIN)

1. **Iniciar la jornada** — botón _"Iniciar"_: carga automáticamente la jornada
   actual desde SELAE. Si la fuente falla, muestra el error y ofrece un
   **formulario manual** para introducir los 15 partidos a mano. Solo puede
   existir **una** Quiniela activa; si ya hay una, pide confirmación y la
   reemplaza (borra partidos, invitaciones y apuestas anteriores).
2. **Invitar a apostar** — para un partido, genera una invitación con el nombre
   del jugador y la **multiplicidad**. Se obtiene un **enlace único con token**
   que el admin copia y envía por su cuenta (WhatsApp, email…). _La app no envía
   correos._ Se pueden crear varias invitaciones para el mismo partido.
3. **Panel de seguimiento** — tabla con los 15 partidos: equipos, multiplicidad,
   estado (`PENDIENTE`/`APOSTADO`), signos apostados, nombre del apostante y las
   invitaciones emitidas con su estado (`pendiente`, `usada`, `anulada`).
4. **PDF del boleto** — cuando la Quiniela pasa a `CERRADA`, aparece un botón
   con icono de impresora que descarga el boleto completo en PDF.

### Jugador (enlace `/apostar/[token]`)

1. Abre el enlace y ve el partido asignado, su nombre y la multiplicidad.
2. Marca **exactamente** los signos exigidos (ni más ni menos); el formulario lo
   impide y la API lo valida (400 si no cumple).
3. **El primero que llega, apuesta**: si el partido ya está apostado cuando abre
   el enlace o envía el formulario, se le muestra que **llega tarde**, la
   invitación queda **anulada** y no participa (409 en la API).
4. La unicidad "una sola apuesta por partido" está garantizada por una
   **restricción única en la base de datos** (`quinielaId + numeroPartido`), no
   solo por comprobaciones en código: evita condiciones de carrera.
5. El token es de **un solo uso** y válido solo para su partido.

---

## Fuente de datos de la jornada

La carga automática combina **dos fuentes**, porque ninguna por sí sola sirve.
Todo se hace **en el servidor** (route handler / script), nunca desde el
navegador (evita CORS y no expone nada), enviando cabeceras de navegador
(`User-Agent`, `Accept`, `Referer`).

### 1. Cabecera de la jornada → SELAE

**`GET https://www.loteriasyapuestas.es/servicios/proximosv3?game_id=LAQU&num=1`**

Endpoint JSON **no documentado** que usa la propia web de SELAE. Devuelve la
**cabecera** de la próxima jornada abierta: número de jornada, año, fecha de
cierre, fecha de sorteo e `id_sorteo`. **No incluye los emparejamientos.**

### 2. Los 15 partidos → Mundo Deportivo

**`GET https://www.mundodeportivo.com/servicios/quiniela`**

> **Por qué no SELAE.** Se comprobó con peticiones reales que los endpoints de
> SELAE **no publican los emparejamientos de la jornada abierta**:
> `proximosv3` solo trae la cabecera, y `buscadorSorteos` únicamente devuelve
> jornadas **ya celebradas**. Mundo Deportivo sí publica el **boleto vigente**,
> así que de ahí salen los 15 partidos.

La página **no es una API legible por máquina**, así que el parser
([`src/lib/mundoDeportivo.ts`](src/lib/mundoDeportivo.ts)) es deliberadamente
defensivo. La estructura real tiene **dos bloques** y la posición del partido
aparece de formas distintas en cada uno:

```
Bloque 1 (tabla compacta) — la posición va en la línea SIGUIENTE:
    "ESPAÑA - BÉLGICA"
    "1"                     ← este bloque omite el Pleno al 15

Bloque 2 (fichas detalladas) — la posición va en la línea ANTERIOR, con punto:
    "15."
    "SARPSBORG - VIKING"    ← aquí sí aparece el Pleno al 15
```

Por eso la posición se busca en este orden: **misma línea → línea anterior con
punto (`"15."`) → línea siguiente numérica → vecindad ampliada**. Buscar hacia
delante sin más daría falsos positivos, porque los botones `1 / X / 2` y los
porcentajes también son números sueltos.

Además el parser: deduplica por posición y por pareja de equipos (los dos
bloques repiten partidos), **sanea los nombres de equipo** (elimina caracteres
de control y `<`/`>`, colapsa espacios y limita la longitud, ya que ese texto
acaba en la BD, la UI y el PDF) y **valida con Zod que hay exactamente 15
partidos numerados del 1 al 15** antes de crear nada.

### 3. Respaldo → SELAE `buscadorSorteos`

**`GET /servicios/buscadorSorteos?game_id=LAQU&celebrados=<bool>&fechaInicioInclusiva=AAAAMMDD&fechaFinInclusiva=AAAAMMDD`**

Devuelve los sorteos de un rango de fechas, cada uno con su lista `partidos`
(objetos con `posicion`, `local`, `visitante`, `signo`…). Se usa si Mundo
Deportivo falla. **Las fechas son de 8 dígitos (`AAAAMMDD`), sin hora.** Solo
sirve para jornadas ya celebradas.

La orquestación vive en
[`src/lib/jornadaFetcher.ts`](src/lib/jornadaFetcher.ts) e incluye un **caché en
memoria de 10 minutos** para no repetir la petición si se pulsa "Iniciar" varias
veces.

### Limitaciones (importante) y fallback manual

- Ninguna de las dos fuentes es una **API oficial documentada**: su estructura
  **puede cambiar sin aviso**. Los parsers son defensivos y validados, pero
  podrían dejar de funcionar.
- Mundo Deportivo puede publicar solo los 14 partidos y **omitir el Pleno al
  15** hasta más cerca de la jornada. En ese caso la carga automática devuelve
  un error claro (**502**) pidiendo usar el formulario manual.
- La protección **Akamai** de SELAE puede responder **403** a peticiones
  automatizadas según el cliente y la IP. En las pruebas, el `fetch` de
  **Node.js** (con cabeceras de navegador) atraviesa la protección; `curl`
  recibe 403. Desde IPs de datacenter (p. ej. Vercel) puede variar. Como la
  cabecera de SELAE es **best-effort**, si falla se sigue adelante con los
  partidos de Mundo Deportivo.

Por todo lo anterior, **la app nunca depende exclusivamente de una fuente
externa**: el botón _"Iniciar"_ siempre ofrece el **formulario manual** para
introducir los 15 partidos a mano si la carga automática falla.

### Ejemplo real de `npm run fetch:jornada`

```
→ Consultando la jornada ABIERTA de La Quiniela…
  (cabecera: SELAE proximosv3 · partidos: Mundo Deportivo)

✅ Jornada abierta obtenida con sus 15 partidos:

   Jornada 72 - 2026  (abierta a apuestas)
   Fuente de los partidos: Mundo Deportivo
   Cierre:   10/7/2026, 18:00:00
   idSorteo: 1316106041

   Nº  Local                      Visitante
   ──  ─────────────────────────  ─────────────────────────
    1  España                     Bélgica
    2  Noruega                    Inglaterra
    3  Argentina                  Suiza
   ...
   14  Brann                      Ik Start
   15  Sarpsborg                  Viking       ← Pleno al 15

   Total: 15 partidos.
```

---

## API (App Router, `src/app/api/…`)

| Método   | Ruta                        | Descripción                                                                 | Auth      |
| -------- | --------------------------- | --------------------------------------------------------------------------- | --------- |
| `GET`    | `/api/quiniela`             | Estado completo. Sin PIN → vista pública; con PIN → vista admin.            | parcial   |
| `DELETE` | `/api/quiniela`             | Reinicia todo (borra la Quiniela activa en cascada).                        | PIN       |
| `POST`   | `/api/quiniela/iniciar`     | "Iniciar": busca la jornada en SELAE y crea la Quiniela. **502** si falla.  | PIN       |
| `POST`   | `/api/quiniela/manual`      | Fallback: crear la jornada con los 15 partidos a mano.                      | PIN       |
| `POST`   | `/api/invitaciones`         | Crea invitación (partido, nombre, multiplicidad). Devuelve el token 1 vez.  | PIN       |
| `GET`    | `/api/invitaciones/[token]` | Datos para la pantalla del jugador. **409** si el partido ya está apostado. | token     |
| `POST`   | `/api/apuestas`             | Registra la apuesta. **400** si no cumple multiplicidad; **409** si tarde.  | token     |
| `GET`    | `/api/quiniela/pdf`         | PDF del boleto (solo si `CERRADA`; **409** si no).                          | ninguna   |

### Autenticación del admin

El PIN se envía en la cabecera **`x-admin-pin`** o en el cuerpo como **`pin`**.
Respuesta **401** si es incorrecto. En producción, `ADMIN_PIN` debe tener al
menos 12 caracteres o el servidor rechaza el acceso (**500** de configuración).

### Ejemplos (`curl`)

```bash
# Iniciar la jornada (carga automática desde SELAE)
curl -X POST http://localhost:3000/api/quiniela/iniciar \
  -H "x-admin-pin: TU_PIN" -H "Content-Type: application/json" \
  -d '{"confirmar": true}'

# Fallback manual: crear la jornada con 15 partidos
curl -X POST http://localhost:3000/api/quiniela/manual \
  -H "x-admin-pin: TU_PIN" -H "Content-Type: application/json" \
  -d '{
    "jornada": "Jornada 34 - 2025/2026",
    "partidos": [
      {"numero":1,"local":"Real Madrid","visitante":"Barcelona"},
      { "...": "hasta 15, siendo el 15 el Pleno al 15" }
    ]
  }'

# Crear una invitación para el partido 3 (doble)
curl -X POST http://localhost:3000/api/invitaciones \
  -H "x-admin-pin: TU_PIN" -H "Content-Type: application/json" \
  -d '{"numeroPartido":3,"nombreJugador":"Ana","multiplicidad":"DOBLE"}'
# → { "token": "...", "enlace": "http://localhost:3000/apostar/...", ... }

# Registrar una apuesta 1X2 (partido 1-14)
curl -X POST http://localhost:3000/api/apuestas \
  -H "Content-Type: application/json" \
  -d '{"token":"EL_TOKEN","signos":{"tipo":"1X2","valores":["1","X"]}}'

# Registrar la apuesta del Pleno al 15
curl -X POST http://localhost:3000/api/apuestas \
  -H "Content-Type: application/json" \
  -d '{"token":"EL_TOKEN","signos":{"tipo":"PLENO","local":["1"],"visitante":["M"]}}'

# Descargar el PDF (cuando la Quiniela está CERRADA)
curl -L http://localhost:3000/api/quiniela/pdf -o boleto.pdf
```

---

## Modelo de datos (Prisma)

Ver [`prisma/schema.prisma`](prisma/schema.prisma). Resumen:

- **Quiniela**: `jornada`, `fechaCierre?`, `estado` (`ABIERTA`/`CERRADA`),
  `origen` (`AUTOMATICO`/`MANUAL`), `createdAt`.
- **Partido**: `quinielaId`, `numero` (1–15), `local`, `visitante`,
  `multiplicidad?` (nula hasta que haya invitación), `esPleno`. Único
  `(quinielaId, numero)`.
- **Invitacion**: `partidoId`, `nombreJugador`, `multiplicidad`, **`tokenHash`**
  (solo se guarda el hash HMAC, nunca el token), `estado`, `createdAt`,
  `usedAt?`.
- **Apuesta**: `partidoId` (único), `invitacionId` (único), `quinielaId`,
  `numeroPartido`, `nombreJugador`, `signos` (JSON tipado y validado con Zod),
  `createdAt`. **Único `(quinielaId, numeroPartido)`** → garantía anticarrera.

Los **signos** se modelan de forma tipada (JSON validado):

- Partidos 1–14: `{ "tipo": "1X2", "valores": ["1","X","2"]? }`
- Pleno al 15: `{ "tipo": "PLENO", "local": ["0","1","M"]?, "visitante": [...] }`

### Transacciones

El registro de una apuesta se hace en **una transacción de Prisma** que:
crea la apuesta → marca la invitación como `USADA` → **cierra la Quiniela si es
la 15.ª apuesta**. Si dos jugadores intentan el mismo partido a la vez, la
restricción única hace que el segundo reciba **409** ("llegas tarde").

---

## Estructura del proyecto

```
quiniporra/
├── prisma/
│   ├── schema.prisma
│   └── migrations/                # migración inicial lista para migrate deploy
├── scripts/
│   └── fetch-jornada.ts           # npm run fetch:jornada
├── src/
│   ├── app/
│   │   ├── page.tsx               # home pública
│   │   ├── admin/page.tsx         # panel de administración (PIN)
│   │   ├── apostar/[token]/page.tsx
│   │   └── api/…                  # route handlers
│   ├── components/                # FilaPartido, CasillasSignos, FormularioManual, Toast…
│   └── lib/
│       ├── jornadaFetcher.ts      # orquesta cabecera (SELAE) + partidos
│       ├── mundoDeportivo.ts      # scraper del boleto vigente (15 partidos)
│       └── …                      # prisma, auth, validation, tokens, cache, quiniela, pdf, http, errors
├── .env.example
└── package.json
```

## Scripts de npm

| Script                   | Qué hace                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `npm run dev`            | Arranca en desarrollo.                                         |
| `npm run build`          | Compila (comprueba tipos).                                     |
| `npm run start`          | Sirve la build de producción.                                 |
| `npm run vercel-build`   | `prisma generate && prisma migrate deploy && next build`.      |
| `npm run db:migrate`     | `prisma migrate dev`.                                          |
| `npm run db:studio`      | Abre Prisma Studio.                                            |
| `npm run fetch:jornada`  | Prueba real del fetcher de SELAE.                             |

## Licencia

Software libre. Solo dependencias open source y gratuitas.
