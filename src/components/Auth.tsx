import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, Eye, EyeOff } from "lucide-react";
import { z } from "zod";

// Basic validation
const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [nameError, setNameError] = useState("");
  const { toast } = useToast();

  // Input validation functions
  const validateEmail = useCallback((value: string) => {
    const result = emailSchema.safeParse(value);
    setEmailError(result.success ? "" : result.error.errors[0].message);
    return result.success;
  }, []);

  const validatePassword = useCallback((value: string) => {
    const result = passwordSchema.safeParse(value);
    setPasswordError(result.success ? "" : result.error.errors[0].message);
    return result.success;
  }, []);

  const validateName = useCallback((value: string) => {
    const result = nameSchema.safeParse(value);
    setNameError(result.success ? "" : result.error.errors[0].message);
    return result.success;
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Clear previous errors
    setEmailError("");
    setPasswordError("");
    setNameError("");

    try {
      // Validate inputs
      const isEmailValid = validateEmail(email);
      const isPasswordValid = validatePassword(password);
      const isNameValid = isLogin || validateName(fullName);

      if (!isEmailValid || !isPasswordValid || !isNameValid) {
        setLoading(false);
        return;
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
        toast({ title: "Welcome back!" });
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });
        if (error) throw error;
        toast({ title: "Account created! You can now sign in." });
      }
    } catch (error: any) {
      // Sanitize error messages for security
      const sanitizedMessage = error.message?.replace(/[<>]/g, '') || 'An error occurred';
      toast({
        title: "Error",
        description: sanitizedMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-secondary">
      <Card className="w-full max-w-md shadow-lg animate-scale-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full gradient-primary flex items-center justify-center shadow-glow">
            <Mic className="w-8 h-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-3xl">AI Interview Coach</CardTitle>
            <CardDescription className="text-base mt-2">
              Practice interviews with AI-powered feedback
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
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
                  minLength={8}
                  maxLength={128}
                  className={passwordError ? "border-destructive pr-10" : "pr-10"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
              {!isLogin && !passwordError && password && (
                <p className="text-xs text-muted-foreground">
                  Must contain uppercase, lowercase, and number
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full gradient-primary text-white shadow-glow hover:opacity-90"
              disabled={loading}
            >
              {loading ? "Loading..." : isLogin ? "Sign In" : "Create Account"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
