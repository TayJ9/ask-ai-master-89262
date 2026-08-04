import { useState, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { z } from "zod";
import { devLog } from "@/lib/utils";
import {
  hasValidTermsConsent,
  storeTermsConsent,
  clearTermsConsent,
} from "@/lib/termsConsent";

const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

export function useAuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(() => hasValidTermsConsent());
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

  const acceptTerms = useCallback(() => {
    storeTermsConsent();
    setTermsAccepted(true);
  }, []);

  const revokeTerms = useCallback(() => {
    clearTermsConsent();
    setTermsAccepted(false);
  }, []);

  useEffect(() => {
    setTermsAccepted(hasValidTermsConsent());
  }, [isLogin]);

  const toggleMode = useCallback(() => {
    setIsLogin((prev) => !prev);
    setPasswordError("");
    setNameError("");
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    setEmailError("");
    setPasswordError("");
    setNameError("");

    try {
      if (!termsAccepted) {
        toast({
          title: "Terms required",
          description: isLogin
            ? "Please read and accept the Terms & Conditions to continue."
            : "Please read and accept the Terms & Conditions to create an account.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const isEmailValid = validateEmail(email);
      const isPasswordValid = validatePassword(password);
      const isNameValid = isLogin || validateName(fullName);

      if (!isEmailValid || !isPasswordValid || !isNameValid) {
        setLoading(false);
        return;
      }

      const endpoint = isLogin ? "/api/auth/signin" : "/api/auth/signup";
      const body = isLogin
        ? { email: email.trim().toLowerCase(), password }
        : { email: email.trim().toLowerCase(), password, fullName: fullName.trim() };

      const { apiPost, ApiError } = await import("@/lib/api");
      const data = await apiPost(endpoint, body);

      if (isLogin) {
        if (data == null || !data.token || !data.user) {
          throw new Error(
            "Could not reach the API or the response was empty. Start the backend (npm run dev:backend) and ensure its PORT matches frontend/vite.config.ts proxy.",
          );
        }

        const trimmedToken = data.token.trim();
        if (!trimmedToken) {
          throw new Error("Invalid token received from server.");
        }

        const tokenPreview =
          trimmedToken.length > 20 ? `${trimmedToken.substring(0, 20)}...` : trimmedToken;
        devLog.log("[useAuthForm] Storing token in localStorage:", {
          length: trimmedToken.length,
          preview: tokenPreview,
          wasTrimmed: trimmedToken !== data.token,
        });

        try {
          localStorage.setItem("auth_token", trimmedToken);
          localStorage.setItem("user", JSON.stringify(data.user));

          const storedToken = localStorage.getItem("auth_token");
          if (storedToken !== trimmedToken) {
            devLog.error("[useAuthForm] Token storage verification failed");
            throw new Error("Token storage verification failed.");
          }

          devLog.log("[useAuthForm] Token successfully stored and verified");
        } catch (storageError: unknown) {
          console.error("[useAuthForm] Failed to store auth data:", storageError);
          throw new Error(
            "Failed to save authentication data. Please check your browser settings.",
          );
        }

        toast({ title: "Welcome back!" });
        setLocation("/");
      } else {
        toast({
          title: "Success!",
          description:
            "Your account has been created successfully. You can now sign in with your credentials.",
        });
        setIsLogin(true);
        setPassword("");
        setFullName("");
      }
    } catch (error: unknown) {
      const { ApiError } = await import("@/lib/api");
      let errorMessage = "An error occurred";

      if (error instanceof ApiError) {
        errorMessage = error.message;
      } else if (error instanceof Error && error.message) {
        errorMessage = error.message.replace(/[<>]/g, "");
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

  return {
    isLogin,
    email,
    setEmail,
    password,
    setPassword,
    fullName,
    setFullName,
    loading,
    termsAccepted,
    acceptTerms,
    revokeTerms,
    emailError,
    passwordError,
    nameError,
    validateEmail,
    validatePassword,
    validateName,
    toggleMode,
    handleAuth,
  };
}
