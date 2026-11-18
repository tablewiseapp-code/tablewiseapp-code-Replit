// Home Tasks: the task record and the pure rules for sections, ordering and the Home preview.
export type HomeTaskPriority = "high" | "normal" | "low";
export type HomeTask = {
  id: string;
  name: string;
  /** Calendar date "YYYY-MM-DD" in the person's time zone, or null for Anytime. */
  dueDate: string | null;
  priority: HomeTaskPriority;
  image: string | null;
  completedAt: string | null;
  createdAt: string;
};
export type HomeTaskSection = "overdue" | "today" | "upcoming" | "anytime";
export const HOME_TASK_SECTIONS: HomeTaskSection[] = ["overdue", "today", "upcoming", "anytime"];

const pad = (n: number) => String(n).padStart(2, "0");
/** Today's calendar date in the local time zone. */
export const localDate = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
export const nextDay = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + 1));
};

export function sectionOf(task: Pick<HomeTask, "dueDate">, today: string): HomeTaskSection {
  if (!task.dueDate) return "anytime";
  return task.dueDate < today ? "overdue" : task.dueDate === today ? "today" : "upcoming";
}

const rank: Record<HomeTaskPriority, number> = { high: 0, normal: 1, low: 2 };
/** Priority (High first), then earliest due date, then newest created. */
export const compareTasks = (a: HomeTask, b: HomeTask) =>
  rank[a.priority] - rank[b.priority] ||
  (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
  b.createdAt.localeCompare(a.createdAt);

export function groupTasks(tasks: HomeTask[], today: string) {
  const groups: Record<HomeTaskSection, HomeTask[]> = { overdue: [], today: [], upcoming: [], anytime: [] };
  for (const task of tasks) if (!task.completedAt) groups[sectionOf(task, today)].push(task);
  for (const list of Object.values(groups)) list.sort(compareTasks);
  const completed = tasks.filter(task => task.completedAt).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  return { ...groups, completed };
}

/** Every open task for Home, in the Home Tasks page order: Overdue, Today, Upcoming, Anytime. */
export function homePreview(tasks: HomeTask[], today: string) {
  const groups = groupTasks(tasks, today);
  return HOME_TASK_SECTIONS.flatMap(section => groups[section]);
}
