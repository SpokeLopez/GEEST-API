import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";

export async function loader(_: LoaderFunctionArgs) {
  const [totalTasks, openTasks, archivedTasks, totalUsers] = await Promise.all([
    prisma.task.count(),
    prisma.task.count({ where: { status: "open" } }),
    prisma.task.count({ where: { status: "archived" } }),
    prisma.user.count(),
  ]);
  return Response.json({ totalTasks, openTasks, archivedTasks, totalUsers });
}

export default function DashboardIndex() {
  const { totalTasks, openTasks, archivedTasks, totalUsers } = useLoaderData<{
    totalTasks: number;
    openTasks: number;
    archivedTasks: number;
    totalUsers: number;
  }>();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard
          label="Total Tareas"
          value={totalTasks}
          color="indigo"
          link="/dashboard/tasks"
        />
        <StatCard
          label="Tareas Abiertas"
          value={openTasks}
          color="emerald"
          link="/dashboard/tasks?status=open"
        />
        <StatCard
          label="Tareas Archivadas"
          value={archivedTasks}
          color="gray"
          link="/dashboard/tasks?status=archived"
        />
        <StatCard
          label="Usuarios"
          value={totalUsers}
          color="violet"
          link="/dashboard/users"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <QuickLink
          to="/dashboard/tasks"
          title="Gestionar Tareas"
          description="Ver, filtrar y completar tareas asignadas a usuarios."
          color="indigo"
        />
        <QuickLink
          to="/dashboard/users"
          title="Gestionar Usuarios"
          description="Ver usuarios y sus tareas pendientes."
          color="violet"
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  link,
}: {
  label: string;
  value: number;
  color: string;
  link: string;
}) {
  const colors: Record<string, string> = {
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    gray: "bg-gray-100 border-gray-300 text-gray-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
  };

  return (
    <Link
      to={link}
      className={`block p-6 rounded-xl border-2 ${colors[color]} hover:shadow-md transition-shadow`}
    >
      <p className="text-sm font-medium mb-1 opacity-70">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </Link>
  );
}

function QuickLink({
  to,
  title,
  description,
  color,
}: {
  to: string;
  title: string;
  description: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    indigo: "hover:border-indigo-400",
    violet: "hover:border-violet-400",
  };

  return (
    <Link
      to={to}
      className={`block p-6 bg-white rounded-xl border-2 border-gray-200 ${colors[color]} hover:shadow-md transition-all`}
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
    </Link>
  );
}
