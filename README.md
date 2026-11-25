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
| `VAPID_SUBJECT` / `CRON_SECRET` | Fase 3 | Contacto VAPID y autorización del programador |
| `EWELINK_APP_ID` / `EWELINK_APP_SECRET` | Diagnóstico eWeLink | Solo servidor; configurar también en Vercel Production |
| `GROQ_API_KEY` | Asistente de voz | Solo servidor; configurar también en Vercel Production |
| `GROQ_TRANSCRIBE_MODEL` | Asistente de voz | Opcional; `whisper-large-v3` por defecto, `whisper-large-v3-turbo` para priorizar velocidad |

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

### Agenda mensual

En `/panel/agenda`, «Ver calendario mensual» permite saltar a cualquier día
y marca cuántas visitas vigentes tiene cada fecha (las omitidas no cuentan).
Cambiar de mes no cambia la fecha seleccionada; al tocar un día se usa esa
fecha para el formulario habitual. La vista sigue abierta tras agregar o
quitar visitas desde ella. El resumen mensual se obtiene en una sola consulta
agrupada a PostgreSQL, no mediante una petición por día.

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
- **Fase 3**: PWA instalable, avisos para José (llaves y bomba), protocolo de
  salida y visitas offline cifradas con PIN y cierre pendiente de sincronización.
  Mediciones, alertas de cloro y calculadora de químicos quedan pospuestas.
- **Fase 4**: reportes al cliente por WhatsApp, historial y galería.
- **Fase 5**: control de pagos, inventario y métricas.

## Fase 3: puesta en marcha

