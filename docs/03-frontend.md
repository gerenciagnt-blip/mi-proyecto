# 5. Frontend

Documentación técnica de la capa de presentación del Sistema PILA. La aplicación
web vive en `apps/web` (paquete `@pila/web`) y se construye con Next.js 15 App
Router sobre React 19. El frontend está fuertemente acoplado al modelo
_server-first_: la mayoría de las páginas son Server Components, los formularios
usan Server Actions con `useActionState`, y el estado global del cliente es
deliberadamente mínimo (no hay Redux ni stores compartidos). Los Route Handlers
de `apps/web/src/app/api/` se reservan para descargas binarias, conteos
ligeros llamados desde polling y endpoints públicos como `/api/health`.

## 5.1 Framework y stack

| Dependencia                | Versión                       | Rol                                                           |
| -------------------------- | ----------------------------- | ------------------------------------------------------------- |
| `next`                     | `15.1.3`                      | App Router, Server Components, Server Actions, Route Handlers |
| `react` / `react-dom`      | `19.0.0`                      | Server + Client Components, hook `useActionState`             |
| `tailwindcss`              | `^3.4.17` (config TypeScript) | Sistema de estilos utility-first                              |
| `tailwindcss-animate`      | `^1.0.7`                      | Animaciones predefinidas                                      |
| `class-variance-authority` | `^0.7.1`                      | Variantes tipadas para componentes UI                         |
| `clsx` + `tailwind-merge`  | `^2.1.1` / `^3.5.0`           | Utilidad `cn()` en `apps/web/src/lib/utils.ts`                |
| `lucide-react`             | `^1.8.0`                      | Icon set (uso intensivo en nav, botones, alerts)              |
| `next-auth`                | `5.0.0-beta.31`               | Sesión, login y rate limiting (NextAuth v5 / Auth.js)         |
| `zod`                      | `^4.3.6`                      | Validación server-side de formularios y APIs                  |
| `@react-pdf/renderer`      | `^4.5.1`                      | Generación de PDFs (cartera, comprobantes)                    |
| `exceljs` / `xlsx`         | `^4.4.0` / `^0.18.5`          | Exportes Excel desde Route Handlers                           |
| `@sentry/nextjs`           | `^10.50.0`                    | Observabilidad (instrumentation client/server)                |

Fuentes: `apps/web/package.json` (líneas 16-37) y `apps/web/tailwind.config.ts`.

El layout raíz `apps/web/src/app/layout.tsx` carga las fuentes Google
**Montserrat** (heading) y **Roboto** (sans) vía `next/font/google` y las expone
como variables CSS (`--font-montserrat`, `--font-roboto`). El layout marca
`export const dynamic = 'force-dynamic'` para evitar el prerender estático del
shell — la mayoría de las rutas dependen de la sesión NextAuth, así que el
prerender no aporta valor y evita un bug conocido del fallback `/404` que
intenta importar `<Html>` desde Pages Router.

## 5.2 Estructura de routes (App Router)

La aplicación expone **62 archivos `page.tsx`** distribuidos en tres
secciones principales: `/login`, `/dashboard` y `/admin/*` (la mayor parte del
área autenticada). El árbol completo de rutas se organiza así:

### Rutas raíz

| Ruta         | Archivo                               | Notas                                                 |
| ------------ | ------------------------------------- | ----------------------------------------------------- |
| `/`          | `apps/web/src/app/page.tsx`           | Landing — redirige a `/login` o `/admin` según sesión |
| `/login`     | `apps/web/src/app/login/page.tsx`     | Login con `LoginForm` (Server Action)                 |
| `/dashboard` | `apps/web/src/app/dashboard/page.tsx` | Dashboard del aliado (vista compacta)                 |
| `/admin`     | `apps/web/src/app/admin/page.tsx`     | Dashboard ejecutivo (KPIs, banner de cobros)          |

### Subárbol `/admin` (61 rutas)

Agrupado por sección de negocio:

