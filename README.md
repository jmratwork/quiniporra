# quiniporra 🎯

Aplicación Web para organizar una **porra colaborativa** alrededor de la
**jornada actual de La Quiniela española**. El administrador carga la jornada
(automáticamente desde la Web oficial de SELAE o a mano), invita a cada jugador
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

**Estados**: `ABIERTA` → `CERRADA` (o `ABIERTA` → `CADUCADA`).

- `ABIERTA`: quedan partidos sin apostar.
- `CERRADA`: los 15 partidos ya tienen apuesta. El paso a `CERRADA` es
  **automático** en cuanto se registra la apuesta del último partido pendiente
  (dentro de la misma transacción).
- `CADUCADA`: se alcanzó la `fechaCierre` **sin** completar los 15 partidos. La
  jornada deja de admitir apuestas (409) y no genera boleto. El paso a
  `CADUCADA` es perezoso: se aplica al leer o intentar apostar una vez pasada la
  fecha de cierre. Los pronósticos **no** se revelan (la porra no se completó).

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

| Variable            | Descripción                                                                     |
| ------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`      | Cadena de conexión a PostgreSQL.                                                |
| `ADMIN_PIN`         | PIN del panel `/admin` (primer factor). **Mín. 12 caracteres en producción.**  |
| `INVITACION_SECRET` | Secreto HMAC para firmar los tokens de invitación. **Oblig. en prod.**         |
| `SESSION_SECRET`    | Secreto HMAC para firmar la cookie de sesión del admin. **Oblig. en prod.**    |
| `TOTP_SECRET`       | Secreto base32 del segundo factor (2FA). **Oblig. en prod.** Ver más abajo.     |
| `CRON_SECRET`       | Protege el cron de carga automática de la jornada. **Oblig. en prod.**          |

#### Cómo generar cada secreto

Hay dos tipos de secreto y se generan de forma distinta.

**A) `INVITACION_SECRET`, `SESSION_SECRET` y `CRON_SECRET` — claves aleatorias del servidor**

Son claves que solo conoce el servidor; no hay que compartirlas con ninguna app
ni que coincidan entre sí. Vale cualquier cadena aleatoria larga. Genera **una
distinta para cada una**:

```bash
# Ejecútalo una vez por variable y usa un valor para cada una
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → p. ej.  9f3c1a…e2b7   (64 caracteres hexadecimales)
```

- `INVITACION_SECRET` firma los tokens de invitación (HMAC).
- `SESSION_SECRET` firma la cookie de sesión del admin (HMAC).
- `CRON_SECRET` protege el cron de carga automática de la jornada: Vercel lo
  envía solo como `Authorization: Bearer <CRON_SECRET>` y la ruta
  `/api/cron/jornada` comprueba que coincida (nadie de fuera puede dispararlo).

<details>
<summary>Alternativas sin Node (PowerShell / OpenSSL)</summary>

```powershell
# Windows PowerShell
[Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

```bash
# Linux / macOS con OpenSSL
openssl rand -hex 32
```

</details>

**B) `TOTP_SECRET` — secreto del segundo factor (2FA)**

Este **no** se genera "a lo bruto": tu app de autenticación (Google
Authenticator, Authy, 1Password…) tiene que conocer el **mismo** secreto para
producir los códigos correctos. Por eso hay un script que genera el secreto
**y** el QR para escanearlo:

```bash
npm run totp:setup
```

Verás tres cosas:

1. Un **código QR** → escanéalo con tu app de autenticación (o teclea el secreto
   a mano si no puedes escanear). Al hacerlo, la app crea una entrada para
   quiniporra y empieza a mostrar un código de 6 dígitos que cambia cada 30 s.
2. El valor **`TOTP_SECRET="…"`** (base32) → cópialo a la variable de entorno
   (`.env` en local, *Environment Variables* en Vercel). El script genera uno de
   **160 bits** (32 caracteres); si lo pones a mano, debe tener **≥26 caracteres
   base32 (≥128 bits)** o el servidor lo rechaza en producción.
3. Un **código de 6 dígitos** que imprime el propio script.

