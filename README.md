# JyM Mantenimientos

Sitio web y panel interno de operaciones para **JyM Mantenimientos**, empresa de
mantenimiento de piscinas en La Fortuna y San Carlos, Costa Rica.

- `/` y `/blog` → sitio público (estático, SEO).
- `/panel` → aplicación interna con base de datos, protegida con login.

## Stack

- **Astro 5** en modo SSR con adaptador de **Vercel**
- **React 19** + **Tailwind 4** para las islas interactivas
- **Supabase** (PostgreSQL + Auth + Storage)
- **Drizzle ORM** para esquema y migraciones
- **Leaflet + OpenStreetMap** para el mapa de propiedades
- **Zod** para validación compartida entre cliente y servidor

## Requisitos

- Node 24+
- pnpm 10+
- Un proyecto de Supabase
- (Para producción) una cuenta de Vercel

## Configuración local

```bash
pnpm install
cp .env.example .env.local   # rellena los valores reales
pnpm db:migrate              # crea las tablas en Supabase
pnpm seed:owner              # crea el usuario dueño y muestra su contraseña
pnpm seed:demo               # opcional: 6 clientes y propiedades de ejemplo
pnpm dev
```

El panel queda en <http://localhost:4321/panel>.

### Variables de entorno

| Variable | Dónde se usa | Notas |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Cliente y servidor | URL del proyecto Supabase |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Cliente y servidor | Publishable key (`sb_publishable_...`) |
| `SUPABASE_SECRET_KEY` | Solo scripts/admin | Secret key (`sb_secret_...`). **Nunca** en el navegador |
| `DATABASE_URL` | Runtime | Transaction pooler, puerto **6543** |
| `DIRECT_URL` | Migraciones | Session pooler, puerto **5432** |
| `APP_URL` | Enlaces de auth | `http://localhost:4321` en local |
| `APP_TIMEZONE` | Fechas | `America/Costa_Rica` |
| `OWNER_EMAIL` / `OWNER_PASSWORD` | Seed | Temporal; borrar después de crear el dueño |
| `OWNER_NAME` | Seed | Nombre mostrado del dueño |
| `GOOGLE_MAPS_API_KEY` | Fase 2 | Rutas optimizadas |
| `PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Fase 3 | Notificaciones push |

Las variables `PUBLIC_*` sí llegan al navegador. El resto son solo de servidor.

## Scripts

| Comando | Acción |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción (genera `.vercel/output`) |
| `pnpm preview` | Previsualizar el build |
| `pnpm check` | Chequeo de tipos de Astro/TypeScript |
| `pnpm db:generate` | Generar una migración a partir del esquema |
| `pnpm db:migrate` | Aplicar migraciones pendientes |
| `pnpm db:studio` | Abrir Drizzle Studio |
| `pnpm seed:owner` | Crear/actualizar el usuario dueño |
| `pnpm seed:demo` | Datos de ejemplo (solo si no hay clientes) |

## Estructura

```
src/
├── db/                  esquema Drizzle y conexión
├── lib/
│   ├── supabase/        clientes de Supabase (servidor y navegador)
│   ├── validation.ts    esquemas Zod
│   ├── format.ts        fechas y etiquetas en es-CR
│   └── http.ts          helpers de request/response
├── server/              consultas y mutaciones a la base
├── middleware.ts        refresco de sesión y protección de /panel
├── components/panel/    formularios y mapa del panel
├── layouts/             Layout público, Blog, Auth y Panel
└── pages/
    ├── panel/           páginas del panel
    ├── auth/            callback y recuperación de contraseña
    └── api/             endpoints (público de leads + panel)
drizzle/                 migraciones SQL versionadas
scripts/                 seeds de dueño y datos demo
```

## Seguridad

- Las tablas tienen **RLS activo sin políticas**: la publishable key no puede
  leer ni escribir datos directamente por PostgREST. El panel usa Drizzle del
  lado del servidor.
- El middleware valida la sesión con `getUser()` y refresca las cookies en cada
  request a `/panel` y `/auth`.
- `/panel` está marcado `noindex` y bloqueado en `robots.txt`.
- Los formularios del panel envían JSON a endpoints protegidos; la validación
  se repite en el servidor con Zod.
- Los leads públicos tienen honeypot y límite de intentos por IP.

## Checklist de Supabase

1. **Authentication → Providers → Email**: desactivar *Allow new users to sign up*.
2. **Authentication → URL Configuration**: añadir `http://localhost:4321` y el
   dominio de producción; redirect URLs `.../auth/callback`.
3. **Authentication → Password strength**: activar *Leaked password protection*.
4. **Project Settings → API Keys**: rotar cualquier secret key que se haya
   compartido y guardar la nueva solo en `.env.local` / Vercel.
5. **Project Settings → Database → SSL Configuration**: descargar la CA si se
   quiere verificación TLS estricta (hoy se usa `ssl: 'require'`).
6. Configurar SMTP propio para que la recuperación de contraseña llegue de forma
   confiable en producción.

> El plan gratuito de Supabase pausa proyectos tras 7 días sin actividad. Para
> una herramienta de uso diario conviene el plan Pro.

## Deploy en Vercel

1. Importar el repositorio en Vercel.
2. Añadir todas las variables de entorno (las mismas de `.env.local`).
3. Build command: `pnpm build`. El adaptador genera `.vercel/output`
   automáticamente.
4. Tras el primer deploy, agregar el dominio de producción a las redirect URLs
   de Supabase.

## Roadmap

- **Fase 1 (actual)**: base de datos, login, clientes, propiedades con mapa,
  leads y ajustes.
- **Fase 2**: agenda, rutas optimizadas con Google Routes, pantalla "Hoy" y modo
  visita con temporizador de bomba.
- **Fase 3**: notificaciones push, recordatorios de cloro, calculadora de
  químicos, protocolo de salida y funcionamiento offline.
- **Fase 4**: reportes al cliente por WhatsApp, historial y galería.
- **Fase 5**: control de pagos, inventario y métricas.
