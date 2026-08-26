# GEEST API — Referencia de Endpoints

**Base URL local:** `http://localhost:5173`  
**Base URL producción:** `https://geest-api-production-771f.up.railway.app`

Todos los endpoints reciben y responden `Content-Type: application/json`.

---

## Formato de error

Todos los errores usan el mismo formato:

```json
{ "error": { "code": "CODIGO_ERROR", "message": "Descripción legible." } }
```

| Código | HTTP | Descripción |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Campo requerido faltante o formato inválido |
| `NOT_FOUND` | 404 | Recurso no encontrado |
| `CONFLICT` | 409 | Email duplicado en creación de usuario |
| `NOT_ASSIGNED` | 400 | Usuario no está asignado a la tarea |
| `IDEMPOTENCY_MISMATCH` | 422 | Misma `Idempotency-Key` con body distinto |

---

## Idempotencia

Todos los endpoints `POST` soportan el header opcional `Idempotency-Key`.

```
Idempotency-Key: cualquier-string-unico
```

- Si se envía la misma key + mismo body → respuesta idéntica (operación ejecutada una sola vez).
- Si se envía la misma key + body diferente → `422 IDEMPOTENCY_MISMATCH`.
- Si se omite → comportamiento normal sin deduplicación.

---

## Usuarios

### `POST /users` — Crear usuario

**Body**
```json
{
  "name": "Ana",
  "lastName": "López",
  "email": "ana@example.com"
}
```

| Campo | Tipo | Requerido |
|---|---|---|
| `name` | string | ✅ |
| `lastName` | string | ✅ |
| `email` | string (email válido) | ✅ |

**Respuesta exitosa — 201**
```json
{
  "id": 1,
  "name": "Ana",
  "lastName": "López",
  "email": "ana@example.com"
}
```

**Errores**
| Situación | HTTP | code |
|---|---|---|
| Campo faltante o email inválido | 400 | `VALIDATION_ERROR` |
| Email ya registrado | 409 | `CONFLICT` |

---

### `GET /users` — Listar usuarios

Sin parámetros.

**Respuesta exitosa — 200**
```json
[
  {
    "id": 1,
    "name": "Ana",
    "lastName": "López",
    "email": "ana@example.com",
    "createdAt": "2026-08-25T03:00:00.000Z",
    "pendingTasks": [
      { "id": 2, "title": "Revisar PR", "status": "open" }
    ]
  }
]
```

`pendingTasks` incluye solo las tareas donde el usuario tiene `completed = false` y la tarea sigue `open`.

---

### `GET /users/:idUser/tasks` — Tareas asignadas a un usuario

**Path params**
| Param | Tipo |
|---|---|
| `idUser` | integer |

**Respuesta exitosa — 200**
```json
[
  {
    "id": 2,
    "title": "Revisar PR",
    "description": "PR #42",
    "status": "open",
    "createdAt": "2026-08-25T03:00:00.000Z",
    "archivedAt": null,
    "completed": false,
    "completedAt": null
  }
]
```

**Errores**
| Situación | HTTP | code |
|---|---|---|
| Usuario no existe | 404 | `NOT_FOUND` |

---

## Tareas

### `POST /tasks` — Crear tarea

**Body**
```json
{
  "title": "Revisar PR",
  "description": "PR #42 en repositorio principal"
}
```

| Campo | Tipo | Requerido |
|---|---|---|
| `title` | string | ✅ |
| `description` | string | ❌ |

**Respuesta exitosa — 201**
```json
{
  "id": 1,
  "title": "Revisar PR",
  "description": "PR #42 en repositorio principal",
  "status": "open"
}
```

**Errores**
| Situación | HTTP | code |
|---|---|---|
| `title` faltante | 400 | `VALIDATION_ERROR` |

---

### `GET /tasks` — Listar tareas

**Query params opcionales**
| Param | Valores | Descripción |
|---|---|---|
| `status` | `open` \| `archived` | Filtrar por estado. Sin el param → todas. |