| Sección                           | Rutas                                                                                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Configuración**                 | `/admin/configuracion/bitacora`, `/admin/configuracion/colpatria-jobs`, `/admin/configuracion/colpatria-jobs/[id]`                                                                                                                     |
| **Sistema**                       | `/admin/sistema`                                                                                                                                                                                                                       |
| **Empresas planilla**             | `/admin/empresas`, `/admin/empresas/[id]`, `/admin/empresas/[id]/config`, `/admin/empresas/[id]/colpatria`                                                                                                                             |
| **Empresa CC (Cuentas de Cobro)** | `/admin/cuentas-cobro`                                                                                                                                                                                                                 |
| **Sucursales**                    | `/admin/sucursales`, `/admin/sucursales/[id]`                                                                                                                                                                                          |
| **Usuarios y roles**              | `/admin/usuarios`, `/admin/usuarios/[id]`, `/admin/usuarios/[id]/empresas`, `/admin/usuarios/roles`, `/admin/usuarios/roles/[id]`                                                                                                      |
| **Catálogos / Parametrización**   | `/admin/catalogos` (índice) + 11 subcatálogos: `actividades`, `asesores`, `comprobantes`, `comprobantes/[sucursalId]`, `entidades`, `medios-pago`, `planes`, `servicios`, `smlv`, `tarifas`, `tipos-cotizante`, `tipos-cotizante/[id]` |
| **Notificaciones**                | `/admin/notificaciones`                                                                                                                                                                                                                |
| **Base de datos**                 | `/admin/base-datos`, `/admin/base-datos/importar`                                                                                                                                                                                      |
| **Transacciones**                 | `/admin/transacciones`, `/admin/transacciones/cartera`, `/admin/transacciones/cuadre`, `/admin/transacciones/historial`                                                                                                                |
| **Planos**                        | `/admin/planos`                                                                                                                                                                                                                        |
| **Administrativo**                | `/admin/administrativo`, `/admin/administrativo/cartera`, `/admin/administrativo/incapacidades`                                                                                                                                        |
| **Soporte · Cartera**             | `/admin/soporte/cartera`, `/admin/soporte/cartera/[id]`                                                                                                                                                                                |
| **Soporte · Afiliaciones**        | `/admin/soporte/afiliaciones`, `/admin/soporte/afiliaciones/[id]`                                                                                                                                                                      |
| **Soporte · Incapacidades**       | `/admin/soporte/incapacidades`, `/admin/soporte/incapacidades/[id]`, `/admin/soporte/incapacidades/@modal/(.)[id]`                                                                                                                     |
| **Soporte · Jurídico**            | `/admin/soporte/juridico`, `/admin/soporte/juridico/[id]`, `/admin/soporte/juridico/@modal/(.)[id]`                                                                                                                                    |
| **Soporte · Finanzas**            | `/admin/soporte/finanzas`, `cobro-aliados`, `cobro-aliados/[id]`, `detalle-movimientos`, `movimientos-incapacidades`, `movimientos-incapacidades/[id]`                                                                                 |
| **Dashboard ejecutivo (legacy)**  | `/admin/dashboard-ejecutivo` (redirige a `/admin`)                                                                                                                                                                                     |

### Patrones de App Router en uso

- **Rutas dinámicas `[id]`**: usadas en todas las vistas de detalle (empresas,
  usuarios, sucursales, casos, jobs Colpatria, etc.). El handler async recibe
  `params: Promise<{ id: string }>` (firma Next 15) y hace `await params`.
- **Layouts compartidos**:
  - `apps/web/src/app/admin/layout.tsx` — envuelve toda el área autenticada
    en `AdminShell` (sidebar + header), tras llamar a `requireAuth()`.
  - `apps/web/src/app/admin/transacciones/layout.tsx` — tabs específicos.
  - `apps/web/src/app/admin/soporte/incapacidades/layout.tsx` y
    `apps/web/src/app/admin/soporte/juridico/layout.tsx` — sólo declaran el
    slot paralelo `@modal`.
- **Parallel routes (`@modal`) e Intercepting Routes (`(.)[id]`)**: patrón
  combinado para mostrar el detalle como modal cuando el usuario navega desde
  la lista, sin descartar la página de fondo. El refresh o el acceso directo
  a `/admin/soporte/incapacidades/<id>` cae al `[id]/page.tsx` normal (vista
  full). Implementado en:
  - `apps/web/src/app/admin/soporte/incapacidades/@modal/(.)[id]/page.tsx`
  - `apps/web/src/app/admin/soporte/juridico/@modal/(.)[id]/page.tsx`

  Ambos modales montan `DetalleModalShell` (cliente, ver
  `_components/detalle-modal-shell.tsx`), que renderiza un `<Dialog open>`
  cuya función `onClose` ejecuta `router.back()`. Eso descarta el slot `@modal`
  y devuelve la vista de la lista.

