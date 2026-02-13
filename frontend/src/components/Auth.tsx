import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, Eye, EyeOff, Zap } from "lucide-react";
import { z } from "zod";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import { useLocation } from "wouter";
import { devLog } from "@/lib/utils";

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
  const { toast } = useToast();
  const [, setLocation] = useLocation();

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
        if (!data.token || !data.user) {
          throw new Error('Invalid response from server. Missing token or user data.');
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

  return (
    <AnimatedBackground className="flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg animate-scale-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full gradient-primary flex items-center justify-center shadow-glow">
            <Mic className="w-8 h-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent" data-testid="text-app-title">Mockly</CardTitle>
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
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setIsLogin(!isLogin)}
              data-testid="button-toggle-mode"
            >
              {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </Button>

            {/* Demo Mode Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>

            {/* Quick Demo Buttons */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation('/results?mock=true&interviewId=demo&demo=true')}
                className="group w-full border-2 border-purple-500 text-purple-700 hover:bg-purple-50 hover:border-purple-600 hover:text-purple-700 shadow-md hover:shadow-xl hover:scale-100 transition-[box-shadow,background-color,border-color] duration-300"
              >
                <span className="inline-flex items-center group-hover:font-bold">
                  <Zap className="w-4 h-4 mr-2 shrink-0" />
                  Technical
                </span>
                <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                  No Sign-Up
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation('/results?mock=true&interviewId=demo&demo=business')}
                className="group w-full border-2 border-teal-500 text-teal-700 hover:bg-teal-50 hover:border-teal-600 hover:text-teal-700 shadow-md hover:shadow-xl hover:scale-100 transition-[box-shadow,background-color,border-color] duration-300"
              >
                <span className="inline-flex items-center group-hover:font-bold">
                  <Zap className="w-4 h-4 mr-2 shrink-0" />
                  Non-Technical
                </span>
                <span className="ml-2 text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-semibold">
                  No Sign-Up
                </span>
              </Button>
            </div>
            <p className="text-xs text-center text-gray-500">
              See sample results—Technical (engineering) or Non-Technical (marketing, business)
            </p>
          </form>
        </CardContent>
      </Card>
    </AnimatedBackground>
  );
}
