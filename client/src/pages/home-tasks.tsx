import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { TaskDialog, TaskRow, useHomeTaskText, useHomeTasks } from "@/components/home-tasks";
import { useI18n } from "@/lib/i18n";
import { groupTasks, HOME_TASK_SECTIONS, localDate, type HomeTask } from "@shared/home-tasks";

export default function HomeTasks() {
  const { dir } = useI18n();
  const tx = useHomeTaskText();
  const { data: tasks = [], isLoading, isError, refetch } = useHomeTasks();
  const [editing, setEditing] = useState<HomeTask | "new" | null>(null);
  const groups = groupTasks(tasks, localDate());
  return <div className="min-h-screen bg-background pb-24" dir={dir}>
    <PageContainer size="md" className="py-8 sm:py-10">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title" data-testid="text-page-title">{tx("title")}</h1>
          <p className="page-subtitle">{tx("intro")}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")} data-testid="button-add-task">{tx("add")}</button>
      </div>
      {isError && <p role="alert" className="text-sm text-destructive">{tx("loadError")} <button type="button" className="btn btn-text" onClick={() => void refetch()}>{tx("retry")}</button></p>}
      {!isLoading && !isError && tasks.length === 0 && <p className="text-muted-foreground" data-testid="home-tasks-empty">{tx("empty")}</p>}
      {HOME_TASK_SECTIONS.map(section => groups[section].length > 0 && <section key={section} className="mb-6" data-testid={`home-tasks-${section}`}>
        <h2 className="text-base font-semibold">{tx(section)}</h2>
        <ul>{groups[section].map(task => <TaskRow key={task.id} task={task} onOpen={setEditing} />)}</ul>
      </section>)}
      {groups.completed.length > 0 && <details className="mb-6" data-testid="home-tasks-completed">
        <summary className="flex min-h-11 cursor-pointer items-center text-base font-semibold">{tx("completed", { count: groups.completed.length })}</summary>
        <ul>{groups.completed.map(task => <TaskRow key={task.id} task={task} onOpen={setEditing} />)}</ul>
      </details>}
    </PageContainer>
    <TaskDialog task={editing} onClose={() => setEditing(null)} />
  </div>;
}
