import { type RouteConfig, route, index, layout } from "@react-router/dev/routes";

export default [
  // UI Routes
  index("routes/_index.tsx"),
  layout("routes/dashboard.tsx", [
    route("dashboard", "routes/dashboard._index.tsx"),
    route("dashboard/tasks", "routes/dashboard.tasks.tsx"),
    route("dashboard/users", "routes/dashboard.users.tsx"),
    route("dashboard/task/:idTask", "routes/dashboard.task.$idTask.tsx"),
  ]),

  // API Resource Routes
  route("users", "routes/users.ts"),
  route("users/:idUser/tasks", "routes/users.$idUser.tasks.ts"),
  route("tasks", "routes/tasks.ts"),
  route("tasks/:idTask", "routes/tasks.$idTask.ts"),
  route("tasks/:idTask/assign", "routes/tasks.$idTask.assign.ts"),
  route("tasks/:idTask/complete", "routes/tasks.$idTask.complete.ts"),
  route("tasks/:idTask/notifications", "routes/tasks.$idTask.notifications.ts"),
] satisfies RouteConfig;