**Cómo funciona el segundo factor (y por qué importa el paso 3).** Un código
TOTP no se envía por ningún sitio: la app de tu móvil y el servidor lo
**calculan por separado** a partir del *mismo* secreto y de la hora actual. Si
ambos parten del mismo `TOTP_SECRET`, generan el mismo número de 6 dígitos en
cada intervalo de 30 s; al iniciar sesión, el servidor comprueba que el código
que tecleas coincide con el que él ha calculado.

Por eso el paso 3 es una **verificación de que el enrolamiento salió bien**:
abre tu app justo después de escanear y compara el código que muestra para
quiniporra con el que imprimió el script. Como cambian cada 30 s, míralos casi a
la vez.

- **Coinciden** → la app y el servidor comparten el secreto: el 2FA está listo.
- **No coinciden** → escaneaste mal, tecleaste mal el secreto o el reloj del
  móvil está desajustado. Repite el enrolamiento (`npm run totp:setup`) o activa
  la hora automática en el móvil.

> **El `TOTP_SECRET` de la variable de entorno debe ser el mismo que conoce tu
> app.** Local y producción (Vercel) son entornos separados, cada uno con su
> propia variable `TOTP_SECRET`, así que tienes dos opciones:
>
> - **Reutilizar el mismo secreto** en local y en producción → te vale con una
>   sola entrada en la app (lo más cómodo).
> - **Usar un secreto distinto en cada entorno** (más aislamiento) → tendrás que
>   escanear el QR **dos veces**, y en tu app quedarán dos entradas (p. ej.
>   "quiniporra local" y "quiniporra prod"), cada una con su código.
>
> Si generas un `TOTP_SECRET` nuevo (rotación) y no vuelves a escanearlo en la
> app, los códigos dejarán de coincidir y no podrás entrar.
>
> En **desarrollo**, si dejas `TOTP_SECRET` vacío, se **omite** el segundo
> factor (solo se pide el PIN) para no bloquear el arranque local. En
> **producción** es obligatorio.