1. Aplicar las migraciones `0007` y `0008` antes de desplegar el código que las usa.
2. Generar un par de claves con `pnpm exec web-push generate-vapid-keys` y configurar
   `PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y `CRON_SECRET`
   en `.env.local` y Vercel Production. Conservar los secretos fuera del repositorio.
   Ejecutar `pnpm cron:setup`: habilita `pg_cron` y `pg_net` en Supabase,
   guarda el token de Vercel cifrado en Vault y prepara un trabajo **inactivo**
   cada minuto. Después de migrar y desplegar, ejecutar `pnpm cron:activate`
   para probar el endpoint y activar el trabajo. Sin activar el programador
   no se enviarán los avisos aunque el teléfono esté suscrito.
   Actualmente la ruta usa `jym-mantenimientos.vercel.app`; el dominio
   `jymmantenimientos.com` aún no resuelve. Para migrar el programador al
   dominio definitivo, actualizar `REMINDER_CRON_URL` y revisar el trabajo antes
   de activarlo: el script no sobrescribe un trabajo existente distinto.
3. Antes de desplegar los avisos para varios teléfonos, ejecutar `npm run db:migrate`
   para crear el registro de entrega por dispositivo. En la configuración actual
   **Luis y José tienen rol de dueño**: cada uno entra a **Ajustes** desde su
   propia cuenta y activa los avisos en su propio iPhone, sin seleccionar un
   destinatario excluyente. Si en el futuro José usa el rol técnico, el dueño
   selecciona esa cuenta en Ajustes. Seleccionar otra cuenta técnica no borra
   los dispositivos de los dueños. En iPhone, primero añadir la PWA a la pantalla de inicio.
   Pulsar «Enviar prueba a este teléfono» en ambos dispositivos y confirmar
   personalmente que aparezca cada notificación. El servidor solo puede verificar
   que el servicio push la aceptó; no que el sistema operativo la mostró.
   Después probar una llave con plazo corto y una bomba con tiempo vencido:
   ambos teléfonos deben recibir una vez cada aviso. Si solo uno falla, el
    reintento no debe duplicarse en el otro. Desactivar uno no afecta al otro.
    Tras actualizar esta versión, ejecutar `pnpm db:migrate` para crear los índices
    del cron (`0010`) antes de verificar el rendimiento en producción. El cron
    continúa cada minuto, pero procesa como máximo diez envíos por ejecución;
    un aviso fallido se reintenta hasta ocho veces. Revisar los errores
    `[push-reminder] Se agotaron los reintentos` en los logs de Vercel.
4. Abrir **Hoy** con internet y, si hay visitas programadas para hoy, esperar
   el aviso **«Jornada lista sin internet»**: la PWA comprueba Hoy, Ruta,
   todas las visitas del día y sus recursos en ese
   teléfono. Si aparece «Preparando» o faltan visitas, **no asumir que está lista**:
   mantener la app abierta y recuperar una conexión estable. Si no hay visitas
   hoy, aparece «No hay visitas programadas para hoy»; las de fechas futuras
   se preparan al llegar su día. Con señal débil, una
   página ya preparada se abre desde el teléfono si la red tarda más de unos segundos.
   Una visita nunca preparada en el teléfono no se puede abrir sin red.
   La copia local (incluidos códigos de acceso) **no está cifrada con un PIN**:
   proteger el teléfono con bloqueo de pantalla. Al cerrar sesión se borran las
   copias y se advierte si hay cambios pendientes. Los registros anteriores con
   PIN se mantienen accesibles desde la advertencia del panel hasta sincronizarlos.
5. Usar la **pantalla normal de la visita**, incluso sin conexión. Llegada,
   progreso, productos, bomba y salida se guardan en el teléfono antes de
   intentar enviar al servidor. Con la app abierta se reintenta al recuperar
   conexión, al volver a enfocarla y periódicamente; en iPhone no se garantiza
   sincronización con la app cerrada. La salida solo está confirmada cuando
   desaparece el aviso «pendiente de sincronizar». Ante un conflicto se conserva
   la copia local para compararla con el servidor. El seguimiento de floculación
   y las tareas de llaves de llenado requieren internet; no dejar una llave
   abierta sin alarma independiente. No hay push garantizado sin conexión:
    usar también una alarma para la bomba. Probar el flujo en ambos teléfonos.

### Comprobación de campo antes de usarla sin red

1. En cada teléfono, abrir Hoy con Internet, esperar «Jornada lista sin internet»
   y confirmar el número de visitas previstas. No cerrar sesión durante la jornada.
2. Activar modo avión y cerrar/reabrir la app. Abrir Hoy, Ruta y dos visitas;
   registrar llegada, checklist, notas, productos y horas de bomba. Confirmar
   salida: debe decir **pendiente de confirmar en el servidor**.
3. Cambiar entre visitas y volver a abrir la app: los cambios locales deben
   conservarse. Las listas de Hoy y Ruta pueden ser copias anteriores; consultar
   el progreso dentro de cada visita.
4. Desactivar modo avión y abrir el panel. Esperar a que desaparezca el aviso de
   cambios pendientes; comprobar en las visitas que el servidor refleja el trabajo.
   Ante conflicto o error, conservar los datos locales y revisarlos antes de borrar
   copias o cerrar sesión.
 5. Repetir con la red muy lenta: comprobar el aviso «Abriendo página…», que no se
   pueda enviar el mismo formulario varias veces y que una página preparada se abra
     sin quedar esperando la red indefinidamente. Google Maps, seguimientos y tareas
     de llaves de llenado requieren conexión; utilizar una alarma independiente.

## Asistente de voz del panel

- Configurar `GROQ_API_KEY` en `.env.local` para desarrollo y en las variables de
  entorno de **Vercel Production** para probar la PWA desplegada. No usar
  `PUBLIC_` ni compartir la clave con el navegador.
- La captura pide mono con supresión de ruido, cancelación de eco y ganancia
  automática, graba a 96 kbps y descarta audios de menos de 0,4 s. El servidor
  envía a Whisper un prompt con los alias de propiedades y nombres de clientes,
  revisa `no_speech_prob`, `avg_logprob` y `compression_ratio` del formato
  `verbose_json` y pide repetir cuando la frase es dudosa. El modelo por defecto
  es `whisper-large-v3`; con `GROQ_TRANSCRIBE_MODEL=whisper-large-v3-turbo` se
  prioriza la velocidad. En **Ajustes → Voz de Luis** se puede activar el
  diagnóstico para ver la última frase transcrita.
- Desde el panel autenticado, tocar el **micrófono flotante**, permitir el micrófono y grabar
  una frase de hasta 20 segundos. El teléfono necesita HTTPS e internet. La
  PWA graba en el formato disponible (MP4 en iPhone o WebM en otros navegadores)
  y envía el audio a Groq Whisper; no se guarda el audio en el panel.
- Luis (foto `/agent.png`) entiende «Crear una visita para hoy en la casa de Bill»,
  «mañana», «pasado mañana», «el viernes» o «el 3 de diciembre». Calcula
  la fecha en Costa Rica, no crea visitas pasadas y dice el día concreto antes
  de exigir «sí, confirmo». Una fecha pasada sin año o ambigua requiere
  repetir la petición con una fecha clara. También responde consultas como
  «¿Se le puso cloro a Olga esta semana?», «la semana pasada», «hace tres semanas»
  o «la semana del 12 de octubre del 2025». Las semanas van de lunes a domingo.
  Si hay varios clientes con el mismo nombre, conserva la pregunta, la fecha
  y las propiedades candidatas mientras se aclara cuál de ellas es: se puede
  responder con el alias o «opción uno», «opción dos», etc.
  No muestra la transcripción salvo que se active el diagnóstico en
  **Ajustes → Voz de Luis**: genera la respuesta en el teléfono con Piper y
  después intenta abrir el micrófono para la siguiente respuesta. La voz se
  configura en **Ajustes → Voz de Luis**, por teléfono: Davefx (es_ES,
  masculina, recomendada), Carlfm (más ligera) o una voz instalada en el
  teléfono. La misma voz Piper se usa en iPhone y Android. La primera vez
  descarga el modelo ONNX y los recursos WebAssembly (≈93 MB Davefx, ≈58 MB
  Carlfm) con progreso visible; queda guardada en el teléfono y «Borrar
  descarga» libera ese espacio. No emplea una API de voz de pago. En el
  asistente, la primera apertura pide descargar la voz, con la opción de usar
  la del teléfono, para no iniciar una descarga grande sin avisar.
  Los binarios de Piper se copian a `public/piper/` al ejecutar `pnpm dev` o
  `pnpm build`; no se versionan en el repositorio.
  Apple no permite usar las voces de Siri en aplicaciones web: si se instala
  una, el sistema ofrecerá otra (por ejemplo Mónica). Para usar una voz del
  teléfono hay que descargarla en Ajustes → Accesibilidad → Contenido leído →
  Voces → Español y luego tocar «Actualizar lista»; puede hacer falta cerrar
  y abrir la app. Si iOS bloquea el audio o el micrófono, tocar el altavoz o
  micrófono como respaldo. La prueba real de rendimiento y reproducción en
  ambos teléfonos está pendiente.
  Davefx usa la revisión `5ec43b186ef915a195d3ddbcfd9916e76c503c3f`
  de [Piper Voices](https://huggingface.co/rhasspy/piper-voices); no sustituir
  por pesos anteriores del mismo nombre: su cadena de entrenamiento no tenía
  los mismos permisos. Conservar su `MODEL_CARD` y comprobar
  [las condiciones de los modelos](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/COMMERCIAL_USE.md)
  antes de actualizar la revisión.
  La escucha se detiene tras silencio, al cerrar la ventana o al pasar la
  aplicación a segundo plano; no hay escucha permanente. La primera escucha de
  cada sesión también es automática: tras ~1,3 s sin hablar se envía la frase,
  y si el teléfono no entrega muestras de audio al analizador se envía igual al
  llegar al tope de 12 s para no perder la primera petición.
  La visita **no se crea** hasta escuchar la propuesta y decir claramente
  «sí, confirmo»; «cancelar» descarta la propuesta.
  Un «sí» aislado no confirma nada. Si hay varios inmuebles para el nombre
  indicado, pide especificar el alias o el número de opción.
- «Inicia la visita de Olga» solo propone una visita programada hoy y registra
  la llegada después de «sí, confirmo». «Cierra la visita» revisa cada tarea y
  los tres pasos de salida pendientes: solo «hecho» acredita cada paso; si
  alguno está pendiente, no cierra. Al final vuelve a pedir confirmación; una
  bomba registrada en marcha bloquea el cierre. Requiere conexión.
- «Recuérdame comprar concentrado para Negro» propone un recordatorio personal
  para hoy, sin alarma si no se indicó hora. «Recuérdame ... mañana a las 4 de
  la tarde» lo programa con hora de Costa Rica; tras «sí, confirmo» aparece
  solo en el «Hoy» de quien lo creó y puede marcarse como hecho. Con los avisos
  activados, el cron intentará enviar una notificación solo a los dispositivos
  de esa cuenta; no sustituye una alarma del teléfono.
- «Semana pasada» significa lunes a domingo previos en horario de Costa Rica;
  se consulta el registro de productos asociado a las visitas programadas de
  esas fechas. La ausencia de registro no demuestra que no se aplicó producto:
  un dispositivo podría tener trabajo sin sincronizar.
- Consultas habladas de solo lectura: «Resume la visita de Olga de hoy»,
  «¿Qué pasó en la visita anterior de Olga?» o «la del 20 de noviembre»;
  «¿Qué me falta hoy?» (visitas, pasos de salida, recordatorios propios y llaves
  abiertas); «¿Qué quedó pendiente en Olga?»; «Compara las últimas dos visitas
  de Olga»; «¿Cuánto cloro se registró este mes para Olga?» (pastillas y gramos
  por separado); «¿Cuánto tiempo estuvimos en Bill esta semana?».
  Ante propiedades ambiguas ofrece opciones numeradas y conserva la pregunta.
  Tras un resumen admite «¿y en la anterior?» o «¿y qué quedó pendiente?» sin
  repetir el nombre; el contexto caduca tras cinco minutos o al cerrar.
  Solo informa de datos guardados: la ausencia de registro o de horas no prueba
  que el trabajo no se haya hecho, y no incluye cambios aún sin sincronizar.
- En el iPhone de Luis: abrir la PWA instalada, probar la captura, respuesta
  hablada y reapertura automática del micrófono; después confirmar una visita
  de prueba diciendo «sí, confirmo» y comprobar la agenda. Probar también
  «cancelar», un «sí» aislado, una consulta de cloro con registro conocido esta
  semana, una aclaración de propiedad ambigua con «opción dos», una visita
  futura y otra ya programada, la voz masculina y la falta de conexión.
  Repetir las pruebas de voz en el Android de José. No
  escucha en segundo plano ni controla equipos físicos.

## Diagnóstico eWeLink (solo lectura)

- Registrar en eWeLink Developer el callback exacto
  `https://jymmantenimientos.com/auth/ewelink/callback`.
