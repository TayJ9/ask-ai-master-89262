import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, Mail, Lock, User } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuthForm } from "@/hooks/useAuthForm";
import IconInput from "./IconInput";

type AuthPanelProps = {
  onAuthSuccess?: (user: unknown, token: string) => void;
};

export default function AuthPanel({ onAuthSuccess }: AuthPanelProps) {
  const [, setLocation] = useLocation();
  const {
    isLogin,
    email,
    setEmail,
    password,
    setPassword,
    fullName,
    setFullName,
    loading,
    signupEnabled,
    emailError,
    passwordError,
    nameError,
    validateEmail,
    validatePassword,
    validateName,
    toggleMode,
    handleAuth,
  } = useAuthForm({ onAuthSuccess });

  const sampleCardClass =
    "flex h-[52px] w-full items-center justify-between gap-3 rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-left transition-colors hover:border-[#D1D5DB] hover:bg-[#F9FAFB]";

  return (
    <div className="flex w-full flex-1 flex-col justify-center bg-white p-8 md:w-1/2 md:p-10 lg:p-14">
      <div className="mb-8 space-y-3 text-center md:mb-10 md:space-y-4 lg:mb-12">
        <h1
          className="text-5xl font-bold leading-[1.15] tracking-tight sm:text-6xl md:text-[3.5rem] md:leading-[1.12] lg:text-7xl"
          data-testid="text-app-title"
        >
          <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Mockly
          </span>
        </h1>
        <p className="text-base font-medium text-[#6B7280] md:text-lg lg:text-xl">
          {isLogin ? "Sign in to your account" : "Create your account"}
        </p>
      </div>

      <form onSubmit={handleAuth} className="flex flex-1 flex-col space-y-4">
        {!isLogin && (
          <div className="space-y-1.5">
            <Label htmlFor="fullName" className="text-sm font-semibold text-[#1a2634]">
              Full Name
            </Label>
            <div className="relative">
              <div
                className="pointer-events-none absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-[#E5E7EB] bg-[#F9FAFB]"
                aria-hidden
              >
                <User className="h-4 w-4 text-[#9CA3AF]" />
              </div>
              <Input
                id="fullName"
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => validateName(fullName)}
                required={!isLogin}
                maxLength={100}
                data-testid="input-fullname"
                className={cn(
                  "h-11 rounded-lg border-[#E5E7EB] bg-white pl-[3.25rem] text-sm placeholder:text-[#9CA3AF] focus-visible:ring-[#1a2634]/20",
                  nameError && "border-destructive",
                )}
              />
            </div>
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </div>
        )}

        <IconInput
          id="email"
          label="Email"
          type="email"
          placeholder="Enter your email address"
          value={email}
          onChange={(value) => setEmail(value)}
          onBlur={() => validateEmail(email)}
          icon={Mail}
          error={emailError}
          required
          maxLength={255}
          autoComplete="email"
          data-testid="input-email"
        />

        <IconInput
          id="password"
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(value) => setPassword(value)}
          onBlur={() => validatePassword(password)}
          icon={Lock}
          error={passwordError}
          required
          minLength={6}
          maxLength={128}
          autoComplete={isLogin ? "current-password" : "new-password"}
          data-testid="input-password"
        />

        <LoadingButton
          type="submit"
          loading={loading}
          data-testid="button-submit"
          className="h-11 w-full rounded-lg bg-[#1a2634] text-sm font-medium text-white shadow-sm hover:bg-[#243447]"
        >
          {isLogin ? "Sign In" : "Create Account"}
        </LoadingButton>

        {signupEnabled && (
          <Button
            type="button"
            variant="ghost"
            onClick={toggleMode}
            data-testid="button-toggle-mode"
            className="h-auto w-full py-1 text-sm font-normal text-[#6B7280] hover:bg-transparent hover:text-[#1a2634]"
          >
            {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </Button>
        )}

        <div className="relative pt-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E5E7EB]" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-xs text-[#9CA3AF]">Preview sample report</span>
          </div>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => setLocation("/results?mock=true&interviewId=demo&demo=true")}
            className={sampleCardClass}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] bg-[#F9FAFB]">
                <Zap className="h-4 w-4 text-[#9CA3AF]" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-[#1a2634]">
                Technical (engineering)
              </span>
            </span>
            <span className="shrink-0 rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
              INSTANT
            </span>
          </button>

          <button
            type="button"
            onClick={() => setLocation("/results?mock=true&interviewId=demo&demo=business")}
            className={sampleCardClass}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] bg-[#F9FAFB]">
                <Zap className="h-4 w-4 text-[#9CA3AF]" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-[#1a2634]">
                Non-technical (business, comms)
              </span>
            </span>
            <span className="shrink-0 rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
              INSTANT
            </span>
          </button>
        </div>

        <p className="text-center text-xs leading-relaxed text-[#9CA3AF]">
          Opens a full sample results view—useful for demos and stakeholders.
        </p>
      </form>
    </div>
  );
}