- **`_components/` con underscore**: Next App Router trata los directorios con
  prefijo `_` como **privados** (no son enrutables). Convención usada para
  agrupar componentes de una ruta sin contaminar el árbol público — por
  ejemplo `apps/web/src/app/admin/catalogos/_components/import-form.tsx` o
  `apps/web/src/app/admin/soporte/incapacidades/_components/incapacidad-detalle-content.tsx`.

## 5.3 Componentes

Los componentes compartidos viven en `apps/web/src/components/` y están
divididos en cuatro carpetas:

| Carpeta             | Archivos                                                                                                                                                                                                                 | Propósito                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `components/ui/`    | `alert.tsx`, `avatar.tsx`, `button.tsx`, `dialog.tsx`, `input.tsx`, `label.tsx`, `password-input.tsx`, `select.tsx`                                                                                                      | UI primitives reusables                  |
| `components/admin/` | `admin-nav.tsx`, `admin-shell.tsx`, `coming-soon.tsx`, `concepto-card.tsx`, `dias-incapacidad-chip.tsx`, `dias-sin-gestion-chip.tsx`, `global-search.tsx`, `mi-perfil-button.tsx`, `notificaciones-bell.tsx`, `stat.tsx` | Chrome del panel admin                   |
| `components/brand/` | `circuit-background.tsx`, `pila-logo.tsx`, `pila-logo-inline.tsx`                                                                                                                                                        | Identidad visual (login, decoración)     |
| `components/auth/`  | `idle-logout.tsx`                                                                                                                                                                                                        | Cierre de sesión por inactividad (5 min) |

### 5.3.1 Catálogo de UI primitives

Todas las primitives usan **`class-variance-authority` (cva)** para variantes
tipadas, `tailwind-merge` para resolver clases en conflicto y `React.forwardRef`
para integrarse con formularios y libs externas.

**`Button` (`components/ui/button.tsx`)**

```ts
variant: 'primary' | 'gradient' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
size: 'sm' | 'md' | 'lg' | 'icon';
// defaults: variant='primary', size='md'
```

Estilo base: `rounded-xl text-sm font-semibold transition-all`, focus ring
`brand-blue` con offset 2. La variante `gradient` aplica `bg-brand-gradient` y
sombra `shadow-brand` con elevación al hover.

**`Input` (`components/ui/input.tsx`)**

```ts
tone: 'admin' | 'glass'   // admin = blanco sobrio; glass = brand-surface azulado (login)
size: 'sm' | 'md' | 'lg'
icon?: LucideIcon          // ícono decorativo a la izquierda
trailing?: ReactNode       // elemento a la derecha (ej. ojo de password)
```

Internamente envuelve el `<input>` en un `<div class="relative">` para
posicionar `icon` y `trailing` en absoluto.

**`PasswordInput` (`components/ui/password-input.tsx`)**

Cliente (`'use client'`). Hereda los props de `Input` salvo `type | icon | trailing`.
Toggle interno `show/hide` con íconos `Eye` / `EyeOff`. Aplica siempre `icon={Lock}`
y un `<button type="button">` con `aria-label` dinámico ("Mostrar contraseña" /
"Ocultar contraseña").

**`Select` (`components/ui/select.tsx`)**

`<select>` nativo estilizado (mejor accesibilidad por teclado y soporte móvil
que un dropdown custom). Mismo `tone` y `size` que `Input`. El chevron es un
`<ChevronDown>` posicionado en absoluto con `pointer-events-none`.

**`Label` (`components/ui/label.tsx`)**

Wrapper minimalista de `<label>` con clases de tipografía consistente.

**`Alert` (`components/ui/alert.tsx`)**

```ts
variant: 'danger' | 'success' | 'warning' | 'info'; // default: info
```

Renderiza `<div role="alert">` con paleta semántica. Usado en formularios para
mostrar `state.error` y `state.ok` provenientes de Server Actions.

**`Avatar` (`components/ui/avatar.tsx`)**

Avatar con iniciales auto-derivadas del nombre (primeras 2 palabras). Tamaños
`sm` / `md` / `lg`. Aplica `bg-brand-gradient-h` y se marca como `aria-hidden`
porque siempre va junto al nombre legible.

**`Dialog` (`components/ui/dialog.tsx`)**

