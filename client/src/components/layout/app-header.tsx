import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { MobileNavSheet } from "@/components/layout/mobile-nav-sheet";

type AppHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  onBrandClick?: () => void;
  desktopActions?: ReactNode;
  mobileMenuTitle?: string;
  mobileMenuDescription?: string;
  mobileMenuContent?: ReactNode;
};

export function AppHeader({
  title,
  subtitle,
  onBrandClick,
  desktopActions,
  mobileMenuTitle = "Menu",
  mobileMenuDescription,
  mobileMenuContent,
}: AppHeaderProps) {
  return (
    <header className="border-b hairline">
      <PageContainer size="xl" className="flex items-center justify-between py-3 sm:py-4">
        {onBrandClick ? (
          <button
            type="button"
            onClick={onBrandClick}
            className="flex items-center gap-3 text-left"
            data-testid="app-header-brand"
          >
            <div className="h-8 w-8 rounded-full bg-foreground/10 flex items-center justify-center">
              <span className="text-xs font-medium text-foreground">TW</span>
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{title}</span>
              {subtitle ? (
                <span className="block text-xs text-muted-foreground sm:inline sm:ml-2">{subtitle}</span>
              ) : null}
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-3 text-left" data-testid="app-header-brand">
            <div className="h-8 w-8 rounded-full bg-foreground/10 flex items-center justify-center">
              <span className="text-xs font-medium text-foreground">TW</span>
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{title}</span>
              {subtitle ? (
                <span className="block text-xs text-muted-foreground sm:inline sm:ml-2">{subtitle}</span>
              ) : null}
            </div>
          </div>
        )}

        <div className="hidden md:flex items-center gap-3">{desktopActions}</div>

        {mobileMenuContent ? (
          <div className="md:hidden">
            <MobileNavSheet
              title={mobileMenuTitle}
              description={mobileMenuDescription}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  data-testid="app-header-mobile-menu"
                >
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              }
            >
              {mobileMenuContent}
            </MobileNavSheet>
          </div>
        ) : null}
      </PageContainer>
    </header>
  );
}
