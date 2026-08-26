import { Link, useFetcher, useLoaderData, useSearchParams } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { TaskStatus } from "@prisma/client";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");

  const where =
    statusParam === "open"
      ? { status: TaskStatus.open }
      : statusParam === "archived"
      ? { status: TaskStatus.archived }
      : {};

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, lastName: true } } },
      },
    },
  });

  return Response.json(tasks);
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;

  const res = await fetch(new URL("/tasks", request.url).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description: description || undefined }),
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}

type Assignment = {
  userId: number;
  completed: boolean;
  user: { id: number; name: string; lastName: string };
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

export default function DashboardTasks() {
  const tasks = useLoaderData<Task[]>();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") ?? "all";
  const fetcher = useFetcher<{ error?: { code: string; message: string } }>();

  const isSubmitting = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  const handleFilter = (value: string) => {
    if (value === "all") {
      setSearchParams({});
    } else {
      setSearchParams({ status: value });
    }
  };

  return (
    <div>
      {/* Create task form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Nueva tarea</h2>
        <fetcher.Form method="post" className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              name="title"
              required
              placeholder="Título de la tarea"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
            >
              {isSubmitting ? "Creando..." : "Crear tarea"}
            </button>
          </div>
          <textarea
            name="description"
            placeholder="Descripción (opcional)"
            rows={2}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
        </fetcher.Form>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error.message}</p>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Tareas</h1>
        <div className="flex gap-2">
          {(["all", "open", "archived"] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                status === s
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
              }`}
            >
              {s === "all" ? "Todas" : s === "open" ? "Abiertas" : "Archivadas"}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {status === "all"
            ? "No hay tareas. Crea la primera arriba."
            : `No hay tareas con estado "${status}".`}
        </p>
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const done = task.assignments.filter((a) => a.completed).length;
  const total = task.assignments.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Link
      to={`/dashboard/task/${task.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <h3 className="font-semibold text-gray-900">{task.title}</h3>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
            task.status === "open"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {task.status === "open" ? "Abierta" : "Archivada"}
        </span>
      </div>

      {task.description && (
        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{task.description}</p>
      )}

      {total > 0 ? (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{done}/{total} completados</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400">Sin usuarios asignados</p>
      )}
    </Link>
  );
}
