import BrandPanel from "@/components/login-preview/BrandPanel";
import AuthPanel from "@/components/login-preview/AuthPanel";

type LoginScreenProps = {
  onAuthSuccess?: (user: unknown, token: string) => void;
};

export default function LoginScreen({ onAuthSuccess }: LoginScreenProps) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#eceef1] px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-[1080px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_-12px_rgba(15,23,42,0.2),0_8px_24px_-8px_rgba(15,23,42,0.08)] md:min-h-[640px] md:flex-row md:items-stretch">
        <BrandPanel />
        <AuthPanel onAuthSuccess={onAuthSuccess} />
      </div>
    </div>
  );
}
