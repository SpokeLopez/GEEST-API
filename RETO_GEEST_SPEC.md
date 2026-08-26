# RETO GEEST — Especificación técnica de implementación

> Este documento es el prompt/spec completo para construir el proyecto. Sigue las decisiones técnicas ya tomadas; no las reabras salvo que encuentres un impedimento técnico real (documéntalo si pasa).

## 1. Objetivo

Construir una API REST en Node.js + TypeScript que gestione tareas asignables a uno o varios usuarios, con archivado automático cuando todos los usuarios asignados completen su parte, notificación externa al archivar, e idempotencia/concurrencia correctas. Incluye una interfaz web mínima de administración como mejora extra.

## 2. Stack tecnológico (decisiones ya tomadas)

- **Framework:** Remix (React Router v7) — se usa tanto para los endpoints de API (resource routes) como para la interfaz de administración (rutas normales), en un solo proyecto/deploy.
- **Lenguaje:** TypeScript en todo el proyecto.
- **ORM:** Prisma.
- **Base de datos:** MySQL 8.
- **Estilos de la interfaz:** Tailwind CSS.
- **Tests:** Vitest + Supertest (o `@remix-run/testing` si aplica) para tests de integración de las rutas.
- **Hosting:** Railway (proceso persistente, no serverless — necesario para que los reintentos de notificación con backoff sobrevivan en el tiempo). Incluye plugin de MySQL administrado.
- **Gestor de paquetes:** npm.

## 3. Estructura de rutas (mapeo exacto requerido)

Usar flat routes de Remix. Los archivos de la tabla son **resource routes** (solo `loader`/`action`, sin `export default`, responden JSON puro):

| Endpoint requerido | Archivo Remix | Método(s) |
|---|---|---|
| `POST /users` | `app/routes/users.ts` | `action` |
| `GET /users` | `app/routes/users.ts` | `loader` |
| `POST /tasks` | `app/routes/tasks.ts` | `action` |
| `GET /tasks` | `app/routes/tasks.ts` | `loader` |
| `GET /tasks/:idTask` | `app/routes/tasks.$idTask.ts` | `loader` |
| `POST /tasks/:idTask/assign` | `app/routes/tasks.$idTask.assign.ts` | `action` |
| `POST /tasks/:idTask/complete` | `app/routes/tasks.$idTask.complete.ts` | `action` |
| `GET /tasks/:idTask/notifications` | `app/routes/tasks.$idTask.notifications.ts` | `loader` |
| `GET /users/:idUser/tasks` | `app/routes/users.$idUser.tasks.ts` | `loader` |

Rutas de UI (renderizan HTML normal, no resource routes): `app/routes/_index.tsx` (dashboard), `app/routes/dashboard.tasks.tsx`, `app/routes/dashboard.users.tsx`, etc. — libertad de organización aquí.

**Importante:** en Remix, dentro de un mismo archivo resource route, `action` maneja todos los métodos no-GET (revisar `request.method` internamente si el archivo debe soportar más de un verbo) y `loader` maneja GET.

## 4. Modelo de datos (Prisma — esquema base, ajustar tipos si es necesario)

```prisma
model User {
  id        Int      @id @default(autoincrement())
  name      String
  lastName  String
  email     String   @unique
  createdAt DateTime @default(now())
  assignments TaskAssignment[]
}

model Task {
  id          Int      @id @default(autoincrement())
  title       String
  description String?
  status      TaskStatus @default(open)
  createdAt   DateTime @default(now())
  archivedAt  DateTime?
  assignments TaskAssignment[]
  notificationAttempts NotificationAttempt[]
}

enum TaskStatus {
  open
  archived
}

model TaskAssignment {
  id          Int      @id @default(autoincrement())
  taskId      Int
  userId      Int
  completed   Boolean  @default(false)
  completedAt DateTime?
  task        Task     @relation(fields: [taskId], references: [id])
  user        User     @relation(fields: [userId], references: [id])

  @@unique([taskId, userId]) // evita duplicar la asignación
}

model NotificationAttempt {
  id          Int      @id @default(autoincrement())
  taskId      Int
  attemptNumber Int
  timestamp   DateTime @default(now())
  httpStatus  Int?
  succeeded   Boolean  @default(false)
  task        Task     @relation(fields: [taskId], references: [id])
}

model IdempotencyKey {
  id           Int      @id @default(autoincrement())
  key          String
  endpoint     String
  requestHash  String   // hash del body para detectar mismo request
  responseBody String   @db.Text
  responseStatus Int
  createdAt    DateTime @default(now())

  @@unique([key, endpoint])
}
```

Genera el diagrama UML/ERD a partir de este esquema (por ejemplo con `prisma-erd-generator` o `mermaid-erd`) y expórtalo como imagen o Mermaid dentro del repo (`/docs/erd.png` o `/docs/erd.mmd`).

## 5. Endpoints — comportamiento detallado

