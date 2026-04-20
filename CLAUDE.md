# mi-proyecto

Proyecto personal de Jhon Alexander Sepúlveda. Por ahora contiene solo un `readme.txt` de ejemplo — está en fase inicial.

## Entorno

- SO: Windows 11 (shell: Git Bash)
- Editor de archivos con finales de línea CRLF. Nuevos archivos: UTF-8 sin BOM.
- Repo en GitHub: https://github.com/gerenciagnt-blip/mi-proyecto
- Rama principal: `master`

## Comandos útiles

- `git status` / `git log --oneline` — estado e historial
- `gh pr create` — abrir PR (requiere `gh auth login` la primera vez)

## Convenciones

- Mensajes de commit en español, breves y en presente ("agrega X", "corrige Y").
- No commitear archivos con secretos (`.env`, credenciales).
- Preferir commits nuevos sobre `--amend` salvo que se pida explícitamente.

## Para Claude

- Idioma de interacción: español.
- Respuestas concisas; evita resúmenes largos al final salvo que se pidan.
- Antes de cualquier acción destructiva (force push, reset --hard, borrar ramas), confirmar.
