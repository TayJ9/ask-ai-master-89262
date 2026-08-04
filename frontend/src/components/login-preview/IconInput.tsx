import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface IconInputProps {
  id: string;
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  icon: LucideIcon;
  error?: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  "data-testid"?: string;
}

export default function IconInput({
  id,
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  onBlur,
  icon: Icon,
  error,
  required,
  autoComplete,
  minLength,
  maxLength,
  "data-testid": dataTestId,
}: IconInputProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-semibold text-[#1a2634]">
        {label}
      </Label>
      <div className="relative">
        <div
          className="pointer-events-none absolute left-3 top-1/2 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center rounded-[6px] border border-[#E5E7EB] bg-[#F9FAFB]"
          aria-hidden
        >
          <Icon className="h-4 w-4 text-[#9CA3AF]" />
        </div>
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          required={required}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          data-testid={dataTestId}
          className={cn(
            "h-11 rounded-lg border-[#E5E7EB] bg-white pl-[3.125rem] text-sm placeholder:text-[#9CA3AF] focus-visible:ring-[#1a2634]/20",
            error && "border-destructive focus-visible:ring-destructive/20",
          )}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