Todos los errores responden con este formato exacto:
```json
{ "error": { "code": "...", "message": "..." } }
```
Usar códigos de error consistentes, ej.: `VALIDATION_ERROR`, `NOT_FOUND`, `ALREADY_ASSIGNED` (no es error, ver abajo), `CONFLICT`.

### `POST /users`
- Body: `{ "name", "lastName", "email" }`.
- Valida que `name`, `lastName`, `email` existan y que `email` tenga formato válido (regex simple es suficiente).
- Si falta algo o el email es inválido → 400 con formato de error.
- Si el email ya existe → 409 `CONFLICT` (asumido, no especificado en el documento — documentar en README).
- Éxito → 201, retorna `{ id, name, lastName, email }`.

### `GET /users`
- Lista usuarios con su info básica y sus tareas pendientes (tareas asignadas donde `completed = false` y la tarea sigue `open`).

### `POST /tasks`
- Body: `{ "title", "description" }`. `title` obligatorio, `description` opcional.
- Falta `title` → 400.
- Éxito → 201, `status: "open"` por defecto, retorna `{ id, title, description, status }`.

### `GET /tasks`
- Query param opcional `?status=open|archived`.
- Lista tareas indicando qué usuarios ya completaron su parte (incluir array de asignaciones con `userId` y `completed`).

### `GET /tasks/:idTask`
- Retorna título, descripción, estado y usuarios asignados con su estado de completado.
- Task no existe → 404.

### `POST /tasks/:idTask/assign`
- Body: `{ "userIds": [1,2,3] }`.
- Si la tarea no existe → 404/400 con error.
- Si algún userId no existe → error (no asignar nada parcialmente; toda la operación es atómica — usar transacción).
- Si un usuario ya está asignado a esa tarea, **no duplicar la relación** (no es error, se ignora esa entrada silenciosamente y continúa con el resto) — gracias al `@@unique([taskId, userId])`, capturar el conflicto de duplicado y omitirlo en vez de fallar toda la operación.
- Éxito → 200, mensaje de éxito.

### `POST /tasks/:idTask/complete`
- Body: `{ "userId": 1 }`.
- Usuario o tarea no existen → error.
- Usuario no asignado a la tarea → error.
- Marca `completed = true`, `completedAt = now()` en `TaskAssignment`.
- **Dentro de una transacción con lock (`SELECT ... FOR UPDATE` sobre la tarea, o un `UPDATE` condicionado con verificación de `affectedRows`)**: si tras este cambio TODOS los asignados de la tarea tienen `completed = true`, cambiar `Task.status` a `archived` de forma atómica y encolar/disparar el envío de notificación exactamente una vez. Ver sección 6 para el detalle de concurrencia.
- Éxito → 200, mensaje de éxito.

### `GET /users/:idUser/tasks`
- Lista tareas asignadas al usuario, indicando si completó su parte en cada una.
- Usuario no existe → 404.

### `GET /tasks/:idTask/notifications`
- Lista los intentos de notificación de la tarea (`attemptNumber`, `timestamp`, `httpStatus`).

## 6. Confiabilidad — requisitos no negociables

### 6.1 Idempotencia (todos los POST)
- Header `Idempotency-Key` opcional en cada POST.
- Si viene el header:
  1. Calcular un hash del body (ej. SHA-256 del JSON normalizado).
  2. Intentar `INSERT` en `IdempotencyKey` con `(key, endpoint)` único. Si el insert tiene éxito, ejecutar la operación normalmente y, al terminar, actualizar el registro con `responseBody`/`responseStatus`.
  3. Si el insert falla por duplicado (ya existe esa combinación `key+endpoint`):
     - Si el `requestHash` coincide → esperar (polling corto con reintento, ej. cada 50-100ms, timeout ~5s) a que el registro tenga `responseBody` guardado, y devolver exactamente esa respuesta guardada (mismo status, mismo body). Esto cubre el caso de requests en paralelo con la misma key.
     - Si el `requestHash` no coincide → 409/422, mismo `Idempotency-Key` con body distinto es un uso inválido del header.
- Esto garantiza que dos requests concurrentes con la misma key y mismo body produzcan una sola ejecución real y respuestas idénticas.

### 6.2 Archivado sin duplicados (condición de carrera en `complete`)
- Nunca decidir el archivado leyendo el estado y luego escribiendo en pasos separados sin lock.
- Estrategia recomendada: dentro de una transacción de Prisma (`prisma.$transaction`), usar `SELECT ... FOR UPDATE` sobre la fila de `Task` (vía `$queryRaw` si Prisma no expone el lock directamente) antes de contar asignaciones pendientes, o bien hacer un `UPDATE tasks SET status='archived' WHERE id=? AND status='open'` y verificar que `affectedRows === 1` antes de disparar la notificación — así, si dos completes simultáneos llegan a este punto, solo uno logra el `UPDATE` con éxito (el otro ve `affectedRows === 0` porque ya no está en `open`) y solo ese dispara la notificación.

