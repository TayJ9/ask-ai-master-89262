import { Expand, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { demoResumeDocuments, type DemoResumeFullDocument } from "@/mocks/demoResumeDocuments";
import type { DemoResumeId } from "@/mocks/demoResumes";
import { interviewRoomInsetPanelClassName } from "@/components/ui/InterviewRoomBackground";

function ResumeDocumentBody({
  name,
  document,
}: {
  name: string;
  document: DemoResumeFullDocument;
}) {
  return (
    <div className="space-y-6 text-sm leading-relaxed text-neutral-800">
      <header className="border-b border-stone-200 pb-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground">{name}</h2>
        <p className="mt-0.5 text-muted-foreground">{document.headline}</p>
        <p className="mt-2 text-xs text-neutral-600">
          {document.contact.email} · {document.contact.phone}
        </p>
        <p className="text-xs text-neutral-600">{document.contact.links.join(" · ")}</p>
      </header>

      {document.sections.map((section) => (
        <section key={section.title}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            {section.title}
          </h3>
          {section.paragraphs?.map((p) => (
            <p key={p} className="mb-2 text-neutral-700">
              {p}
            </p>
          ))}
          {section.bullets && (
            <ul className="list-disc space-y-1 pl-5 text-neutral-700">
              {section.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {section.entries?.map((entry) => (
            <div key={`${entry.title}-${entry.dates ?? ""}`} className="mb-4 last:mb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <p className="font-semibold text-foreground">{entry.title}</p>
                {entry.dates && (
                  <span className="shrink-0 text-xs text-muted-foreground">{entry.dates}</span>
                )}
              </div>
              {entry.subtitle && (
                <p className="text-xs font-medium text-neutral-600">{entry.subtitle}</p>
              )}
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-neutral-700">
                {entry.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

interface DemoResumeViewerProps {
  resumeId: DemoResumeId;
  name: string;
  disabled?: boolean;
  /** Inline expandable panel below highlights */
  showInlineExpand?: boolean;
}

export default function DemoResumeViewer({
  resumeId,
  name,
  disabled,
  showInlineExpand = true,
}: DemoResumeViewerProps) {
  const document = demoResumeDocuments[resumeId];

  return (
    <div className="space-y-3">
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium"
            disabled={disabled}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            View full resume
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
          <SheetHeader className="text-left">
            <SheetTitle>{name}&apos;s resume</SheetTitle>
            <SheetDescription>
              Sample document Mockly uses to tailor interview questions.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="mt-4 flex-1 pr-3">
            <ResumeDocumentBody name={name} document={document} />
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {showInlineExpand && (
        <details className={`group ${interviewRoomInsetPanelClassName} overflow-hidden`}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-primary hover:bg-stone-50/80 [&::-webkit-details-marker]:hidden">
            <Expand className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-45" aria-hidden />
            Expand resume on this page
          </summary>
          <div className="max-h-[min(420px,50vh)] overflow-y-auto border-t border-stone-200/50 px-4 py-4">
            <ResumeDocumentBody name={name} document={document} />
          </div>
        </details>
      )}
    </div>
  );
}