- Configurar `EWELINK_APP_ID` y `EWELINK_APP_SECRET` en Vercel Production
  (además de `.env.local`). Solo el dueño puede abrir `/panel/ewelink` y
  autorizar la cuenta desde el dominio canónico.
- La autorización vincula una única cuenta eWeLink al panel; sus tokens se
  almacenan cifrados en PostgreSQL y no se envían al navegador. Se consulta
  manualmente el inventario de la vivienda actual (máximo 30 elementos) y,
  a petición del dueño, los campos de estado/consumo que realmente devuelva
  la API. No hay comandos de encendido/apagado ni sondeo periódico.
- La API oficial recomienda dejar al menos un segundo entre llamadas y el
  APPID gratuito tiene una cuota regional. Si no se muestran datos de consumo,
  no inferir que el dispositivo carece de ellos: pueden depender del UIID,
  del permiso de la app o de la actualización de sus datos.
  En la cuenta vinculada se verificó el POWR316D con UIID 190: el servidor
  devuelve `power`, `current`, `voltage`, `dayKwh` y `monthKwh`; los valores
  se muestran sin convertir hasta validar las unidades de ese protocolo.

### Vinculaciones eWeLink

Los dueños de JyM pueden abrir una propiedad y usar «Gestionar equipos» para
asignarle uno o varios Sonoff de la única cuenta eWeLink autorizada. Cada ID
de dispositivo solo puede estar en una propiedad; desvincular no manda órdenes
al dispositivo. Se registran autor y fecha de cada alta y baja. La migración
`0011` copia el piloto «Piscina bill» a Casa Mariposa (Bill), conserva la clave
anterior `ewelink_pilot_device` en `settings` para recuperación y activa RLS
en las tablas nuevas. **Aplicar la migración antes del despliegue del código.**
El inventario se consulta bajo demanda y puede requerir varias páginas (al
menos un segundo entre llamadas); la cuota y los permisos de marca dependen
de eWeLink. No se puede vincular un dispositivo no devuelto por esa cuenta.

Solo el dueño puede abrir la lectura desde la propiedad o una visita; cada
consulta es manual y muestra la hora de solicitud, no la hora de medición del
equipo. La interfaz no permite encender ni apagar ni relaciona el temporizador
de visitas con el estado real de la bomba. Antes de cualquier control físico
de «Piscina bill» debe revisarse con un electricista su instalación directa al
motor y la corriente de arranque.
