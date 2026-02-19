import { PageContainer } from "@/components/layout/page-container";

export default function MainPage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <PageContainer size="md" className="text-center space-y-4 py-10">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-foreground">TableWise Main Page</h1>
        <p className="text-muted-foreground">
          This is placeholder content for the new main page.
        </p>
        <p className="text-muted-foreground">
          You can replace this section with your real homepage layout later.
        </p>
      </PageContainer>
    </main>
  );
}
