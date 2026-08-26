import { Link, useFetcher, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";

export async function loader(_: LoaderFunctionArgs) {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      assignments: {
        where: { completed: false, task: { status: "open" } },
        include: { task: { select: { id: true, title: true } } },
      },
    },
  });
  return Response.json(users);
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const name = formData.get("name") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;

  const res = await fetch(new URL("/users", request.url).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, lastName, email }),
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}

type PendingTask = { id: number; title: string };
type User = {
  id: number;
  name: string;
  lastName: string;
  email: string;
  assignments: { task: PendingTask }[];
};

export default function DashboardUsers() {
  const users = useLoaderData<User[]>();
  const fetcher = useFetcher<{ error?: { code: string; message: string } }>();

  const isSubmitting = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Usuarios</h1>

      {/* Create user form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Nuevo usuario</h2>
        <fetcher.Form method="post" className="flex flex-col sm:flex-row gap-3">
          <input
            name="name"
            required
            placeholder="Nombre"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            name="lastName"
            required
            placeholder="Apellido"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="correo@ejemplo.com"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            {isSubmitting ? "Creando..." : "Crear"}
          </button>
        </fetcher.Form>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error.message}</p>
        )}
      </div>

      {/* User list */}
      {users.length === 0 ? (
        <p className="text-gray-500 text-sm">No hay usuarios registrados. Crea el primero arriba.</p>
      ) : (
        <div className="grid gap-4">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {user.name} {user.lastName}
                  </h3>
                  <p className="text-sm text-gray-500">{user.email}</p>
                </div>
                <span className="text-xs text-gray-400">ID #{user.id}</span>
              </div>

              {user.assignments.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Tareas pendientes ({user.assignments.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {user.assignments.map(({ task }) => (
                      <Link
                        key={task.id}
                        to={`/dashboard/task/${task.id}`}
                        className="inline-flex items-center px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-medium hover:bg-amber-100 transition-colors"
                      >
                        {task.title}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Sin tareas pendientes.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
