import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import { apiGet } from "@/lib/api";

type VerifyState = "loading" | "success" | "already" | "error";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<VerifyState>("loading");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token")?.trim();
    if (!token) {
      setState("error");
      setMessage("Missing verification token. Use the link from your email or request a new one.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (data?.alreadyVerified) {
          setState("already");
          setMessage("Your email is already verified. You can sign in.");
        } else {
          setState("success");
          setMessage(data?.message || "Email verified successfully. You can now sign in.");
        }
      } catch (error: unknown) {
        if (cancelled) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Verification failed.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const isOk = state === "success" || state === "already";

  return (
    <AnimatedBackground className="flex min-h-[100dvh] items-center justify-center p-4">
      <Card className="w-full max-w-md border border-border/80 bg-card/95 shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            {state === "loading" && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
            {isOk && <CheckCircle2 className="h-6 w-6 text-green-600" />}
            {state === "error" && <XCircle className="h-6 w-6 text-destructive" />}
          </div>
          <CardTitle>{state === "loading" ? "Verifying email" : isOk ? "Email verified" : "Verification failed"}</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        {state !== "loading" && (
          <CardContent className="flex flex-col gap-3">
            <Button className="w-full gradient-primary text-white" onClick={() => setLocation("/")}>
              {isOk ? "Sign in" : "Back to sign in"}
            </Button>
            {state === "error" && (
              <p className="text-center text-sm text-muted-foreground">
                Need a new link?{" "}
                <Link href="/" className="text-primary underline-offset-4 hover:underline">
                  Sign in page
                </Link>{" "}
                has a resend option after a failed login.
              </p>
            )}
          </CardContent>
        )}
      </Card>
    </AnimatedBackground>
  );
}
