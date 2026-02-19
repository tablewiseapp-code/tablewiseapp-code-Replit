import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type MobileNavSheetProps = {
  title: string;
  description?: string;
  trigger: ReactNode;
  children: ReactNode;
  side?: "left" | "right";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function MobileNavSheet({
  title,
  description,
  trigger,
  children,
  side = "right",
  open,
  onOpenChange,
}: MobileNavSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side={side} className="w-[calc(100vw-0.75rem)] max-w-none overflow-y-auto px-4 py-4 sm:w-[85vw] sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="mt-4 space-y-3">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

