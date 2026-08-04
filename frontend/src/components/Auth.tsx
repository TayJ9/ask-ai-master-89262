import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Zap } from "lucide-react";
import { z } from "zod";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import { useLocation } from "wouter";
import { devLog, cn } from "@/lib/utils";

const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

interface AuthProps {
  onAuthSuccess: (user: any, token: string) => void;
}

export default function Auth({ onAuthSuccess }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [nameError, setNameError] = useState("");
  const [signupEnabled, setSignupEnabled] = useState(true);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { apiGet } = await import("@/lib/api");
        const config = await apiGet("/api/auth/config");
        if (!cancelled && config && typeof config.signupEnabled === "boolean") {
          setSignupEnabled(config.signupEnabled);
          if (!config.signupEnabled) setIsLogin(true);
        }
      } catch {
        // Keep signup visible when config is unavailable (local dev without gate)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const validateEmail = useCallback((value: string) => {
    const result = emailSchema.safeParse(value);
    setEmailError(result.success ? "" : result.error.issues[0].message);
    return result.success;
  }, []);

  const validatePassword = useCallback((value: string) => {
    const result = passwordSchema.safeParse(value);
    setPasswordError(result.success ? "" : result.error.issues[0].message);
    return result.success;
  }, []);

  const validateName = useCallback((value: string) => {
    const result = nameSchema.safeParse(value);
    setNameError(result.success ? "" : result.error.issues[0].message);
    return result.success;
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    setEmailError("");
    setPasswordError("");
    setNameError("");

    try {
      const isEmailValid = validateEmail(email);
      const isPasswordValid = validatePassword(password);
      const isNameValid = isLogin || validateName(fullName);

      if (!isEmailValid || !isPasswordValid || !isNameValid) {
        setLoading(false);
        return;
      }

      const endpoint = isLogin ? '/api/auth/signin' : '/api/auth/signup';
      const body = isLogin 
        ? { email: email.trim().toLowerCase(), password }
        : { email: email.trim().toLowerCase(), password, fullName: fullName.trim() };

      const { apiPost, ApiError } = await import('@/lib/api');
      const data = await apiPost(endpoint, body);

      if (isLogin) {
        // Validate response structure
        if (data == null || !data.token || !data.user) {
          throw new Error(
            'Could not reach the API or the response was empty. Start the backend (npm run dev:backend) and ensure its PORT matches frontend/vite.config.ts proxy.'
          );
        }
        
        // Trim token to ensure no leading/trailing whitespace
        const trimmedToken = data.token.trim();
        if (!trimmedToken) {
          throw new Error('Invalid token received from server.');
        }
        
        // Log token info for debugging (masked)
        const tokenPreview = trimmedToken.length > 20 ? `${trimmedToken.substring(0, 20)}...` : trimmedToken;
        devLog.log('[Auth] Storing token in localStorage:', {
          length: trimmedToken.length,
          preview: tokenPreview,
          wasTrimmed: trimmedToken !== data.token
        });
        
        // Store auth data in localStorage with error handling
        try {
          localStorage.setItem('auth_token', trimmedToken);
          localStorage.setItem('user', JSON.stringify(data.user));
          
          // Verify token was stored correctly
          const storedToken = localStorage.getItem('auth_token');
          if (storedToken !== trimmedToken) {
            devLog.error('[Auth] Token storage verification failed:', {
              expected: trimmedToken.substring(0, 20) + '...',
              actual: storedToken ? storedToken.substring(0, 20) + '...' : 'null'
            });
            throw new Error('Token storage verification failed.');
          }
          
          devLog.log('[Auth] Token successfully stored and verified');
        } catch (storageError: any) {
          console.error('[Auth] Failed to store auth data:', storageError);
          throw new Error('Failed to save authentication data. Please check your browser settings.');
        }
        
        toast({ title: "Welcome back!" });
        onAuthSuccess(data.user, trimmedToken);
      } else {
        toast({ 
          title: "Success!", 
          description: "Your account has been created successfully. You can now sign in with your credentials.",
        });
        setIsLogin(true);
        // Clear password but keep email for convenience
        setPassword("");
        // Optionally clear name field
        setFullName("");
      }
    } catch (error: any) {
      const { ApiError } = await import('@/lib/api');
      let errorMessage = 'An error occurred';
      
      if (error instanceof ApiError) {
        errorMessage = error.message;
      } else if (error.message) {
        errorMessage = error.message.replace(/[<>]/g, '');
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sampleButtonClass =
    "flex h-auto min-h-11 w-full flex-col items-center justify-center gap-2 whitespace-normal px-3 py-3 text-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4";

  return (
    <AnimatedBackground className="flex min-h-[100dvh] items-center justify-center px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <Card className="w-full max-w-md animate-scale-in border border-border/80 bg-card/95 shadow-xl backdrop-blur-sm">
        <CardHeader className="space-y-4 p-4 pb-2 text-center sm:p-6 sm:pb-2">
          <div className="space-y-2 overflow-visible">
            <h1
              className="text-5xl font-bold leading-[1.5] tracking-tight sm:text-6xl sm:leading-[1.5]"
              data-testid="text-app-title"
            >
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Mockly
              </span>
            </h1>
            <CardDescription className="text-balance text-base leading-relaxed">
              Voice sessions tailored for students and early-career roles—save progress and review
              results anytime.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (e.target.value) validateName(e.target.value);
                  }}
                  onBlur={() => validateName(fullName)}
                  required={!isLogin}
                  maxLength={100}
                  className={nameError ? "border-destructive" : ""}
                  data-testid="input-fullname"
                />
                {nameError && <p className="text-sm text-destructive">{nameError}</p>}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (e.target.value) validateEmail(e.target.value);
                }}
                onBlur={() => validateEmail(email)}
                required
                maxLength={255}
                className={emailError ? "border-destructive" : ""}
                autoComplete="email"
                data-testid="input-email"
              />
              {emailError && <p className="text-sm text-destructive">{emailError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (e.target.value) validatePassword(e.target.value);
                  }}
                  onBlur={() => validatePassword(password)}
                  required
                  minLength={6}
                  maxLength={128}
                  className={passwordError ? "border-destructive pr-10" : "pr-10"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  data-testid="input-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
            </div>
            <LoadingButton
              type="submit"
              className="w-full gradient-primary text-white shadow-glow hover:opacity-90"
              loading={loading}
              data-testid="button-submit"
            >
              {isLogin ? "Sign In" : "Create Account"}
            </LoadingButton>
            {signupEnabled && (
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-h-10 w-full whitespace-normal py-2.5 text-balance leading-snug"
                onClick={() => setIsLogin(!isLogin)}
                data-testid="button-toggle-mode"
              >
                {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </Button>
            )}

            {/* Sample results (no account) */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-card px-2 text-muted-foreground">Preview sample report</span>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/results?mock=true&interviewId=demo&demo=true")}
                className={cn(
                  sampleButtonClass,
                  "border-primary/25 bg-primary/[0.03] transition-all duration-500 ease-out hover:bg-primary/10 hover:text-foreground",
                )}
              >
                <span className="flex min-w-0 items-center justify-center gap-2 text-center text-sm leading-snug sm:justify-start sm:text-left">
                  <Zap className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 text-balance">Technical (engineering)</span>
                </span>
                <span className="shrink-0 rounded-full border border-border bg-muted/80 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Instant
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/results?mock=true&interviewId=demo&demo=business")}
                className={cn(
                  sampleButtonClass,
                  "border-secondary/25 bg-secondary/[0.06] transition-all duration-500 ease-out hover:bg-secondary/12 hover:text-foreground",
                )}
              >
                <span className="flex min-w-0 items-center justify-center gap-2 text-center text-sm leading-snug sm:justify-start sm:text-left">
                  <Zap className="h-4 w-4 shrink-0 text-secondary" aria-hidden />
                  <span className="min-w-0 text-balance">Non-technical (business, comms)</span>
                </span>
                <span className="shrink-0 rounded-full border border-border bg-muted/80 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Instant
                </span>
              </Button>
            </div>
            <p className="text-balance text-center text-xs leading-relaxed text-muted-foreground">
              Opens a full sample results view—useful for demos and stakeholders.
            </p>
          </form>
        </CardContent>
      </Card>
    </AnimatedBackground>
  );
}
