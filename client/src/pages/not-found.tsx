import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-xl sm:text-2xl font-bold text-foreground" data-testid="text-404-title">{t("notFound.title")}</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground" data-testid="text-404-message">
            {t("notFound.message")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
