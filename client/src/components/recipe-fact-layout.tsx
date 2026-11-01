import type { ReactNode } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { defaultFactOrder, moveRecipeFact, type RecipeFactId } from "@/lib/recipe-fact-layout";
import { useRecipeDisplay } from "./recipe-display";

export type RecipeFactBlock = { id: RecipeFactId; label: string; content: ReactNode };

function SortableFact({ block, index, blocks, context }: {
  block: RecipeFactBlock; index: number; blocks: RecipeFactBlock[]; context: string;
}) {
  const { t } = useI18n();
  const { factOrder, setFactOrder } = useRecipeDisplay();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  return <div ref={setNodeRef} role="listitem" data-fact-id={block.id}
    data-testid={`fact-${context}-${block.id}`}
    style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 20 : undefined }}
    className={`group flex min-w-0 items-start gap-1 rounded-md border p-1 ${isDragging ? "border-primary bg-background shadow-md" : "border-transparent hover:border-border"}`}
    onClick={event => event.stopPropagation()}>
    <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
      aria-label={`${t("layout.drag")}: ${block.label}`} data-testid={`fact-drag-${context}-${block.id}`}
      className="flex min-h-8 w-6 shrink-0 touch-none cursor-grab items-center justify-center rounded text-muted-foreground focus-visible:outline focus-visible:outline-2 active:cursor-grabbing">
      <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
    <div className="min-w-0 flex-1 break-words pt-1.5">{block.content}</div>
    <div className="flex shrink-0 opacity-0 focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
      {([-1, 1] as const).map(direction => <button key={direction} type="button"
        disabled={index + direction < 0 || index + direction >= blocks.length}
        aria-label={`${t(direction < 0 ? "layout.up" : "layout.down")}: ${block.label}`}
        data-testid={`fact-${direction < 0 ? "up" : "down"}-${context}-${block.id}`}
        onClick={() => setFactOrder(moveRecipeFact(factOrder, block.id, blocks[index + direction].id))}
        className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted focus-visible:outline focus-visible:outline-2 disabled:opacity-25">
        {direction < 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      </button>)}
    </div>
  </div>;
}

export function RecipeFactLayout({ blocks, context, interactive = true, testId }: {
  blocks: RecipeFactBlock[]; context: string; interactive?: boolean; testId?: string;
}) {
  const { t } = useI18n();
  const { factOrder, setFactOrder } = useRecipeDisplay();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sorted = [...blocks].sort((a, b) => factOrder.indexOf(a.id) - factOrder.indexOf(b.id));
  if (!interactive) return <div className="min-w-0 basis-full space-y-1" data-testid={testId}>
    {sorted.map(block => <div key={block.id} data-fact-id={block.id} className="min-w-0 break-words">{block.content}</div>)}
  </div>;
  return <div className="min-w-0 basis-full" data-testid={testId}>
    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
      <span>{t("layout.hint")}</span>
      <button type="button" onClick={() => setFactOrder(defaultFactOrder)}
        data-testid={`fact-reset-${context}`} className="min-h-8 rounded px-2 underline underline-offset-2 focus-visible:outline focus-visible:outline-2">
        {t("layout.reset")}
      </button>
    </div>
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over) setFactOrder(moveRecipeFact(factOrder, String(active.id), String(over.id)));
      }}>
      <SortableContext items={sorted.map(block => block.id)} strategy={verticalListSortingStrategy}>
        <div role="list" aria-label={t("layout.fields")}>
          {sorted.map((block, index) => <SortableFact key={block.id} block={block} index={index} blocks={sorted} context={context} />)}
        </div>
      </SortableContext>
    </DndContext>
  </div>;
}
