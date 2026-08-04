import {
  TERMS_CONTACT_EMAIL,
  TERMS_LAST_UPDATED,
  TERMS_SECTIONS,
} from "@/content/termsAndConditions";

type TermsContentProps = {
  className?: string;
  showHeader?: boolean;
};

export default function TermsContent({ className, showHeader = true }: TermsContentProps) {
  return (
    <article className={className}>
      {showHeader && (
        <header className="mb-6 space-y-2 border-b border-border pb-4">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Mockly Terms & Conditions
          </h1>
          <p className="text-sm text-muted-foreground">Last updated: {TERMS_LAST_UPDATED}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Please read these terms carefully. They explain what data Mockly collects—including your
            name, resume, and interview transcripts—and how we use AI services to provide mock
            interviews and feedback.
          </p>
        </header>
      )}

      <div className="space-y-6">
        {TERMS_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
            {section.bullets && (
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <footer className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
        Contact: {TERMS_CONTACT_EMAIL}
      </footer>
    </article>
  );
}
