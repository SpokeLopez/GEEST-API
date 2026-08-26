# GEEST API

API REST para gestión de tareas asignables a usuarios con archivado automático, notificaciones con reintentos e idempotencia. Stack: **Remix (React Router v7) + TypeScript + Prisma + MySQL 8**, desplegada en Railway.

---

## Cómo ejecutar el proyecto localmente

### Requisitos previos
- Node.js 22+, npm 10+, MySQL 8 (Homebrew en macOS: `brew install mysql@8.0`)

### 1. Instalar dependencias
```bash
npm install
```

### 2. Preparar MySQL
```bash
brew services start mysql@8.0          # arrancar el servicio
mysql -u root                           # conectarse (agrega -p si tienes contraseña)
```
Dentro del prompt de MySQL:
```sql
CREATE DATABASE geest_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'geest'@'localhost' IDENTIFIED BY 'geest_pass';
GRANT ALL PRIVILEGES ON geest_db.* TO 'geest'@'localhost';
FLUSH PRIVILEGES; EXIT;
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
```
Editar `.env`:
```
DATABASE_URL="mysql://geest:geest_pass@localhost:3306/geest_db"
NOTIFY_URL="https://example.com/webhook"
NODE_ENV="development"
```
> `NOTIFY_URL` puede ser cualquier URL durante desarrollo. Si no responde, el sistema registra el intento fallido y reintenta automáticamente sin bloquear la API.

### 4. Migrar la base de datos
```bash
npm run db:migrate        # equivale a: npx prisma migrate dev
```

### 5. Levantar el servidor
```bash
npm run dev               # http://localhost:5173 · Dashboard en /dashboard
```

### 6. Correr los tests
```bash
npm test
```
> ⚠️ Los tests limpian todas las tablas antes de cada caso. Se recomienda una base de datos separada para no perder datos de desarrollo: crear `geest_test_db` y cambiar `DATABASE_URL` al correr `npm test`.

---

## Decisiones técnicas

| Decisión | Justificación |
|---|---|
| **Remix / React Router v7** | Un solo proyecto actúa como API (resource routes sin `export default`, responden JSON puro) y como UI de administración, sin duplicar lógica ni levantar un segundo servidor. |
| **Prisma + MySQL 8** | ORM con tipado completo, migraciones versionadas en el repo y acceso a `$queryRaw`/`$executeRaw` para el `SELECT … FOR UPDATE` que requiere el archivado atómico. MySQL 8 es el motor administrado incluido en Railway. |
| **Railway** | Trial de $5 sin tarjeta, proceso **persistente** (no serverless) — imprescindible para que los reintentos con backoff basados en `setTimeout` sobrevivan entre requests. Plugin de MySQL con un clic y deploy automático desde `main`. |
| **Tailwind CSS v4** | Configuración CSS-first (`@import "tailwindcss"`) sin archivo de config adicional, integrado directamente vía plugin de Vite. |
| **Vitest** | Compatible con el ecosistema Vite/ESM; los loaders y actions de React Router v7 son funciones puras que reciben un `Request` y retornan un `Response`, por lo que se testean directamente sin levantar servidor. |

---

## Supuestos ante ambigüedades

- **Email duplicado en `POST /users`** → `409 CONFLICT`. El spec no lo especifica; se asumió por analogía con REST estándar.
- **Validación de email** → regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Sin verificación de dominio real.
- **Backoff de notificaciones** → 3 intentos totales: intento 1 inmediato; si falla, espera **1 s** → intento 2; si falla, espera **5 s** → intento 3. No hay intento 4.
- **`NOTIFY_URL` no configurada** → se registra el intento con `httpStatus = null` y `succeeded = false`. La app no lanza error y continúa reintentando hasta el máximo de 3.
- **Usuario ya completo llama a `/complete` de nuevo** → se actualiza `completedAt` pero el `UPDATE … WHERE status='open'` retorna 0 filas y no relanza el archivado ni una segunda cadena de notificaciones.
- **`POST /tasks/:idTask/assign` con usuario ya asignado** → la entrada duplicada se omite silenciosamente (captura de `P2002`); la operación sigue siendo atómica para los demás `userIds`.

---

## Mejora extra — Interfaz de administración

Accesible en `/dashboard`. **Qué resuelve:** visibilidad del estado de tareas y usuarios sin necesitar Postman — cualquier persona del equipo puede filtrar tareas por estado, ver quién completó su parte y marcar asignaciones como completadas desde el navegador.

**Por qué sobre otras alternativas:** los webhooks configurables y el rate limiting aportan valor operativo pero no son demostrables visualmente durante la evaluación. La UI aprovecha las mismas resource routes sin duplicar lógica de negocio.

---

## Despliegue en Railway

- **URL pública:** _disponible tras el primer deploy_
- **Variables requeridas:** `DATABASE_URL` (plugin MySQL de Railway), `NOTIFY_URL`, `NODE_ENV=production`
- `npm start` ejecuta `prisma migrate deploy` antes de arrancar → migraciones aplicadas en cada deploy automáticamente.

---

## Funcionalidades recortadas

- Autenticación en la UI de administración (fuera de alcance explícito del spec).
- Paginación en listados (no requerida por el spec).
- Seed de datos de ejemplo (las instrucciones de setup son suficientes para el evaluador).
