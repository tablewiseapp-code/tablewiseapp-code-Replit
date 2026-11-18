import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { groceryPhoto } from "@/components/grocery-list/grocery-add-item";
import { homeTaskText, type HomeTaskCopyKey } from "@/lib/home-tasks-copy";
import { localDate, nextDay, type HomeTask, type HomeTaskPriority } from "@shared/home-tasks";

const KEY = ["/api/home-tasks"];
type TaskWrite = Omit<HomeTask, "createdAt"> & { createdAt?: string };

export function useHomeTaskText() {
  const { lang } = useI18n();
  return (key: HomeTaskCopyKey, params?: Record<string, string | number>) => homeTaskText(lang, key, params);
}

/** One query cache for Home and Home Tasks, so a change on either screen shows on both without a reload. */
export function useHomeTasks() {
  return useQuery<HomeTask[]>({ queryKey: KEY });
}

async function saveTask({ id, ...body }: TaskWrite) {
  const saved: HomeTask = await (await apiRequest("PUT", `/api/home-tasks/${id}`, body)).json();
  queryClient.setQueryData<HomeTask[]>(KEY, (old = []) => [...old.filter(task => task.id !== id), saved]);
  return saved;
}
async function deleteTask(id: string) {
  await apiRequest("DELETE", `/api/home-tasks/${id}`);
  queryClient.setQueryData<HomeTask[]>(KEY, (old = []) => old.filter(task => task.id !== id));
}

/** Complete, move and delete. Undo writes the original task back, including its due date, priority and photo. */
export function useTaskActions() {
  const { toast } = useToast();
  const tx = useHomeTaskText();
  const run = async (work: () => Promise<unknown>, title?: HomeTaskCopyKey, original?: HomeTask) => {
    try { await work(); }
    catch { toast({ variant: "destructive", title: tx("actionError") }); return; }
    if (!title) return;
    toast({ title: tx(title), action: original && <ToastAction altText={tx("undo")} data-testid="button-undo-task"
      onClick={() => void run(() => saveTask(original))}>{tx("undo")}</ToastAction> });
  };
  return {
    toggle: (task: HomeTask) => task.completedAt
      ? run(() => saveTask({ ...task, completedAt: null }))
      : run(() => saveTask({ ...task, completedAt: new Date().toISOString() }), "doneToast", task),
    moveTomorrow: (task: HomeTask) => run(() => saveTask({ ...task, dueDate: nextDay(localDate()) }), "movedToast", task),
    remove: (task: HomeTask) => run(() => deleteTask(task.id), "deletedToast", task),
  };
}

