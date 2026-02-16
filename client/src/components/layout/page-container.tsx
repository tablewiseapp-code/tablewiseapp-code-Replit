import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PageContainerSize = "md" | "lg" | "xl";

const SIZE_CLASS_MAP: Record<PageContainerSize, string> = {
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-7xl",
};

type PageContainerProps = HTMLAttributes<HTMLDivElement> & {
  size?: PageContainerSize;
};

export function PageContainer({ size = "lg", className, ...props }: PageContainerProps) {
  return (
    <div
      className={cn("app-container", SIZE_CLASS_MAP[size], className)}
      {...props}
    />
  );
}

