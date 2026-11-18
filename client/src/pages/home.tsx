import { useState } from "react";
import { Link } from "wouter";
import { PageContainer } from "@/components/layout/page-container";
import { TaskDialog, TaskRow, useHomeTaskText, useHomeTasks } from "@/components/home-tasks";
import { useI18n } from "@/lib/i18n";
import { homePreview, localDate, type HomeTask } from "@shared/home-tasks";

export default function Home() {
  const { dir } = useI18n();
  const tx = useHomeTaskText();
  const { data: tasks = [], isLoading, isError, refetch } = useHomeTasks();
  const [editing, setEditing] = useState<HomeTask | null>(null);
  const preview = homePreview(tasks, localDate());
  return <div className="min-h-screen bg-background pb-24" dir={dir}>
    <PageContainer size="md" className="py-8 sm:py-10">
      <div className="page-header">
        <h1 className="page-title" data-testid="text-page-title">{tx("home")}</h1>
        <p className="page-subtitle">{tx("homeIntro")}</p>
      </div>
      <section className="card p-4" data-testid="home-task-preview">
        <h2 className="text-base font-semibold">{tx("needsAttention")}</h2>
        {isError && <p role="alert" className="text-sm text-destructive">{tx("loadError")} <button type="button" className="btn btn-text" onClick={() => void refetch()}>{tx("retry")}</button></p>}
        {!isLoading && !isError && preview.length === 0 && <p className="mt-2 text-sm text-muted-foreground" data-testid="home-nothing-due">{tx("nothingDue")}</p>}
        <ul>{preview.map(task => <TaskRow key={task.id} task={task} onOpen={setEditing} />)}</ul>
        <Link href="/home-tasks" className="btn btn-text mt-2 px-0" data-testid="link-view-all-tasks">{tx("viewAll")}</Link>
      </section>
      <Link href="/meals" className="btn btn-secondary mt-6" data-testid="link-plan-week">{tx("planWeek")}</Link>
    </PageContainer>
    <TaskDialog task={editing} onClose={() => setEditing(null)} />
  </div>;
}