const showDate = (date: string, lang: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang, { day: "numeric", month: "short", year: y === new Date().getFullYear() ? undefined : "numeric" });
};
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function TaskRow({ task, onOpen }: { task: HomeTask; onOpen: (task: HomeTask) => void }) {
  const { lang, dir } = useI18n();
  const tx = useHomeTaskText();
  const actions = useTaskActions();
  const done = Boolean(task.completedAt);
  return <li className="flex items-center gap-2 border-b hairline py-1" data-testid="home-task" data-task-name={task.name}>
    <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
      <input type="checkbox" className="h-5 w-5 accent-primary" checked={done} onChange={() => void actions.toggle(task)}
        aria-label={tx(done ? "markOpen" : "markDone", { name: task.name })} data-testid="home-task-check" />
    </label>
    <button type="button" className={`min-h-11 min-w-0 flex-1 rounded-md py-1 text-start ${focus}`} onClick={() => onOpen(task)} data-testid="home-task-open">
      <span className={`block break-words ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.name}</span>
      {(task.dueDate || task.priority === "high") && <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {task.dueDate && <span data-testid="home-task-due">{tx("due", { date: showDate(task.dueDate, lang) })}</span>}
        {task.priority === "high" && <span className="tag" data-testid="home-task-high">{tx("high")}</span>}
      </span>}
    </button>
    {task.image && <img src={task.image} alt={tx("photo")} className="h-10 w-10 shrink-0 rounded-md object-cover" data-testid="home-task-thumbnail" />}
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/5 ${focus}`}
          aria-label={`${tx("actions")}: ${task.name}`} data-testid="home-task-menu">
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="min-h-11" onSelect={() => onOpen(task)} data-testid="home-task-edit">{tx("edit")}</DropdownMenuItem>
        {!done && <DropdownMenuItem className="min-h-11" onSelect={() => void actions.moveTomorrow(task)} data-testid="home-task-tomorrow">{tx("moveTomorrow")}</DropdownMenuItem>}
        <DropdownMenuItem className="min-h-11 text-destructive" onSelect={() => void actions.remove(task)} data-testid="home-task-delete">{tx("delete")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </li>;
}

/** Add (task = "new") or view and edit one task. On a failed save the dialog stays open with everything typed. */
export function TaskDialog({ task, onClose }: { task: HomeTask | "new" | null; onClose: () => void }) {
  return <Dialog open={task !== null} onOpenChange={open => { if (!open) onClose(); }}>
    {task !== null && <TaskForm key={task === "new" ? "new" : task.id} task={task === "new" ? undefined : task} onDone={onClose} />}
  </Dialog>;
}

function TaskForm({ task, onDone }: { task?: HomeTask; onDone: () => void }) {
  const { lang, dir } = useI18n();
  const tx = useHomeTaskText();
  const id = useRef(task?.id ?? crypto.randomUUID()); // stable, so a retry after a lost response cannot create a second task
  const [name, setName] = useState(task?.name ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [priority, setPriority] = useState<HomeTaskPriority>(task?.priority ?? "normal");
  const [image, setImage] = useState<string | null>(task?.image ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [fullPhoto, setFullPhoto] = useState(false);
  const { data: catalog = [] } = useQuery<{ id: string; names: Record<string, string> }[]>({ queryKey: ["/api/household-tasks"], staleTime: 3600000 });
  const pickPhoto = async (file?: File) => {
    if (!file) return;
    setProcessing(true); setError("");
    try { setImage(await groceryPhoto(file)); }
    catch { setError(tx("photoError")); }
    finally { setProcessing(false); }
  };
  const photoInput = (label: HomeTaskCopyKey, testid: string) => <label className={`btn btn-secondary focus-within:outline focus-within:outline-2 focus-within:outline-primary ${busy || processing ? "opacity-50" : "cursor-pointer"}`}>
    {tx(label)}
    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy || processing} data-testid={testid}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void pickPhoto(file); }} />
  </label>;

  return <DialogContent dir={dir} className="max-h-[90dvh] overflow-y-auto" aria-describedby={undefined} data-testid="home-task-dialog">
    <DialogTitle>{tx(task ? "editTask" : "newTask")}</DialogTitle>
    <form className="space-y-4" noValidate onSubmit={async event => {
      event.preventDefault();
      if (busy || processing) return;
      if (!name.trim()) { setError(tx("nameRequired")); return; }
      setBusy(true); setError("");
      try {
        await saveTask({ id: id.current, name: name.trim(), dueDate: dueDate || null, priority, image,
          completedAt: task?.completedAt ?? null, ...(task ? { createdAt: task.createdAt } : {}) });
        onDone();
      } catch (failure) {
        setError(tx(String(failure).includes("409") ? "fullError" : "saveError"));
      } finally { setBusy(false); }
    }}>
      <div>
        <label htmlFor="home-task-name" className="text-sm font-medium">{tx("name")}</label>
        <input id="home-task-name" value={name} onChange={event => setName(event.target.value)} maxLength={120} autoFocus required
          list="household-task-suggestions" autoComplete="off" placeholder={tx("namePlaceholder")} disabled={busy}
          className="mt-1 min-h-11 w-full rounded-md border hairline bg-background px-3" data-testid="home-task-name" />
        <datalist id="household-task-suggestions">
          {catalog.map(item => <option key={item.id} value={item.names[lang] ?? item.names.en} />)}
        </datalist>
      </div>
      <div className="flex flex-wrap gap-4">
        <div>
          <label htmlFor="home-task-due" className="text-sm font-medium">{tx("dueDate")}</label>
          <div className="mt-1 flex items-center gap-1">
            <input id="home-task-due" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} disabled={busy}
              className="min-h-11 rounded-md border hairline bg-background px-3" data-testid="home-task-due-input" />
            {dueDate && <button type="button" className="btn btn-text" onClick={() => setDueDate("")} disabled={busy}>{tx("clearDate")}</button>}
          </div>
        </div>
        <div>
          <label htmlFor="home-task-priority" className="text-sm font-medium">{tx("priority")}</label>
          <select id="home-task-priority" value={priority} onChange={event => setPriority(event.target.value as HomeTaskPriority)} disabled={busy}
            className="mt-1 block min-h-11 rounded-md border hairline bg-background px-3" data-testid="home-task-priority">
            <option value="high">{tx("priorityHigh")}</option>
            <option value="normal">{tx("priorityNormal")}</option>
            <option value="low">{tx("priorityLow")}</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {image ? <>
          <button type="button" onClick={() => setFullPhoto(true)} className={`rounded-md ${focus}`} aria-label={tx("viewPhoto")} data-testid="home-task-photo-view">
            <img src={image} alt={tx("photo")} className="h-16 w-16 rounded-md object-cover" data-testid="home-task-photo" />
          </button>
          {photoInput("replacePhoto", "home-task-photo-replace")}
          <button type="button" className="btn btn-text" onClick={() => setImage(null)} disabled={busy || processing} data-testid="home-task-photo-remove">{tx("removePhoto")}</button>
        </> : photoInput("addPhoto", "home-task-photo-input")}
      </div>
      {processing && <p role="status" className="text-sm text-muted-foreground">{tx("processing")}</p>}
      {task && <p className="text-sm text-muted-foreground" data-testid="home-task-created">
        {tx("createdOn", { date: new Date(task.createdAt).toLocaleDateString(lang, { dateStyle: "medium" }) })}
      </p>}
      {error && <p role="alert" className="text-sm font-medium text-destructive" data-testid="home-task-error">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onDone} disabled={busy}>{tx("cancel")}</button>
        <button type="submit" className="btn btn-primary" disabled={busy || processing} data-testid="home-task-save">{tx(busy ? "saving" : "save")}</button>
      </div>
    </form>
    <Dialog open={fullPhoto && Boolean(image)} onOpenChange={setFullPhoto}>
      <DialogContent dir={dir} aria-describedby={undefined} className="max-w-3xl">
        <DialogTitle>{name.trim() || tx("photo")}</DialogTitle>
        {image && <img src={image} alt={tx("photo")} className="max-h-[75dvh] w-full rounded-md object-contain" data-testid="home-task-photo-full" />}
      </DialogContent>
    </Dialog>
  </DialogContent>;
}