**Respuesta exitosa — 200**
```json
[
  {
    "id": 1,
    "title": "Revisar PR",
    "description": "PR #42",
    "status": "open",
    "createdAt": "2026-08-25T03:00:00.000Z",
    "archivedAt": null,
    "assignments": [
      { "userId": 1, "completed": true, "completedAt": "2026-08-25T04:00:00.000Z" },
      { "userId": 2, "completed": false, "completedAt": null }
    ]
  }
]
```

---

### `GET /tasks/:idTask` — Detalle de tarea

**Path params**
| Param | Tipo |
|---|---|
| `idTask` | integer |

**Respuesta exitosa — 200**
```json
{
  "id": 1,
  "title": "Revisar PR",
  "description": "PR #42",
  "status": "open",
  "createdAt": "2026-08-25T03:00:00.000Z",
  "archivedAt": null,
  "assignments": [
    {
      "userId": 1,
      "completed": false,
      "completedAt": null,
      "user": {
        "id": 1,
        "name": "Ana",
        "lastName": "López",
        "email": "ana@example.com"
      }
    }
  ]
}
```

**Errores**
| Situación | HTTP | code |
|---|---|---|
| Tarea no existe | 404 | `NOT_FOUND` |

---

### `POST /tasks/:idTask/assign` — Asignar usuarios a una tarea

**Path params**
| Param | Tipo |
|---|---|
| `idTask` | integer |

**Body**
```json
{
  "userIds": [1, 2, 3]
}
```

- Operación atómica: si algún `userId` no existe, ninguno se asigna.
- Si un usuario ya está asignado, se omite silenciosamente (no es error).

**Respuesta exitosa — 200**
```json
{ "message": "Users assigned successfully." }
```

**Errores**
| Situación | HTTP | code |
|---|---|---|
| Tarea no existe | 404 | `NOT_FOUND` |
| Algún userId no existe | 404 | `NOT_FOUND` |
| `userIds` con formato inválido | 400 | `VALIDATION_ERROR` |

---

### `POST /tasks/:idTask/complete` — Completar asignación de un usuario

**Path params**
| Param | Tipo |
|---|---|
| `idTask` | integer |

**Body**
```json
{
  "userId": 1
}
```

- Marca la asignación como `completed = true`.
- Si **todos** los usuarios asignados han completado → la tarea se archiva automáticamente (`status: "archived"`) y se dispara una notificación a `NOTIFY_URL`.
- El archivado es atómico (usa `SELECT FOR UPDATE` + `UPDATE WHERE status='open'`): nunca se archiva dos veces aunque dos requests lleguen simultáneamente.

**Respuesta exitosa — 200**
```json
{ "message": "Task marked as completed." }
```

**Errores**
| Situación | HTTP | code |
|---|---|---|
| Tarea no existe | 404 | `NOT_FOUND` |
| Usuario no existe | 404 | `NOT_FOUND` |
| Usuario no asignado a la tarea | 400 | `NOT_ASSIGNED` |

---

### `GET /tasks/:idTask/notifications` — Intentos de notificación

**Path params**
| Param | Tipo |
|---|---|
| `idTask` | integer |

**Respuesta exitosa — 200**
```json
[
  {
    "id": 1,
    "attemptNumber": 1,
    "timestamp": "2026-08-25T04:00:01.000Z",
    "httpStatus": 500,
    "succeeded": false
  },
  {
    "id": 2,
    "attemptNumber": 2,
    "timestamp": "2026-08-25T04:00:02.000Z",
    "httpStatus": 200,
    "succeeded": true
  }
]
```

La notificación se envía como `POST` a `NOTIFY_URL` con el body:
```json
{ "taskId": 1, "title": "Revisar PR", "archivedAt": "2026-08-25T04:00:00.000Z" }
```
Backoff: intento 1 inmediato → espera 1 s → intento 2 → espera 5 s → intento 3. Máximo 3 intentos totales.

**Errores**
| Situación | HTTP | code |
|---|---|---|
| Tarea no existe | 404 | `NOT_FOUND` |
