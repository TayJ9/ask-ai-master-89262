import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface DemoBannerProps {
  className?: string;
}

export default function DemoBanner({ className }: DemoBannerProps) {
  const [, setLocation] = useLocation();

  return (
    <div
      className={
        className ??
        "sticky top-0 z-[100] border-b border-primary/15 bg-gradient-to-r from-primary/10 via-background to-secondary/10 px-4 py-2.5 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/90"
      }
      role="status"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="font-medium text-foreground">Portfolio demo</span>
          <span className="hidden text-muted-foreground sm:inline">— sample data, no sign-in required</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 text-xs font-medium"
          onClick={() => setLocation("/demo")}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to demo hub
        </Button>
      </div>
    </div>
  );
}
