import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import TermsContent from "@/components/legal/TermsContent";
import { cn } from "@/lib/utils";

type TermsAgreementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
};

const SCROLL_THRESHOLD_PX = 24;

export default function TermsAgreementDialog({
  open,
  onOpenChange,
  onAccept,
}: TermsAgreementDialogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasReadToBottom, setHasReadToBottom] = useState(false);

  const evaluateScrollPosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const atBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD_PX;
    setHasReadToBottom(atBottom);
  }, []);

  useEffect(() => {
    if (!open) {
      setHasReadToBottom(false);
      return;
    }

    const frame = requestAnimationFrame(() => {
      evaluateScrollPosition();
    });

    return () => cancelAnimationFrame(frame);
  }, [open, evaluateScrollPosition]);

  const handleAccept = () => {
    onAccept();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4 text-left">
          <DialogTitle>Terms & Conditions</DialogTitle>
          <DialogDescription>
            Scroll through the full agreement below. You must read to the end before you can accept.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          onScroll={evaluateScrollPosition}
          className="h-[min(58vh,520px)] overflow-y-auto px-6 py-4"
        >
          <TermsContent showHeader={false} />
        </div>

        {!hasReadToBottom && (
          <p className="border-t border-border bg-muted/40 px-6 py-2 text-center text-xs text-muted-foreground">
            Scroll to the bottom to enable acceptance
          </p>
        )}

        <DialogFooter className="gap-2 border-t border-border px-6 py-4 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!hasReadToBottom}
            onClick={handleAccept}
            className={cn(
              "bg-[#1a2634] text-white hover:bg-[#243447]",
              !hasReadToBottom && "opacity-50",
            )}
          >
            I Agree
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