Cliente. Modal con portal (`createPortal` a `document.body`), tamaños
`sm | md | lg | xl` (max-w-sm a max-w-5xl). Implementa:

- **Body scroll lock**: setea `document.body.style.overflow = 'hidden'` mientras
  `open` y restaura el valor previo en cleanup.
- **Cierre por Escape**: listener de `keydown` con `e.key === 'Escape'`.
- **Cierre por backdrop**: el `<div>` del fondo invoca `onClose` en click.
- **Atributos ARIA**: `role="dialog"`, `aria-modal="true"`, botón X con
  `aria-label="Cerrar"`.

### 5.3.2 Componentes del panel admin

`AdminShell` (`components/admin/admin-shell.tsx`) — capa cliente que monta
sidebar colapsable (estado persistido en `localStorage` bajo
`pila.sidebar.open`) + header con `GlobalSearch`, `NotificacionesBell`,
`MiPerfilButton` y `LogoutButton`. También incluye `IdleLogout`.

`AdminNav` (`components/admin/admin-nav.tsx`) — sidebar declarativo. El árbol
`NAV` se filtra por rol con `filtrarPorRol()` (los grupos sin hijos visibles se
ocultan automáticamente). Usa `usePathname()` para resaltar la ruta activa y
expandir el grupo correspondiente. Estado abierto/cerrado por grupo: `useState`
local. Roles diferenciados: `STAFF`, `STAFF_Y_ALIADO_OWNER`, `ADMIN_ONLY`.

### 5.3.3 Patrón `_components/` por ruta

Cada sección compleja agrupa componentes específicos (no reusables) en un
subdirectorio `_components/`. Ejemplos relevantes:

- `apps/web/src/app/admin/soporte/incapacidades/_components/detalle-modal-shell.tsx`
- `apps/web/src/app/admin/soporte/incapacidades/_components/incapacidad-detalle-content.tsx`
- `apps/web/src/app/admin/soporte/juridico/_components/juridico-detalle-content.tsx`
- `apps/web/src/app/admin/catalogos/_components/import-form.tsx`

El prefijo `_` evita que Next los enrute como segmentos de URL.

## 5.4 Manejo de estado

El frontend es deliberadamente **server-first**. No hay Redux, Zustand,
MobX, Recoil ni un `Context` global de aplicación. El estado del cliente se
distribuye así:

- **`useActionState` (React 19)** — patrón principal para formularios.
  El hook recibe la Server Action y un estado inicial; devuelve
  `[state, dispatch, pending]`. Documentado en uso en al menos **30 archivos
  de formularios** (login, usuarios, roles, sucursales, empresas, catálogos,
  movimientos, etc.). Ejemplo en `apps/web/src/app/login/login-form.tsx`:

  ```tsx
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  return <form action={formAction}>...</form>;
  ```

- **`useState` + `useTransition`** — para flujos cliente-only puntuales:
  toggles de habilitación de usuario, cierre de período, diálogos de gestión,
  workflows de transacciones. Se ven en archivos como
  `apps/web/src/app/admin/transacciones/nueva-transaccion/transaccion-workflow.tsx`,
  `apps/web/src/app/admin/usuarios/toggle-user-button.tsx` y
  `apps/web/src/app/admin/soporte/incapacidades/[id]/anular-button.tsx`.

- **Sesión NextAuth**:
  - **Server-side**: `auth()` de `apps/web/src/auth.ts` (Auth.js v5),
    envuelta por helpers en `apps/web/src/lib/auth-helpers.ts`:
    `requireAuth()`, `requireRole(...allowed)`, `requireAdmin()`,
    `requireStaff()`, `esStaff(role)`.
  - **Client-side**: `signOut({ callbackUrl })` desde `next-auth/react` se usa
    en `IdleLogout` para forzar el cierre por inactividad.

- **Persistencia local mínima** — sólo `localStorage` para preferencias UI
  (estado del sidebar en `pila.sidebar.open`).

## 5.5 Hooks reutilizables

A la fecha de esta documentación, **no existe un directorio
`apps/web/src/hooks/`**. Los hooks de React que se usan son los nativos
(`useActionState`, `useState`, `useTransition`, `useEffect`, `useRef`,
`useRouter`, `usePathname`) y los de NextAuth (`useSession`, `signOut`). Los
helpers reutilizables — sin estado de React — viven en `apps/web/src/lib/`:

