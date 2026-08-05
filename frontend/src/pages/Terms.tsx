/**
 * Standalone Terms & Conditions page.
 * View at: /terms
 */

import { Link } from "wouter";
import TermsContent from "@/components/legal/TermsContent";

export default function Terms() {
  return (
    <div className="min-h-[100dvh] bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-6 shadow-sm sm:p-10">
        <TermsContent />
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
