import { useLoaderData, useFetcher, Link } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { errorResponse } from "~/lib/errors.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const idTask = parseInt(params.idTask ?? "", 10);
  if (isNaN(idTask)) return errorResponse("VALIDATION_ERROR", "Invalid task id.", 400);

  const [task, attempts, allUsers] = await Promise.all([
    prisma.task.findUnique({
      where: { id: idTask },
      include: {
        assignments: {
          include: {
            user: { select: { id: true, name: true, lastName: true, email: true } },
          },
        },
      },
    }),
    prisma.notificationAttempt.findMany({
      where: { taskId: idTask },
      orderBy: { attemptNumber: "asc" },
    }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, lastName: true },
    }),
  ]);

  if (!task) return errorResponse("NOT_FOUND", "Task not found.", 404);

  const assignedIds = task.assignments.map((a) => a.userId);
  const unassignedUsers = allUsers.filter((u) => !assignedIds.includes(u.id));

  return Response.json({ task, attempts, unassignedUsers });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idTask = parseInt(params.idTask ?? "", 10);
  const formData = await request.formData();
  const intent = formData.get("_intent") as string;

  if (intent === "complete") {
    const userId = parseInt(formData.get("userId") as string, 10);
    const res = await fetch(new URL(`/tasks/${idTask}/complete`, request.url).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    return Response.json(await res.json(), { status: res.status });
  }

  if (intent === "assign") {
    const userIds = formData.getAll("userIds").map(Number).filter(Boolean);
    if (userIds.length === 0) {
      return Response.json({ error: { message: "Selecciona al menos un usuario." } }, { status: 400 });
    }
    const res = await fetch(new URL(`/tasks/${idTask}/assign`, request.url).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds }),
    });
    return Response.json(await res.json(), { status: res.status });
  }

  return Response.json({ error: { message: "Unknown intent." } }, { status: 400 });
}

type Assignment = {
  userId: number;
  completed: boolean;
  completedAt: string | null;
  user: { id: number; name: string; lastName: string; email: string };
};
type Task = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  archivedAt: string | null;
  assignments: Assignment[];
};
type NotificationAttempt = {
  id: number;
  attemptNumber: number;
  timestamp: string;
  httpStatus: number | null;
  succeeded: boolean;
};
type UnassignedUser = { id: number; name: string; lastName: string };

export default function TaskDetail() {
  const { task, attempts, unassignedUsers } = useLoaderData<{
    task: Task;
    attempts: NotificationAttempt[];
    unassignedUsers: UnassignedUser[];
  }>();

  const completeFetcher = useFetcher<{ error?: { message: string } }>();
  const assignFetcher = useFetcher<{ error?: { message: string } }>();

  return (
    <div>
      <div className="mb-6">
        <Link to="/dashboard/tasks" className="text-sm text-indigo-600 hover:underline">
          ← Volver a Tareas
        </Link>
      </div>

      {/* Task header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{task.title}</h1>
          <span
            className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium ${
              task.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
            }`}
          >
            {task.status === "open" ? "Abierta" : "Archivada"}
          </span>
        </div>
        {task.description && <p className="text-gray-600 text-sm">{task.description}</p>}
        {task.archivedAt && (
          <p className="text-xs text-gray-400 mt-2">
            Archivada: {new Date(task.archivedAt).toLocaleString("es-MX")}
          </p>
        )}
      </div>

      {/* Assign users (only for open tasks with available users) */}
      {task.status === "open" && unassignedUsers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Asignar usuarios</h2>
          <assignFetcher.Form method="post" className="space-y-3">
            <input type="hidden" name="_intent" value="assign" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {unassignedUsers.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                >
                  <input type="checkbox" name="userIds" value={u.id} className="rounded" />
                  <span className="text-sm text-gray-800">
                    {u.name} {u.lastName}
                  </span>
                </label>
              ))}
            </div>
            <button
              type="submit"
              disabled={assignFetcher.state !== "idle"}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {assignFetcher.state !== "idle" ? "Asignando..." : "Asignar seleccionados"}
            </button>
            {assignFetcher.data?.error && (
              <p className="text-sm text-red-600">{assignFetcher.data.error.message}</p>
            )}
          </assignFetcher.Form>
        </div>
      )}

      {/* Assignments */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Asignaciones ({task.assignments.length})
        </h2>

        {task.assignments.length === 0 ? (
          <p className="text-sm text-gray-400">
            Esta tarea no tiene usuarios asignados.{" "}
            {unassignedUsers.length > 0 && "Usa el formulario de arriba para asignar."}
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {task.assignments.map((a) => (
              <div key={a.userId} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {a.user.name} {a.user.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{a.user.email}</p>
                  {a.completedAt && (
                    <p className="text-xs text-emerald-600 mt-0.5">
                      Completado: {new Date(a.completedAt).toLocaleString("es-MX")}
                    </p>
                  )}
                </div>
                <div>
                  {a.completed ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                      Completado
                    </span>
                  ) : task.status === "open" ? (
                    <completeFetcher.Form method="post">
                      <input type="hidden" name="_intent" value="complete" />
                      <input type="hidden" name="userId" value={a.userId} />
                      <button
                        type="submit"
                        disabled={completeFetcher.state !== "idle"}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        {completeFetcher.state !== "idle" ? "Guardando..." : "Marcar completada"}
                      </button>
                    </completeFetcher.Form>
                  ) : (
                    <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                      Pendiente
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notification attempts */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Intentos de Notificación ({attempts.length})
        </h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-gray-400">Aún no hay intentos de notificación.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {attempts.map((attempt) => (
              <div key={attempt.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Intento #{attempt.attemptNumber}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(attempt.timestamp).toLocaleString("es-MX")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {attempt.httpStatus !== null && (
                    <span className="text-xs text-gray-500">HTTP {attempt.httpStatus}</span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      attempt.succeeded
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {attempt.succeeded ? "Exitoso" : "Fallido"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