| Archivo                                            | Propósito                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `auth-helpers.ts`                                  | `requireAuth`, `requireRole`, `requireAdmin`, `requireStaff`, `esStaff` |
| `auth-rate-limit.ts`                               | Rate limiting de login (sliding window)                                 |
| `permisos.ts` / `permisos-runtime.ts`              | Resolución de permisos por rol custom                                   |
| `sucursal-scope.ts`                                | `getUserScope()` — alcance staff vs aliado                              |
| `consecutivo.ts`, `format.ts`, `text.ts`, `nit.ts` | Utilidades de dominio                                                   |
| `notificaciones.ts`                                | API server-side para listar/marcar notificaciones                       |
| `catalogos-cache.ts`                               | Cache en memoria con TTL                                                |
| `excel.ts`, `pdf/`                                 | Generación de archivos para descargas                                   |
| `logger.ts`, `sentry.ts`, `db-instrumentation.ts`  | Observabilidad                                                          |
| `validations.ts`, `nit.test.ts`, `text.test.ts`    | Schemas Zod y tests Vitest                                              |

Si en el futuro aparece la necesidad de un hook compartido (ej. `useDebounce`,
`useMediaQuery`), el lugar natural sería `apps/web/src/hooks/`.

## 5.6 Patrones de formularios

El patrón canónico es **`<form action={serverAction}>` con `useActionState`**:

1. La Server Action vive junto al `page.tsx` como `actions.ts` y exporta una
   función `async (state: ActionState, formData: FormData) => ActionState`.
2. El componente cliente declara `const [state, action, pending] =
useActionState(serverAction, {})`.
3. El form pasa `action={action}` directamente. Cada `<Input name="...">` o
   `<Select name="...">` se serializa al `FormData`.
4. El estado de retorno suele tener forma `{ ok?: true; error?: string;
fieldErrors?: Record<string, string> }`. La UI renderiza `<Alert
variant="danger">` para `state.error` y `<Alert variant="success">` para
   `state.ok`.

**Ejemplo real** — `apps/web/src/app/admin/usuarios/create-form.tsx`
(líneas 51-78):

```tsx
const [state, action, pending] = useActionState<ActionState, FormData>(createUserAction, {});
const ref = useRef<HTMLFormElement>(null);
const [password, setPassword] = useState('');

useEffect(() => {
  if (state.ok) {
    ref.current?.reset();
    onSuccess?.();
  }
}, [state.ok, onSuccess]);

const passwordsMatch =
  password.length === 0 || passwordConfirm.length === 0 || password === passwordConfirm;
const canSubmit = password.length >= 8 && password === passwordConfirm && !pending;
```

**Subida de archivos**: `<input type="file" name="archivo">` dentro del mismo
`<form action={action}>`. La Server Action recibe el `File` desde
`formData.get('archivo')` y lo persiste en disco vía helpers en
`apps/web/src/lib/cartera/storage.ts` y similares. Ejemplos:
`apps/web/src/app/admin/soporte/finanzas/movimientos-incapacidades/upload-form.tsx`,
`apps/web/src/app/admin/soporte/incapacidades/[id]/subir-documento-button.tsx`,
`apps/web/src/app/admin/soporte/juridico/[id]/subir-documento-juridico-button.tsx`.

**Validación**:

- _Cliente_: principalmente HTML5 (`required`, `minLength`, `type="email"`,
  `autoComplete`) + chequeos cosméticos (ej. coincidencia de contraseñas en
  `create-form.tsx` que deshabilita el submit).
- _Servidor_: schemas **Zod 4** en cada Server Action y en
  `apps/web/src/lib/validations.ts`. Es la fuente de verdad: el cliente nunca
  asume que la validación HTML5 es suficiente.

## 5.7 Navegación

| Mecanismo                                | Uso típico                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `<Link href="...">` (`next/link`)        | Navegación declarativa en sidebar (`AdminNav`), tabs, listados         |
| `useRouter().refresh()`                  | Re-fetch de un Server Component tras una mutación cliente              |
| `redirect('/login')` (`next/navigation`) | Redirecciones desde Server Components / Server Actions                 |
| `router.back()`                          | Cerrar modales con Intercepting Routes (`DetalleModalShell`)           |
| `usePathname()`                          | Marcar la ruta activa en el sidebar y expandir grupos                  |
| `signOut({ callbackUrl })`               | Cierre de sesión client-side (`IdleLogout`, botón compacto del header) |

