# mi-proyecto

Proyecto personal de Jhon Alexander Sepúlveda. Por ahora contiene solo un `readme.txt` de ejemplo — está en fase inicial.

## Entorno

- SO: Windows 11 (shell: Git Bash)
- Editor de archivos con finales de línea CRLF. Nuevos archivos: UTF-8 sin BOM.
- Repo en GitHub: https://github.com/gerenciagnt-blip/mi-proyecto
- Rama principal: `master`

## Stack

Monorepo pnpm con Next.js 15 + TypeScript + Prisma + PostgreSQL.

- `apps/web` — Next.js 15 (App Router) + Tailwind, paquete `@pila/web`
- `apps/cli` — herramienta de administración (`@pila/cli`)
- `packages/db` — Prisma schema y cliente (`@pila/db`)
- `packages/core` — tipos y utils compartidos (`@pila/core`)

## Comandos útiles

- `pnpm dev` — levanta la web en http://localhost:3000
- `pnpm db:migrate` — aplica migraciones Prisma
- `pnpm db:studio` — abre Prisma Studio para ver/editar datos
- `pnpm cli -- ping` — ejecuta la CLI
- `pnpm typecheck` / `pnpm lint` — chequeos
- `git status` / `git log --oneline` — estado e historial
- `gh pr create` — abrir PR

## Convenciones

- Mensajes de commit en español, breves y en presente ("agrega X", "corrige Y").
- No commitear archivos con secretos (`.env`, credenciales).
- Preferir commits nuevos sobre `--amend` salvo que se pida explícitamente.

## Para Claude

- Idioma de interacción: español.
- Respuestas concisas; evita resúmenes largos al final salvo que se pidan.
- Antes de cualquier acción destructiva (force push, reset --hard, borrar ramas), confirmar.