### 6.3 Notificaciones con reintentos
- Al archivar una tarea, hacer `POST` a `process.env.NOTIFY_URL` con:
  ```json
  { "taskId": 123, "title": "...", "archivedAt": "2026-08-20T20:00:00Z" }
  ```
- Si la respuesta es 5xx o no responde (timeout/network error): reintentar con espera creciente (ej. backoff exponencial: 1s, 5s, 15s o similar) hasta un máximo de **3 intentos totales**.
- Cada intento se registra en `NotificationAttempt` con `attemptNumber`, `timestamp`, `httpStatus` (si existe respuesta).
- Importante: como el proceso corre persistente en Railway (no serverless), es seguro usar timers en memoria (ej. `setTimeout` recursivo o una cola simple), pero para robustez ante un posible restart del proceso, al arrancar la app conviene revisar si quedaron tareas archivadas sin sus 3 intentos completados y reanudar el envío.

## 7. Interfaz de administración (mejora extra — la única permitida)

Alcance mínimo, con Tailwind:
- Vista de lista de tareas (con filtro por estado) mostrando quién ha completado su parte.
- Vista de lista de usuarios con sus tareas pendientes.
- Acción para marcar una asignación como completada (llama al mismo endpoint `POST /tasks/:idTask/complete`, sin lógica duplicada).
- Vista de intentos de notificación por tarea.

No agregar autenticación, roles, ni nada fuera de este alcance — el reto pide **una sola mejora** y penaliza el exceso de alcance mal manejado.

En el README, documentar: qué problema resuelve (visibilidad rápida del estado de tareas/usuarios sin usar Postman), por qué se eligió sobre otras alternativas (ej. sobre alternativas como "webhooks configurables" o "rate limiting", se eligió esta porque aporta valor de producto inmediato y es demostrable en vivo durante la evaluación).

## 8. Tests

- Cobertura mínima por endpoint: caso feliz + al menos un caso de error de validación.
- Test específico de concurrencia: disparar dos `POST /tasks/:idTask/complete` en paralelo para los dos últimos usuarios pendientes y verificar que la tarea queda `archived` exactamente una vez y que solo hay un intento de notificación en cadena (no dos cadenas de reintento paralelas).
- Test específico de idempotencia: dos requests paralelos con el mismo `Idempotency-Key` y mismo body deben producir una sola fila nueva en la base y respuestas idénticas.
- Documentar en el README el comando exacto para correr los tests (`npm test`).

## 9. Despliegue (Railway)

- Repo conectado a Railway, deploy automático desde `main`.
- Variables de entorno necesarias: `DATABASE_URL` (MySQL de Railway), `NOTIFY_URL`, `NODE_ENV=production`.
- Ejecutar `prisma migrate deploy` como parte del build/start (no `migrate dev` en producción).
- Confirmar que el servicio queda con proceso persistente (no serverless) para que los reintentos con backoff no se interrumpan.
- En el README: indicar la URL pública final, por qué se eligió Railway (trial de $5 sin tarjeta, proceso persistente, MySQL administrado con un clic) y cómo acceder.

## 10. README (máximo 2 páginas)

Debe incluir:
- Cómo correr el proyecto localmente (comandos exactos: instalar deps, migrar DB, seed si aplica, levantar dev server, correr tests).
- Decisiones técnicas importantes y su justificación (Remix como API+UI, Prisma, MySQL, Railway).
- Supuestos ante ambigüedades del reto (ej.: qué pasa si el email ya existe en `POST /users`, formato exacto de códigos de error, definición de "válido" para email).
- Qué se recortó por falta de tiempo, si aplica.
- Explicación de la mejora extra (sección 7): qué problema resuelve, por qué era necesaria, por qué se eligió sobre otras alternativas.
- Dónde está desplegada la API, por qué esa opción, cómo acceder.

## 11. Checklist de entregables

- [ ] URL pública funcionando, disponible 7 días.
- [ ] Repo público en GitHub.
- [ ] Esquema SQL versionado (migraciones de Prisma dentro del repo).
- [ ] UML/ERD de la base de datos con relaciones.
- [ ] README ≤ 2 páginas con todo lo listado en la sección 10.
- [ ] Tests automatizados + comando documentado.
- [ ] Los 9 endpoints implementados exactamente como se especifica.
- [ ] Idempotencia funcionando en todos los POST.
- [ ] Archivado atómico sin duplicados verificado con test de concurrencia.
- [ ] Reintentos de notificación con backoff y registro de intentos.
- [ ] Una sola mejora extra (interfaz de administración), funcionando en vivo.

## 12. Supuestos a documentar explícitamente en el README

- Formato de validación de email (regex simple, no verificación de dominio real).
- Comportamiento ante email duplicado en `POST /users` (409, no especificado en el documento original).
- Definición de "espera creciente" para reintentos (especificar los valores exactos elegidos).
- Comportamiento si `NOTIFY_URL` no está configurada en el entorno (documentar qué pasa: ¿se omite el envío y se registra igual el intento con status null, o falla?).