El **sidebar admin** (`AdminNav`) es el punto único de navegación entre
módulos. Su árbol `NAV` está hardcodeado y filtrado por rol — la fuente única de
verdad para qué ve cada perfil. El header usa `GlobalSearch`, la campana de
notificaciones (`NotificacionesBell`) y el modal `MiPerfilButton`.

## 5.8 Consumo de APIs (Route Handlers)

`apps/web/src/app/api/` agrupa **19 endpoints** servidos como Route Handlers
de Next 15. La regla operativa es: **se usa Route Handler cuando se requiere
una respuesta no-HTML** (descarga binaria, JSON consumido por código cliente,
webhook externo). Para todo lo demás — mutaciones desde formularios, lectura
de datos para renderizar — se prefieren Server Actions y Server Components.

| Endpoint                                     | Método   | Propósito                                                   |
| -------------------------------------------- | -------- | ----------------------------------------------------------- |
| `/api/auth/[...nextauth]`                    | GET/POST | Catch-all de NextAuth (login, logout, callback, CSRF)       |
| `/api/health`                                | GET      | Healthcheck público (`SELECT 1` a Postgres + latencia)      |
| `/api/buscar`                                | GET      | Búsqueda global del header (debounced desde `GlobalSearch`) |
| `/api/notificaciones`                        | GET      | Lista las últimas 20 notificaciones del usuario             |
| `/api/notificaciones/count`                  | GET      | Conteo de no leídas (polling de la campana)                 |
| `/api/notificaciones/leer-todas`             | POST     | Marca todas como leídas                                     |
| `/api/notificaciones/[id]/leer`              | POST     | Marca una específica como leída                             |
| `/api/cartera/[id]/pdf`                      | GET      | Descarga el PDF original del consolidado                    |
| `/api/cartera/[id]/export.xlsx`              | GET      | Exporta el detalle a Excel                                  |
| `/api/colpatria/jobs/[id]/pdf`               | GET      | PDF del job ejecutado por el bot Colpatria                  |
| `/api/colpatria/procesar-ahora`              | POST     | Dispara la cola del bot manualmente                         |
| `/api/comprobantes/[id]/pagosimple-pdf`      | GET      | PDF del comprobante PagoSimple                              |
| `/api/cotizantes/template.csv`               | GET      | Plantilla CSV para carga masiva                             |
| `/api/incapacidades/[id]/documentos/[docId]` | GET      | Descarga adjunto de incapacidad                             |
| `/api/mov-detalle/[id]/documentos/[docId]`   | GET      | Descarga adjunto de movimiento                              |
| `/api/soporte-af/[id]/documentos/[docId]`    | GET      | Descarga adjunto de afiliación                              |
| `/api/planos/[id]/plano.txt`                 | GET      | Genera el `.txt` del plano de aporte                        |
| `/api/transacciones/cartera/excel`           | GET      | Export Excel de transacciones cartera                       |
| `/api/transacciones/cuadre/excel`            | GET      | Export Excel del cuadre                                     |

Casos de uso típicos:

- **Descargas binarias** (PDFs y Excels): respuesta con `Content-Type` apropiado
  y headers `Content-Disposition: attachment`. Server Actions no son aptas
  porque su valor de retorno se serializa al RSC payload.
- **Polling cliente** (`/api/notificaciones/count`): la campana en el header
  consulta este endpoint para mostrar el badge de no leídas.
- **Endpoints públicos** (`/api/health`): no requieren sesión, devuelven JSON,
  los consume monitoreo externo.
- **Catch-all NextAuth**: obligatorio en `[...nextauth]/route.ts` por el shape
  esperado por la librería.

## 5.9 Estilos

El sistema visual está basado en **TailwindCSS** con configuración TypeScript
en `apps/web/tailwind.config.ts`. La paleta de marca extiende el theme con:

```ts
colors: {
  brand: {
    blue: '#2F80ED',
    'blue-dark': '#1C4E80',
    green: '#27AE60',
    'green-dark': '#1E874B',
    turquoise: '#26C6DA',
    surface: '#F4F7FB',
    border: '#E3E8EF',
    'text-primary': '#1F2937',
    'text-secondary': '#6B7280',
    'text-muted': '#9CA3AF',
  },
  success: '#27AE60',
  danger: '#E53935',
  warning: '#FBC02D',
}
```

