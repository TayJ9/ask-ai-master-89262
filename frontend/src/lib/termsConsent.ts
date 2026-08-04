import { TERMS_VERSION } from "@/content/termsAndConditions";

const STORAGE_KEY = "mockly_terms_consent";

export type TermsConsentRecord = {
  version: string;
  acceptedAt: string;
};

export function getStoredTermsConsent(): TermsConsentRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TermsConsentRecord;
    if (parsed?.version !== TERMS_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasValidTermsConsent(): boolean {
  return getStoredTermsConsent() !== null;
}

export function storeTermsConsent(): TermsConsentRecord {
  const record: TermsConsentRecord = {
    version: TERMS_VERSION,
    acceptedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  return record;
}

export function clearTermsConsent(): void {
  localStorage.removeItem(STORAGE_KEY);
}
