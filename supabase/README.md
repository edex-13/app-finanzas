# Supabase

Este directorio contiene **todo lo que define tu backend** (DB + Auth) versionado en git. Usamos el [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (instalado localmente como dev-dep, accesible vía `npx supabase` o los scripts `npm run sb:*`).

## Estructura

```
supabase/
├── config.toml                      Configuración del proyecto (Auth, DB, Storage, etc.)
├── migrations/                      DDL versionado, cada archivo es inmutable
│   ├── 20260601000001_initial_schema.sql
│   ├── 20260601000002_rls_policies.sql
│   └── 20260601000003_triggers.sql
└── seed.sql                         Seed opcional para desarrollo (no se sube a prod)
```

## Cómo trabajar (modo "solo nube + push")

> No necesitas Docker. Solo el CLI y un proyecto en supabase.com.

### 1. Crear el proyecto en la nube

1. Crea uno en [supabase.com](https://supabase.com/dashboard) (anótate la región y la DB password, la vas a necesitar).
2. Anota el **Project Reference** (el slug, p.ej. `abcdefghij...`). Lo encuentras en **Project Settings → General**.

### 2. Autenticarte y enlazar

```bash
npx supabase login                          # abre el navegador, te pide el access token (one-time)
npm run sb:link -- --project-ref <REF>      # enlaza este repo con tu proyecto en la nube
                                            # te pedirá el database password
```

Esto crea `supabase/.temp/project-ref` (gitignoreado).

### 3. Aplicar migraciones a la nube

```bash
npm run sb:push
```

Esto corre todas las migraciones pendientes contra tu DB remota y registra cada una en la tabla `supabase_migrations.schema_migrations` (para no volver a aplicarlas). **Idempotente**: si ya las aplicaste, no hace nada.

### 4. (Opcional) Sincronizar configuración de Auth/DB

`config.toml` define cómo debe estar configurado tu proyecto. Para empujar esa config a la nube:

```bash
npx supabase config push                    # sincroniza [auth], [storage], etc.
```

Esto evita tener que entrar al dashboard a tocar settings de Auth (email confirm, redirects, etc.) — todo queda versionado aquí.

### 5. Obtener tus claves API

En **Project Settings → API**:
- `Project URL` → `VITE_SUPABASE_URL` en `.env.local`
- `anon public` → `VITE_SUPABASE_ANON_KEY` en `.env.local`

## Flujo de trabajo diario

### Crear una nueva migración

```bash
npm run sb:new-migration -- nombre_descriptivo
# crea supabase/migrations/YYYYMMDDHHMMSS_nombre_descriptivo.sql vacío
```

Edita el archivo, luego:

```bash
npm run sb:push                  # aplica a la nube
npm run sb:gen-types             # regenera src/types/database.ts
```

### Ver qué cambios tienes pendientes

```bash
npm run sb:diff                  # diff entre tu local y la nube (necesita stack local)
npx supabase migration list      # lista qué migraciones existen y cuáles ya están aplicadas
```

### Reset (PELIGROSO - solo para desarrollo)

```bash
npm run sb:reset                 # tira TODA la DB remota y reaplica desde cero + seed.sql
```

## Configuración de Auth

Todo se configura en `supabase/config.toml`, sección `[auth]`. Defaults que ya dejamos:

| Setting | Valor | Significado |
|---|---|---|
| `auth.site_url` | `http://localhost:5173` | URL base para emails y redirects |
| `auth.additional_redirect_urls` | `localhost:5173`, `127.0.0.1:5173` | URLs permitidas para post-login redirect |
| `auth.enable_signup` | `true` | Permite que cualquiera se registre |
| `auth.minimum_password_length` | `6` | Coincide con la validación Zod del frontend |
| `auth.email.enable_signup` | `true` | Signup por email habilitado |
| `auth.email.enable_confirmations` | `false` | **Modo dev**: no requiere confirmar email |

### Para producción

Cuando despliegues a producción, edita `config.toml`:

1. Añade tu URL real a `additional_redirect_urls`:
   ```toml
   site_url = "https://finanzas.tu-dominio.com"
   additional_redirect_urls = [
     "https://finanzas.tu-dominio.com",
     "https://finanzas.tu-dominio.com/**"
   ]
   ```

2. Activa confirmaciones de email (recomendado en prod):
   ```toml
   [auth.email]
   enable_confirmations = true
   ```

3. Configura un SMTP propio (Supabase tiene rate limits muy bajos en su SMTP de prueba):
   ```toml
   [auth.email.smtp]
   enabled = true
   host = "smtp.sendgrid.net"
   port = 587
   user = "apikey"
   pass = "env(SENDGRID_API_KEY)"
   admin_email = "no-reply@tu-dominio.com"
   sender_name = "Finanzas"
   ```
   Y exporta `SENDGRID_API_KEY` en tu shell o `.env` (sin commitear).

4. Aplica los cambios:
   ```bash
   npx supabase config push
   ```

### Añadir OAuth (Google, etc.) más adelante

En `config.toml`:

```toml
[auth.external.google]
enabled = true
client_id = "env(GOOGLE_CLIENT_ID)"
secret = "env(GOOGLE_CLIENT_SECRET)"
redirect_uri = ""    # se llena solo si tienes URL custom
```

Crea OAuth credentials en [console.cloud.google.com](https://console.cloud.google.com), añade `https://<TU-PROJECT-REF>.supabase.co/auth/v1/callback` como authorized redirect URI, exporta las env vars y `npx supabase config push`.

## Generar tipos TypeScript

Después de cada cambio de schema:

```bash
npm run sb:gen-types
```

Sobrescribe `src/types/database.ts` con los tipos generados desde la DB real. (Los tipos que vienen versionados son una versión escrita a mano que arranca sin este paso.)

## RLS — Resumen

Todas las tablas usan RLS:
- `profiles` usa `auth.uid() = id` (es 1:1 con `auth.users`).
- El resto usa `auth.uid() = user_id`.

Trigger `handle_new_user` (en `0003_triggers.sql`) corre al hacer signup:
- Inserta una fila en `profiles` y `settings` para el nuevo usuario.
- Inserta 14 categorías sistema por defecto (Alimentación, Transporte, Salario, etc.).