Y agrega:

- **Fuentes**: `font-sans` → `var(--font-roboto)`, `font-heading` →
  `var(--font-montserrat)` (variables CSS inyectadas por `next/font/google`
  en el layout raíz).
- **Gradientes de marca**: `bg-brand-gradient` (135°, azul→verde),
  `bg-brand-gradient-h` (90°), `bg-brand-surface` (180°).
- **Sombras**: `shadow-brand`, `shadow-brand-lg`, `shadow-card-float` para
  modales y cards elevadas.
- **Animaciones**: keyframe `fade-in` (`animate-fade-in`, 0.4s ease-out) +
  plugin `tailwindcss-animate`.

`apps/web/src/app/globals.css` complementa el theme con:

- Reset `color-scheme: light`.
- Asignación de `font-family` a body y headings.
- **Focus ring global**: `*:focus-visible { outline: 2px solid #1e88e5; }`.
- Animaciones SVG complejas para el logo (`logoGlow`, `circuitDraw`, `sTrace`,
  `nodePulse`) y el fondo del login (`circuitFlow`, `circuitNodePulse`), todas
  con respeto a `@media (prefers-reduced-motion: reduce)`.

La utilidad `cn()` (`apps/web/src/lib/utils.ts`) combina `clsx` con
`tailwind-merge` para resolver conflictos de clases en componentes que aceptan
`className` desde fuera.

## 5.10 Accesibilidad

La accesibilidad está soportada principalmente por:

- **HTML semántico**: el panel admin envuelve la navegación en
  `<aside aria-label="Menú principal">` y el contenido en `<main>` (ver
  `AdminShell`).
- **Atributos ARIA en componentes interactivos**:
  - `Dialog` aplica `role="dialog"`, `aria-modal="true"` y el botón de cierre
    tiene `aria-label="Cerrar"` (`components/ui/dialog.tsx`).
  - `Alert` renderiza `<div role="alert">` por defecto en
    `components/ui/alert.tsx` (línea 28). Esto se verificó tras el barrido
    interno del 2026-04-27: la primitiva está correcta. Si algún consumidor
    como `apps/web/src/app/admin/usuarios/create-form.tsx` muestra el mensaje
    sin pasar por `<Alert>` (o lo customiza), conviene revisar caso por caso —
    la primitiva por sí sola anuncia el cambio a lectores de pantalla.
  - `PasswordInput` cambia su `aria-label` entre "Mostrar contraseña" y
    "Ocultar contraseña" según el estado.
  - `Avatar` se marca `aria-hidden` porque siempre acompaña al nombre legible.
- **Cierre de diálogos**:
  - **Tecla Escape**: handler global en `Dialog` (`useEffect` con
    `keydown` listener).
  - **Click en backdrop**: el div del fondo invoca `onClose`.
  - **Scroll lock del body**: `document.body.style.overflow = 'hidden'`
    mientras el modal está abierto, restaurado en cleanup.
- **Focus ring consistente**: regla global en `globals.css` y rings explícitos
  en `Button` (`focus-visible:ring-2 focus-visible:ring-brand-blue
focus-visible:ring-offset-2`).
- **`<select>` nativo en lugar de dropdown custom** — decisión consciente para
  preservar accesibilidad por teclado, soporte de lectores de pantalla y
  comportamiento móvil.
- **Reduced motion**: las animaciones del logo y del fondo de login se
  desactivan vía `@media (prefers-reduced-motion: reduce)` en `globals.css`.
- **Cierre por inactividad**: `IdleLogout` (`components/auth/idle-logout.tsx`)
  cierra la sesión tras 5 minutos sin interacción, alineado con el `maxAge`
  del JWT en `auth.config.ts`. Acompaña al usuario activamente en lugar de
  dejarlo descubrir el vencimiento al próximo clic.

**Puntos pendientes / áreas a revisar** (auditoría 2026-04-27):

- Validar que todos los botones que sólo contienen un ícono Lucide tengan
  `aria-label` o `title` — no es uniforme en todo el código.
- Revisar contraste AA en estados deshabilitados (`opacity-60` puede no
  cumplir WCAG 2.2 en backgrounds claros).
- Documentar/auditar la navegación por teclado dentro de los modales con
  trap de foco — actualmente `Dialog` cierra con Esc pero no atrapa
  explícitamente el foco dentro del panel.