Más detalle en [Seguridad del panel: doble factor (2FA)](#seguridad-del-panel-doble-factor-2fa).

> ⚠️ **No subas estos valores al repositorio.** Van en `.env` (ignorado por git)
> en local y en las *Environment Variables* de Vercel en producción. Si crees
> que un secreto se ha filtrado, genera uno nuevo y actualízalo en todos los
> entornos (rotar `TOTP_SECRET` obliga a volver a escanear el QR).

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
<http://localhost:3000/admin>: entra con tu `ADMIN_PIN` y, si has configurado
`TOTP_SECRET`, el código de 6 dígitos de tu app de autenticación.

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
   Vercel: `DATABASE_URL`, `ADMIN_PIN` (≥ 12 caracteres), `INVITACION_SECRET`,
   `SESSION_SECRET` y `TOTP_SECRET` (genera este último con `npm run totp:setup`).
3. Vercel usará automáticamente el script **`vercel-build`**:

   ```
   prisma generate && prisma migrate deploy && next build
   ```

   Esto genera el cliente, **aplica las migraciones** y construye la app en cada
   despliegue. No hay pasos manuales de base de datos.

---

## Roles y flujo

### Administrador (`/admin`, protegido por PIN + 2FA)

1. **La jornada se carga sola** — no hay botón de "Iniciar": la jornada actual
   se carga **automáticamente** (ver [Carga programada](#carga-programada-de-la-jornada))
   y aparece tanto en el panel como en la página de inicio pública. Cuando aún
   no hay jornada, el panel lo indica.
2. **Invitar a apostar** — para un partido, genera una invitación con el nombre
   del jugador y la **multiplicidad**. Se obtiene un **enlace único con token**
   que el admin copia y envía por su cuenta (WhatsApp, email…). _La app no envía
   correos._ Se pueden crear varias invitaciones para el mismo partido, y
   **anular** desde el panel las que sigan pendientes (dejan de servir).
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

### 1. Todo el boleto → Mundo Deportivo (fuente primaria)

**`GET https://www.mundodeportivo.com/servicios/quiniela`**

Mundo Deportivo publica el **boleto vigente** y de él se obtiene **todo lo
necesario**: los **15 partidos**, el **número de jornada** ("Jornada 73"), el
**año** y la **fecha de cierre** ("Horario de cierre: Viernes 17 (18:00)"). Es la
fuente primaria porque **es accesible desde Vercel**, a diferencia de SELAE (ver
abajo).

> **Por qué no SELAE como principal.** Comprobado con peticiones reales: SELAE
> **bloquea con Akamai (HTTP 403) las peticiones desde IPs de datacenter** como
> las de Vercel, y además `proximosv3` solo trae la cabecera y `buscadorSorteos`
> solo jornadas ya celebradas. Por eso el boleto entero (partidos + cabecera) se
> lee de Mundo Deportivo.

La fecha de cierre se infiere del texto "día de la semana + día + hora"
(p. ej. "Viernes 17 (18:00)") buscando la fecha concreta más cercana en el futuro
que cumpla ambos, en **hora de España** (`Europe/Madrid`, CET/CEST según DST —
importante porque Vercel corre en UTC). El parser
([`src/lib/mundoDeportivo.ts`](src/lib/mundoDeportivo.ts)) es defensivo; si algún
dato no se puede extraer, queda `null`.

### 2. Enriquecimiento opcional → SELAE

**`GET https://www.loteriasyapuestas.es/servicios/proximosv3?game_id=LAQU&num=1`**

Endpoint JSON **no documentado** de la Web de SELAE. **Solo se consulta si Mundo
Deportivo no bastó** (faltan los partidos o el número de jornada): así el camino
normal no gasta un intento fallido contra SELAE, que además **bloquea con Akamai
(HTTP 403) las IPs de Vercel**. Cuando es accesible (p. ej. desde tu máquina),
aporta `id_sorteo`, fecha de sorteo y **rellena** el número de jornada o la fecha
de cierre si faltaban. Su parser
(`parseaCabecera`) es **robusto**: admite array, objeto único u **objeto
anidado**, y variantes de nombre (`jornada`/`numero_jornada`,
`cierre`/`fecha_cierre`, `anyo`/`anio`, `id_sorteo`/`idsorteo`…), con las mismas
reglas de fecha (ISO en hora de España; nulos/inválidos → `null`).

**Sin genéricos, con error reintentable.** La carga automática exige un **número
de jornada real** (nunca crea una "Jornada actual" genérica); si no lo consigue,
lanza un error explícito y **reintentable** (el cron lo reintenta en el siguiente
disparo). La fecha de cierre es deseable pero **no bloqueante** (si
falta, se avisa y la caducidad por tiempo simplemente no se aplica). Cada
respuesta externa registra de forma **segura** su estado, tipo JSON y **claves
reales** (nunca valores ni cuerpos) para diagnóstico.

**Cómo se parsean los partidos.** La página **no es una API legible por
máquina**, así que el parser
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
memoria de 10 minutos** para no repetir la petición externa en llamadas seguidas.

### Carga programada de la jornada

La jornada se carga **automáticamente** mediante un **cron de Vercel** que llama
a `GET /api/cron/jornada` (ver `vercel.json`):

- **Lunes** a las 10:00 (hora de Barcelona) — jornada de entresemana.
- **Viernes** a las 10:00 (hora de Barcelona) — jornada de fin de semana.

Así, tanto la página de inicio pública como el panel muestran la jornada sin
que nadie tenga que iniciarla a mano. La carga es **idempotente y no
destructiva** (`src/lib/cargaJornada.ts`):

- Si no hay jornada → la crea.
- Si ya está cargada la misma jornada → no hace nada.
- Si la jornada anterior ya terminó (`CERRADA`/`CADUCADA` o pasada su
  `fechaCierre`) → la **archiva** (ver abajo) y la reemplaza por la nueva.
- Si hay una porra **ABIERTA en curso** (distinta jornada, aún en plazo) → **no
  la toca** (no se destruyen apuestas a medias); se reintenta en el siguiente
  disparo.

**Archivo de boletos (no se pierde nada).** Antes de reemplazar/borrar una
jornada que tenga apuestas, se guarda un *snapshot* en la tabla
`historicos_quiniela` (compatible con el generador de PDF). Así, aunque el cron
reemplace una jornada `CERRADA` antes de que nadie descargue su boleto, queda
consultable desde el panel de admin (**Boletos anteriores**) y se puede
regenerar su PDF en `/api/admin/historico/[id]/pdf`. Aplica también al botón
**Reiniciar** del panel (`DELETE /api/quiniela`), que archiva antes de borrar.

El endpoint está protegido con `CRON_SECRET` (Vercel envía
`Authorization: Bearer <CRON_SECRET>`). **Zona horaria:** Vercel programa los
crons en **UTC**; están fijados a las **09:00 UTC** (= 10:00 en horario de
invierno CET, el grueso de la temporada). En horario de verano (CEST) se
dispararían a las 11:00 locales; como la carga es idempotente, el pequeño
desfase es inocuo. Ajusta `vercel.json` si quieres exactitud todo el año.

### Limitaciones (importante)

- Ninguna de las dos fuentes es una **API oficial documentada**: su estructura
  **puede cambiar sin aviso**. Los parsers son defensivos y validados, pero
  podrían dejar de funcionar.
- Mundo Deportivo puede publicar solo los 14 partidos y **omitir el Pleno al
  15** hasta más cerca de la jornada. En ese caso la carga automática devuelve
  un error claro (**502**) y se reintenta en el siguiente disparo del cron.
- La protección **Akamai** de SELAE puede responder **403** a peticiones
  automatizadas según el cliente y la IP. En las pruebas, el `fetch` de
  **Node.js** (con cabeceras de navegador) atraviesa la protección; `curl`
  recibe 403. Desde IPs de datacenter (p. ej. Vercel) puede variar. Como la
  cabecera de SELAE es **best-effort**, si falla se sigue adelante con los
  partidos de Mundo Deportivo.
- La carga es **solo automática** (cron): no hay carga ni formulario manual en el
  panel. Si ambas fuentes fallasen a la vez, la jornada no se carga hasta el
  siguiente disparo del cron con la fuente ya restablecida.

### Ejemplo real de `npm run fetch:jornada`

```
→ Consultando la jornada ABIERTA de La Quiniela…
  (fuente primaria: Mundo Deportivo · SELAE solo como respaldo)

✅ Jornada abierta obtenida con sus 15 partidos:

   Jornada 73 - 2026  (abierta a apuestas)
   Fuente de los partidos: Mundo Deportivo
   Cierre:   17/7/2026, 18:00:00

   Nº  Local                      Visitante
   ──  ─────────────────────────  ─────────────────────────
    1  Bodoglimt                  Fredrikstad
    2  Hamkan                     Tromso
    3  Lillestrom                 Kfum Oslo
   ...
   14  Kalmar                     Malmo
   15  España                     Argentina    ← Pleno al 15

   Total: 15 partidos.
```

---

## API (App Router, `src/app/api/…`)

| Método   | Ruta                        | Descripción                                                                 | Auth      |
| -------- | --------------------------- | --------------------------------------------------------------------------- | --------- |
| `POST`   | `/api/admin/login`          | Doble factor: `{ pin, code }` → emite la cookie de sesión. **429** si abusa. | 2FA       |
| `POST`   | `/api/admin/logout`         | Cierra la sesión (borra la cookie).                                         | —         |
| `GET`    | `/api/admin/session`        | `{ autenticado, totpRequerido }` para la pantalla de login.                | —         |
| `GET`    | `/api/quiniela`             | Estado completo. Sin sesión → vista pública; con sesión → vista admin.     | parcial   |
| `DELETE` | `/api/quiniela`             | Reinicia todo: archiva y borra la Quiniela activa (en cascada).             | sesión    |
| `POST`   | `/api/invitaciones`         | Crea invitación (partido, nombre, multiplicidad). Devuelve el token 1 vez.  | sesión    |
| `DELETE` | `/api/admin/invitaciones/[id]` | Anula una invitación PENDIENTE (409 si ya fue usada).                    | sesión    |
| `GET`    | `/api/invitaciones/[token]` | Datos para la pantalla del jugador. **409** si ya apostado o fuera de plazo. | token     |
| `POST`   | `/api/apuestas`             | Registra la apuesta. **400** multiplicidad; **409** tarde/caducada; **429**. | token     |
| `GET`    | `/api/quiniela/pdf`         | PDF del boleto (solo si `CERRADA`; **409** si no).                          | ninguna   |
| `GET`    | `/api/cron/jornada`         | Carga automática de la jornada (idempotente, no destructiva). **502** si falla la fuente. | cron      |
| `GET`    | `/api/admin/historico`      | Lista los boletos de jornadas anteriores archivadas.                        | sesión    |
| `GET`    | `/api/admin/historico/[id]/pdf` | PDF de un boleto archivado (regenerado desde su snapshot).              | sesión    |

### Seguridad del panel: doble factor (2FA)

El acceso a `/admin` exige **dos factores**:

1. **PIN** (`ADMIN_PIN`) — *algo que sabes*.
2. **Código TOTP** de 6 dígitos de una app de autenticación (Google
   Authenticator, Authy, 1Password…) — *algo que tienes*, con `TOTP_SECRET`.

Al superar ambos en `POST /api/admin/login` se emite una **cookie de sesión
firmada** (HMAC con `SESSION_SECRET`), `httpOnly` + `Secure` + `SameSite=Strict`,
TTL de 8 h y con un **`jti`** aleatorio. Las demás rutas de admin ya **no reciben
el PIN**: validan esa cookie (**401** si falta o caduca). El login está protegido
con **rate limiting** por IP (5 intentos/10 min → **429**) y con **anti-replay**
(un mismo código TOTP no se puede usar dos veces). El mensaje de error no revela
qué factor ha fallado.

**Estado compartido entre instancias serverless.** El rate limiting, el
anti-replay del TOTP y la **revocación de sesiones** se guardan en Postgres
(tablas `rate_limits`, `totp_step`, `sesiones_revocadas`), no en memoria, para
que funcionen aunque Vercel reparta las peticiones entre varias instancias. El
`logout` **revoca** el `jti` (la sesión deja de valer aunque el token esté en
otro sitio). Ante un fallo de BD, cada comprobación decide su modo: el
**rate-limit del login es *fail-closed*** (rechaza con **503** reintentable,
para no permitir fuerza bruta distribuida entre instancias); el anti-replay del
TOTP y la revocación de sesiones son *fail-open* (bajo impacto: solo dejarían
reenviar el mismo código, o una revocación caduca sola en ≤8 h). El rate-limit
compartido en Postgres cubre **también los endpoints públicos** (apuestas y
consulta de invitación), no solo el login.

**Cabeceras de seguridad y CSP.** Todas las respuestas llevan una
**Content-Security-Policy con *nonce* por petición** ([`src/middleware.ts`](src/middleware.ts)):
`script-src` usa `'nonce-…' 'strict-dynamic'` en lugar de `'unsafe-inline'`, así
que un `<script>` inyectado no llega a ejecutarse. El resto de cabeceras
(`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Permissions-Policy` y HSTS en producción) se aplican desde `next.config.mjs`.

**Enrolamiento (una vez):**

```bash
npm run totp:setup     # escanea el QR con tu app y copia el TOTP_SECRET
```

Pon el `TOTP_SECRET` en `.env` (local) y en las variables de entorno de Vercel
(producción). En **desarrollo**, si `TOTP_SECRET` está vacío, se **omite** el
segundo factor (solo se pide el PIN) para no bloquear el arranque; en
**producción** es obligatorio.

### Ejemplos (`curl`)

```bash
# 1) Login 2FA: obtén la cookie de sesión (PIN + código de tu app)
curl -c cookies.txt -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"pin":"TU_PIN","code":"123456"}'

# 2) A partir de aquí, usa la cookie (-b cookies.txt) en las rutas de admin.
#    La jornada la carga sola el cron; para forzarla en local, invoca el cron:
curl http://localhost:3000/api/cron/jornada

# Crear una invitación para el partido 3 (doble)
curl -b cookies.txt -X POST http://localhost:3000/api/invitaciones \
  -H "Content-Type: application/json" \
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
│   ├── middleware.ts             # CSP con nonce por petición
│   ├── app/
│   │   ├── page.tsx               # home pública
│   │   ├── admin/page.tsx         # panel de administración (PIN)
│   │   ├── apostar/[token]/page.tsx
│   │   └── api/…                  # route handlers
│   ├── components/                # FilaPartido, CasillasSignos, Escudo, Select, Toast…
│   └── lib/
│       ├── jornadaFetcher.ts      # orquesta Mundo Deportivo (primario) + SELAE (respaldo)
│       ├── mundoDeportivo.ts      # scraper del boleto vigente (15 partidos + cabecera)
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
| `npm run fetch:jornada`  | Prueba real del fetcher de la jornada.                        |
| `npm run totp:setup`     | Genera el secreto y el QR del doble factor (2FA).             |

## Nota

Este README está escrito en español debido a los potenciales usuarios que tienen la aplicación.