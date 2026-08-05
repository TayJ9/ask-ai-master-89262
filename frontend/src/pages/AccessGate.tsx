import { useState } from "react";
import { useLocation } from "wouter";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { useToast } from "@/hooks/use-toast";
import { apiPost, ApiError } from "@/lib/api";
import { markAccessGranted } from "@/lib/accessStatusCache";
import { preloadIndexRoute } from "@/lib/routePreload";
import { Link } from "wouter";

export default function AccessGate() {
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = (await apiPost("/api/access/verify", { code: code.trim() })) as {
        validUntil?: string;
      };
      markAccessGranted(data.validUntil);
      preloadIndexRoute();
      toast({ title: "Access granted", description: "Welcome to Mockly." });
      setLocation("/");
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Invalid access code. Please try again.";
      toast({
        title: "Access denied",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatedBackground staticDecor className="flex min-h-[100dvh] items-center justify-center px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <Card className="w-full max-w-md animate-scale-in border border-border/80 bg-card shadow-xl">
        <CardHeader className="space-y-4 p-4 pb-2 text-center sm:p-6 sm:pb-2">
          <div className="space-y-2 overflow-visible">
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Mockly
              </span>
            </h1>
            <CardDescription className="text-balance text-base leading-relaxed">
              Enter the hourly access code to continue. Access lasts one hour from when you enter it; codes rotate on the UTC hour.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accessCode">Access code</Label>
              <Input
                id="accessCode"
                type="text"
                placeholder="XXXX-XXXX"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required
                maxLength={16}
                data-testid="input-access-code"
              />
            </div>
            <LoadingButton
              type="submit"
              className="w-full gradient-primary text-white shadow-glow hover:opacity-90"
              loading={loading}
              data-testid="button-access-submit"
            >
              Continue
            </LoadingButton>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              By continuing you agree to our{" "}
              <Link href="/terms" className="text-primary underline-offset-4 hover:underline">
                Terms &amp; Conditions
              </Link>
              .
            </p>
          </form>
        </CardContent>
      </Card>
    </AnimatedBackground>
  );
}
