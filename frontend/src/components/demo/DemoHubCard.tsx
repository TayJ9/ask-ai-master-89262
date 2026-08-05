import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import DemoStopImage from "@/components/demo/DemoStopImage";

type Accent = "primary" | "secondary";

interface DemoHubCardProps {
  title: string;
  description: string;
  cta: string;
  onCta: () => void;
  icon: LucideIcon;
  accent?: Accent;
  /** Optional step badge (for try-it stops). */
  step?: number;
  image?: {
    png: string;
    alt: string;
    width: number;
    height: number;
    loading?: "eager" | "lazy";
    fetchPriority?: "high" | "low" | "auto";
    decoding?: "sync" | "async" | "auto";
  };
  /** Compact layout for feature grid items (no image). */
  compact?: boolean;
  className?: string;
}

export default function DemoHubCard({
  title,
  description,
  cta,
  onCta,
  icon: Icon,
  accent = "primary",
  step,
  image,
  compact = false,
  className,
}: DemoHubCardProps) {
  const iconClass = accent === "primary" ? "text-primary" : "text-secondary";

  if (compact) {
    return (
      <Card
        className={`flex h-full flex-col border-white/70 bg-card/95 shadow-md ring-1 ring-slate-200/70 transition-shadow hover:shadow-lg ${className ?? ""}`}
      >
        <CardContent className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/80 ${iconClass}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1.5">
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-auto w-full gap-1.5 sm:w-auto" onClick={onCta}>
            {cta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`overflow-hidden border-white/70 bg-card/95 shadow-lg shadow-slate-900/8 ring-1 ring-slate-200/70 transition-shadow hover:shadow-xl ${className ?? ""}`}
    >
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {image && (
            <div className="relative aspect-[16/10] shrink-0 overflow-hidden bg-muted sm:w-2/5">
              <DemoStopImage
                png={image.png}
                alt={image.alt}
                width={image.width}
                height={image.height}
                loading={image.loading}
                fetchPriority={image.fetchPriority}
                decoding={image.decoding}
              />
              {step !== undefined && (
                <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-xs font-bold text-foreground shadow-sm ring-1 ring-border/60">
                  {step}
                </span>
              )}
            </div>
          )}
          <div className="flex flex-1 flex-col justify-between gap-4 p-5 sm:p-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${iconClass}`} aria-hidden />
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
            <Button className="w-full gap-2 sm:w-auto sm:self-start" onClick={onCta}>
              {cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
