import { useState, useRef, useEffect, memo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, X, CheckCircle2, ArrowLeft, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiPostFormData, apiPost, ApiError } from "@/lib/api";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { devLog } from "@/lib/utils";
import { generateClientSessionId } from "@/lib/sessionId";
import {
  type ResumeUploadCandidateInfo,
  type ResumeUploadResponse,
  hasResumeContext,
  hasResumeUploadSession,
} from "@/lib/candidateContext";

/**
 * Lightweight heuristic: does the text look like a resume?
 * Checks for common resume keywords and minimum length.
 * Returns { ok: true } if it passes, or { ok: false, reason: string } if suspicious.
 */
function checkResumeContent(text: string): { ok: boolean; reason?: string } {
  const trimmed = text.trim();

  // Too short to be a real resume
  if (trimmed.length < 80) {
    return { ok: false, reason: "The uploaded document contains very little text. It may be a scanned image or the wrong file." };
  }

  // Check for at least a couple of common resume-related keywords
  const keywords = [
    "experience", "education", "skills", "work", "project",
    "university", "college", "school", "degree", "gpa",
    "intern", "job", "employment", "volunteer", "certification",
    "resume", "objective", "summary", "reference", "award",
    "bachelor", "master", "major", "minor", "coursework",
    "leadership", "proficien", "responsible", "manage", "develop",
  ];
  const lower = trimmed.toLowerCase();
  const matchCount = keywords.filter(kw => lower.includes(kw)).length;

  if (matchCount < 2) {
    return { ok: false, reason: "This document doesn't appear to be a resume. Make sure you uploaded the right file." };
  }

  return { ok: true };
}

const DRAFT_STORAGE_KEY = "resume_upload_draft";
const NO_RESUME_WARNING_MESSAGE =
  "Adding a resume helps the AI tailor questions to your experience and background.";

type ResumeUploadDraft = {
  firstName?: string;
  major?: string;
  year?: string;
};

function readDraft(): ResumeUploadDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ResumeUploadDraft) : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

interface ResumeUploadProps {
  onResumeUploaded: (resumeText: string, candidateInfo?: ResumeUploadCandidateInfo) => void;
  onBack?: () => void;
}

function ResumeUpload({ onResumeUploaded, onBack }: ResumeUploadProps) {
  const initialDraft = readDraft();
  const [resumeText, setResumeText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [candidateFirstName, setCandidateFirstName] = useState(initialDraft?.firstName ?? "");
  const [candidateMajor, setCandidateMajor] = useState(initialDraft?.major ?? "");
  const [candidateYear, setCandidateYear] = useState(initialDraft?.year ?? "");
  const [resumeWarning, setResumeWarning] = useState<string | null>(null);
  const [noResumeWarning, setNoResumeWarning] = useState<string | null>(null);
  /** Server-persisted session id (PDF upload or text persist) for ElevenLabs resume tools */
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
  const [resumeSummary, setResumeSummary] = useState<string | undefined>();
  const [resumeHighlights, setResumeHighlights] = useState<string | undefined>();
  const [resumeSkills, setResumeSkills] = useState<string[] | undefined>();
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [pendingResumeText, setPendingResumeText] = useState("");
  const [pendingCandidateInfo, setPendingCandidateInfo] = useState<ResumeUploadCandidateInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noResumeWarningShownRef = useRef(false);
  const mountedRef = useRef(true);
  const uploadGenerationRef = useRef(0);
  const activeUploadAbortRef = useRef<AbortController | null>(null);
  const lastUploadedTextRef = useRef("");
  const { toast } = useToast();
  const isCandidateProfileComplete =
    Boolean(candidateFirstName.trim()) && Boolean(candidateMajor.trim()) && Boolean(candidateYear.trim());

  const beginUploadAttempt = () => {
    activeUploadAbortRef.current?.abort();
    const controller = new AbortController();
    activeUploadAbortRef.current = controller;
    const generation = uploadGenerationRef.current + 1;
    uploadGenerationRef.current = generation;
    return { controller, generation };
  };

  const isCurrentUploadAttempt = (generation: number) =>
    mountedRef.current && uploadGenerationRef.current === generation;

  useEffect(() => {
    try {
      sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          firstName: candidateFirstName,
          major: candidateMajor,
          year: candidateYear,
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [candidateFirstName, candidateMajor, candidateYear]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      uploadGenerationRef.current += 1;
      activeUploadAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]);

  const clearUploadedPdf = () => {
    setPdfPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setUploadedFileName(null);
  };

  useEffect(() => {
    if (resumeText.trim()) {
      noResumeWarningShownRef.current = false;
      setNoResumeWarning(null);
    }
  }, [resumeText]);

  const proceedWithoutResume = () => {
    const sessionId = generateClientSessionId();
    showConfirmStep("", {
      firstName: candidateFirstName.trim(),
      major: candidateMajor.trim(),
      year: candidateYear.trim(),
      sessionId,
      resumeSource: "not_provided",
    });
  };

  const showConfirmStep = (resume: string, candidateInfo: ResumeUploadCandidateInfo) => {
    setPendingResumeText(resume);
    setPendingCandidateInfo(candidateInfo);
    setStep("confirm");
  };

  const handleConfirmProceed = () => {
    if (!pendingCandidateInfo) return;
    clearDraft();
    onResumeUploaded(pendingResumeText, pendingCandidateInfo);
  };

  const handleBackToEdit = () => {
    setStep("form");
  };

  const warnOrProceedWithoutResume = () => {
    if (!isCandidateProfileComplete) {
      toast({
        title: "Complete your profile first",
        description: "Enter your first name, major/field, and academic level before continuing.",
        variant: "destructive",
      });
      return;
    }

    if (!noResumeWarningShownRef.current) {
      noResumeWarningShownRef.current = true;
      setNoResumeWarning(NO_RESUME_WARNING_MESSAGE);
      return;
    }

    noResumeWarningShownRef.current = false;
    setNoResumeWarning(null);
    proceedWithoutResume();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isCandidateProfileComplete) {
      toast({
        title: "Complete your profile first",
        description: "Enter your first name, major/field, and academic level before uploading a resume.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    // Log file details before upload for debugging
    devLog.log('Uploading file:', {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toISOString()
    });

    // Client-side file type validation
    if (file.type !== "application/pdf") {
      devLog.error('[ResumeUpload] Invalid file type:', file.type);
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      return;
    }

    // Client-side file size validation (10MB max, matching backend)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      devLog.error('[ResumeUpload] File too large:', {
        fileSize: file.size,
        fileSizeMB: fileSizeMB,
        maxSizeMB: 10
      });
      toast({
        title: "File too large",
        description: `File size (${fileSizeMB}MB) exceeds the 10MB limit. Please compress your PDF or use a smaller file.`,
        variant: "destructive",
      });
      return;
    }

    // Additional validation: check file extension as fallback
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      devLog.warn('[ResumeUpload] File extension mismatch:', file.name);
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file (.pdf extension required).",
        variant: "destructive",
      });
      return;
    }

    // Validate candidate info
    if (!candidateFirstName.trim() || !candidateMajor.trim() || !candidateYear.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in your first name, major, and year before uploading.",
        variant: "destructive",
      });
      return;
    }

    // Check for authentication token before upload
    const token = localStorage.getItem('auth_token');
    if (!token || !token.trim()) {
      devLog.error('[ResumeUpload] No auth token found in localStorage');
      devLog.error('[ResumeUpload] localStorage keys:', Object.keys(localStorage));
      toast({
        title: "Authentication Required",
        description: "Please sign in again to upload your resume.",
        variant: "destructive",
      });
      return;
    }

    // Log token info for debugging (masked)
    const tokenPreview = token.length > 20 ? `${token.substring(0, 20)}...` : token;
    devLog.log('[ResumeUpload] Token check before upload:', {
      exists: true,
      length: token.length,
      preview: tokenPreview,
      trimmed: token.trim() === token
    });

    const { controller, generation } = beginUploadAttempt();
    setIsUploading(true);
    setUploadedFileName(file.name);
    setPdfPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });

    try {
      // Log FormData contents before sending (file details only, not file content)
      devLog.log('[ResumeUpload] Preparing FormData:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        candidateName: candidateFirstName.trim(),
        major: candidateMajor.trim(),
        year: candidateYear.trim()
      });

      const clientSessionId = resumeSessionId ?? generateClientSessionId();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sessionId", clientSessionId);
      formData.append("firstName", candidateFirstName.trim());
      formData.append("major", candidateMajor.trim());
      formData.append("year", candidateYear.trim());

      const tokenForLog = localStorage.getItem('auth_token');
      const maskedToken = tokenForLog 
        ? `${tokenForLog.substring(0, 10)}...${tokenForLog.substring(tokenForLog.length - 4)}`
        : 'MISSING';
      devLog.log('[ResumeUpload] Sending upload request to /api/resume/upload with headers:', {
        hasAuthorization: !!tokenForLog,
        authorizationPreview: tokenForLog ? `Bearer ${maskedToken}` : 'none',
        contentType: 'multipart/form-data (set by browser)',
        sessionId: clientSessionId,
      });
      
      devLog.log('[ResumeUpload] Sending upload request to /api/resume/upload');
      const data = (await apiPostFormData('/api/resume/upload', formData, {
        signal: controller.signal,
      })) as ResumeUploadResponse;
      if (!isCurrentUploadAttempt(generation)) return;
      devLog.log('[ResumeUpload] Upload successful:', {
        sessionId: data.sessionId,
        hasResumeText: !!data.resumeText,
        resumeTextLength: data.resumeText?.length || 0
      });

      if (!hasResumeUploadSession(data)) {
        throw new Error("Resume upload did not return a session ID. Please try again.");
      }

      if (!hasResumeContext(data)) {
        throw new Error("Resume upload did not return readable resume context. Please try another PDF or paste the text.");
      }
      
      setResumeSessionId(data.sessionId);
      setResumeSummary(data.resume_summary);
      setResumeHighlights(data.resume_highlights);
      setResumeSkills(data.resumeProfile?.skills);

      // Store sessionId and candidate info (include HF-enhanced summary/highlights when available)
      const candidateInfo = {
        firstName: candidateFirstName.trim(),
        major: candidateMajor.trim(),
        year: candidateYear.trim(),
        sessionId: data.sessionId,
        resumeSource: "pdf_upload",
        resume_summary: data.resume_summary,
        resume_highlights: data.resume_highlights,
        skills: data.resumeProfile?.skills,
      };
      
      // Extract resume text from parsed data if available
      const extractedResumeText = data.resumeText || resumeText || 
        `First Name: ${candidateFirstName}\nMajor: ${candidateMajor}\nYear: ${candidateYear}`;
      
      setResumeText(extractedResumeText);
      lastUploadedTextRef.current = extractedResumeText;
      
      // Soft content check -- warn but don't block
      const contentCheck = checkResumeContent(extractedResumeText);
      if (!contentCheck.ok) {
        setResumeWarning(contentCheck.reason ?? null);
        devLog.warn('[ResumeUpload] Content warning:', contentCheck.reason);
        toast({
          title: "Heads up -- this may not be a resume",
          description: contentCheck.reason + " You can still continue if this is correct.",
          variant: "destructive",
          duration: 8000,
        });
        // Don't auto-proceed; let the user review and click "Continue with Resume"
        return;
      }

      setResumeWarning(null);
      toast({
        title: "Resume uploaded successfully!",
        description: "Your resume has been processed and is ready for your interview.",
      });
      
      // Call callback with resume text and candidate info — review step first
      showConfirmStep(extractedResumeText, candidateInfo);
    } catch (error: any) {
      if (!isCurrentUploadAttempt(generation) || error?.statusCode === 499) {
        return;
      }
      // Enhanced error logging
      devLog.error('[ResumeUpload] Upload failed:', {
        error: error.message || error,
        errorType: error instanceof ApiError ? 'ApiError' : typeof error,
        statusCode: error instanceof ApiError ? error.statusCode : undefined,
        fileName: file.name,
        fileSize: file.size
      });
      
      const errorMessage = error instanceof ApiError 
        ? error.message 
        : (error.message || "Failed to process resume. Please try again.");
      
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
      clearUploadedPdf();

      // Reset file input on error
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } finally {
      if (isCurrentUploadAttempt(generation)) {
        setIsUploading(false);
        if (activeUploadAbortRef.current === controller) {
          activeUploadAbortRef.current = null;
        }
      }
    }
  };

  const handleTextPaste = async () => {
    if (!resumeText.trim()) {
      toast({
        title: "Empty resume",
        description: "Please paste or type your resume text.",
        variant: "destructive",
      });
      return;
    }

    if (!candidateFirstName.trim() || !candidateMajor.trim() || !candidateYear.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in your first name, major, and year.",
        variant: "destructive",
      });
      return;
    }

    const { controller, generation } = beginUploadAttempt();
    setIsUploading(true);

    try {
      const data = (await apiPost('/api/resume/upload', {
        text: resumeText,
        sessionId: resumeSessionId ?? generateClientSessionId(),
      }, { signal: controller.signal })) as ResumeUploadResponse;
      if (!isCurrentUploadAttempt(generation)) return;

      if (!hasResumeUploadSession(data)) {
        throw new Error("Resume save did not return a session ID. Please try again.");
      }

      const savedResumeText = data.resumeText || resumeText;
      setResumeText(savedResumeText);
      lastUploadedTextRef.current = savedResumeText;
      setResumeSessionId(data.sessionId);
      if (data.resume_summary) setResumeSummary(data.resume_summary);
      if (data.resume_highlights) setResumeHighlights(data.resume_highlights);
      if (data.resumeProfile?.skills) setResumeSkills(data.resumeProfile.skills);

      toast({
        title: "Resume saved",
        description: "Your resume text has been saved for the interview.",
      });
    } catch (error: any) {
      if (!isCurrentUploadAttempt(generation) || error?.statusCode === 499) {
        return;
      }
      const errorMessage = error instanceof ApiError 
        ? error.message 
        : (error.message || "Failed to save resume text.");
      
      toast({
        title: "Failed to save",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      if (isCurrentUploadAttempt(generation)) {
        setIsUploading(false);
        if (activeUploadAbortRef.current === controller) {
          activeUploadAbortRef.current = null;
        }
      }
    }
  };

  const handleSkip = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    warnOrProceedWithoutResume();
  };

  const handleContinue = async () => {
    if (!candidateFirstName.trim() || !candidateMajor.trim() || !candidateYear.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in your first name, major, and year.",
        variant: "destructive",
      });
      return;
    }

    if (!resumeText.trim()) {
      warnOrProceedWithoutResume();
      return;
    }

    // Soft content check on first click -- warn but allow a second click to proceed
    const contentCheck = checkResumeContent(resumeText);
    if (!contentCheck.ok && !resumeWarning) {
      setResumeWarning(contentCheck.reason ?? null);
      toast({
        title: "Heads up -- this may not be a resume",
        description: (contentCheck.reason ?? "") + " Click \"Continue\" again if you're sure.",
        variant: "destructive",
        duration: 8000,
      });
      return;
    }

    setResumeWarning(null);
    const { controller, generation } = beginUploadAttempt();
    setIsUploading(true);

    try {
      let sessionId = resumeSessionId;
      let resume_summary = resumeSummary;
      let resume_highlights = resumeHighlights;
      let skills = resumeSkills;
      let resumeTextForInterview = resumeText;
      const resumeChangedSinceUpload =
        Boolean(uploadedFileName) && resumeText.trim() !== lastUploadedTextRef.current.trim();

      // PDF upload is reused only if the preview text has not been edited since upload.
      if (!sessionId || !uploadedFileName || resumeChangedSinceUpload) {
        const clientSessionId = sessionId ?? generateClientSessionId();
        const data = (await apiPost('/api/resume/upload', {
          text: resumeText,
          sessionId: clientSessionId,
          firstName: candidateFirstName.trim(),
          major: candidateMajor.trim(),
          year: candidateYear.trim(),
        }, { signal: controller.signal })) as ResumeUploadResponse;
        if (!isCurrentUploadAttempt(generation)) return;

        if (!hasResumeUploadSession(data)) {
          throw new Error("Resume save did not return a session ID. Please try again.");
        }

        sessionId = data.sessionId;
        setResumeSessionId(sessionId);
        resume_summary = data.resume_summary;
        resume_highlights = data.resume_highlights;
        skills = data.resumeProfile?.skills;
        if (data.resumeText) {
          resumeTextForInterview = data.resumeText;
          setResumeText(data.resumeText);
        }
        lastUploadedTextRef.current = resumeTextForInterview;
      }

      if (!sessionId) {
        throw new Error("Could not register resume session for the interview.");
      }

      const candidateInfo = {
        firstName: candidateFirstName.trim(),
        major: candidateMajor.trim(),
        year: candidateYear.trim(),
        sessionId,
        resumeSource: uploadedFileName && !resumeChangedSinceUpload ? "pdf_upload" : "text_resume",
        resume_summary,
        resume_highlights,
        skills,
      };
      clearDraft();
      if (!isCurrentUploadAttempt(generation)) return;
      showConfirmStep(resumeTextForInterview, candidateInfo);
    } catch (error: unknown) {
      if (
        !isCurrentUploadAttempt(generation) ||
        (error instanceof ApiError && error.statusCode === 499)
      ) {
        return;
      }
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : (error instanceof Error ? error.message : "Failed to save resume before starting the interview.");
      toast({
        title: "Could not save resume",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      if (isCurrentUploadAttempt(generation)) {
        setIsUploading(false);
        if (activeUploadAbortRef.current === controller) {
          activeUploadAbortRef.current = null;
        }
      }
    }
  };

  if (step === "confirm" && pendingCandidateInfo) {
    const isPdfUpload =
      pendingCandidateInfo.resumeSource === "pdf_upload" &&
      Boolean(uploadedFileName) &&
      Boolean(pdfPreviewUrl);
    const isTextResume =
      pendingCandidateInfo.resumeSource === "text_resume" && Boolean(pendingResumeText.trim());
    const hasNoResume =
      pendingCandidateInfo.resumeSource === "not_provided" ||
      (!isPdfUpload && !pendingResumeText.trim());

    return (
      <AnimatedBackground className="flex min-h-screen items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.33, 1, 0.68, 1] }}
          className="w-full max-w-2xl"
        >
          <Card className="overflow-hidden border border-border/80 bg-card shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl tracking-tight sm:text-3xl">Review before you start</CardTitle>
              <CardDescription className="text-base leading-relaxed">
                Confirm your details are correct. You can go back to edit anything before the interview begins.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 rounded-lg border bg-muted/40 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">First name</p>
                  <p className="mt-1 font-medium">{pendingCandidateInfo.firstName}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Major</p>
                  <p className="mt-1 font-medium">{pendingCandidateInfo.major}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Academic level</p>
                  <p className="mt-1 font-medium">{pendingCandidateInfo.year}</p>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Resume</p>
                {hasNoResume ? (
                  <p className="mt-1 text-sm text-muted-foreground">No resume provided</p>
                ) : isPdfUpload ? (
                  <div className="mt-2">
                    <p className="text-sm text-muted-foreground">
                      PDF uploaded — tap the file name to preview your document.
                    </p>
                    <Dialog>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          className="mt-3 inline-flex max-w-full items-center gap-2 rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-muted"
                        >
                          <FileText className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="truncate">{uploadedFileName}</span>
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
                        <DialogHeader className="border-b px-4 py-3 text-left">
                          <DialogTitle className="truncate pr-8">{uploadedFileName}</DialogTitle>
                          <DialogDescription>Quick preview of your uploaded resume PDF.</DialogDescription>
                        </DialogHeader>
                        <iframe
                          src={pdfPreviewUrl ?? undefined}
                          title={uploadedFileName ?? "Resume preview"}
                          className="h-[min(75vh,720px)] w-full bg-muted/20"
                        />
                      </DialogContent>
                    </Dialog>
                  </div>
                ) : (
                  <div className="mt-2">
                    <p className="text-sm text-muted-foreground">Resume text</p>
                    {isTextResume ? (
                      <ScrollArea className="mt-3 max-h-48 rounded-md border bg-muted/30">
                        <pre className="whitespace-pre-wrap p-3 font-sans text-sm leading-relaxed text-foreground">
                          {pendingResumeText}
                        </pre>
                      </ScrollArea>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">Resume provided</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={handleBackToEdit}>
                  Back to edit
                </Button>
                <Button
                  type="button"
                  className="flex-1 gradient-primary text-white"
                  onClick={handleConfirmProceed}
                >
                  Confirm and continue
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatedBackground>
    );
  }

  return (
    <AnimatedBackground className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.33, 1, 0.68, 1] }}
        className="w-full max-w-2xl"
      >
      <ol
        className="mb-6 flex items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground sm:text-xs"
        aria-label="Setup steps"
      >
        <li className="flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-primary-foreground transition-colors duration-500 ease-out sm:px-3">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground/20 text-[11px] font-semibold text-primary-foreground transition-colors duration-500 ease-out">
            1
          </span>
          <span className="hidden sm:inline">Profile</span>
        </li>
        <li aria-hidden className="h-px w-6 bg-border sm:w-10" />
        <li
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors duration-500 ease-out sm:px-3 ${
            isCandidateProfileComplete
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-muted-foreground"
          }`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-500 ease-out ${
              isCandidateProfileComplete
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            2
          </span>
          <span className="hidden sm:inline">Resume</span>
        </li>
        <li aria-hidden className="h-px w-6 bg-border sm:w-10" />
        <li className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 opacity-70 sm:px-3">
          <span className="font-semibold">3</span>
          <span className="hidden sm:inline">Interview</span>
        </li>
      </ol>
      <Card className="overflow-hidden border border-border/80 bg-card shadow-xl">
        <CardHeader>
          <motion.div 
            className="mb-3 flex items-start justify-between"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.12, ease: [0.33, 1, 0.68, 1] }}
          >
            {onBack && (
              <Button
                type="button"
                onClick={onBack}
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isUploading}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            <div className="flex-1" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2 }}
            className="space-y-2"
          >
            <CardTitle className="text-2xl tracking-tight sm:text-3xl">Tailor the interview to you</CardTitle>
            <CardDescription className="text-base leading-relaxed">
              Add your name and academic context, then upload a PDF or paste text. We use this to steer
              questions and scoring—never to replace your own voice in the room.
            </CardDescription>
          </motion.div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Candidate Information Fields */}
          <motion.div 
            className="space-y-4"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.25, ease: [0.33, 1, 0.68, 1] }}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  value={candidateFirstName}
                  onChange={(e) => setCandidateFirstName(e.target.value)}
                  disabled={isUploading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="major">Major/Field *</Label>
                <Input
                  id="major"
                  placeholder="Computer Science"
                  value={candidateMajor}
                  onChange={(e) => setCandidateMajor(e.target.value)}
                  disabled={isUploading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Academic Level *</Label>
                <Select
                  value={candidateYear}
                  onValueChange={setCandidateYear}
                  disabled={isUploading}
                >
                  <SelectTrigger id="year">
                    <SelectValue placeholder="Select your level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Freshman">Freshman</SelectItem>
                    <SelectItem value="Sophomore">Sophomore</SelectItem>
                    <SelectItem value="Junior">Junior</SelectItem>
                    <SelectItem value="Senior">Senior</SelectItem>
                    <SelectItem value="High School">High School</SelectItem>
                    <SelectItem value="Post Grad">Post Grad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>

          {/* File Upload Section */}
          <motion.div 
            className="space-y-4"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.25, ease: [0.33, 1, 0.68, 1] }}
          >
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={!isCandidateProfileComplete || isUploading}
                className="hidden"
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || !isCandidateProfileComplete}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Upload className={`w-4 h-4 transition-colors ${isCandidateProfileComplete ? "text-primary" : "text-muted-foreground"}`} />
                {isUploading ? "Uploading..." : "Upload PDF"}
              </Button>
              {uploadedFileName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="truncate max-w-xs">{uploadedFileName}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clearUploadedPdf();
                      setResumeText("");
                      setResumeSessionId(null);
                      setResumeSummary(undefined);
                      setResumeHighlights(undefined);
                      setResumeSkills(undefined);
                      setResumeWarning(null);
                      lastUploadedTextRef.current = "";
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            {/* Text Paste Section */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Paste Resume Text</label>
              <Textarea
                placeholder={
                  isCandidateProfileComplete
                    ? "Paste your resume text here... (e.g., skills, experience, education)"
                    : "Enter your first name, major/field, and academic level before adding resume text."
                }
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                className="min-h-[200px] resize-none"
                disabled={isUploading || !isCandidateProfileComplete}
              />
              <Button
                type="button"
                onClick={handleTextPaste}
                disabled={isUploading || !resumeText.trim() || !isCandidateProfileComplete}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <FileText className="w-4 h-4 mr-2" />
                Save Text
              </Button>
            </div>
          </motion.div>

          {/* No-resume warning */}
          {noResumeWarning && !resumeText.trim() && (
            <motion.div
              className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800">No resume added</p>
                <p className="text-sm text-amber-700">{noResumeWarning}</p>
                <p className="text-xs text-amber-600">
                  You can still continue without one—click Continue again to proceed.
                </p>
              </div>
            </motion.div>
          )}

          {/* Resume Content Warning */}
          {resumeWarning && (
            <motion.div
              className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800">This may not be a resume</p>
                <p className="text-sm text-amber-700">{resumeWarning}</p>
                <p className="text-xs text-amber-600">You can still continue if this is the correct file.</p>
              </div>
            </motion.div>
          )}

          {/* Resume Preview */}
          {resumeText && (
            <motion.div 
              className="p-4 bg-muted rounded-lg space-y-2"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45 }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Resume Preview</span>
                <span className="text-xs text-muted-foreground">
                  {resumeText.length} characters
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {resumeText}
              </p>
            </motion.div>
          )}

          {/* Action Buttons */}
          <motion.div 
            className="flex gap-3 pt-4"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.35, ease: [0.33, 1, 0.68, 1] }}
          >
            {!noResumeWarning || resumeText.trim() ? (
              <Button
                type="button"
                onClick={handleSkip}
                variant="outline"
                className="flex-1"
                disabled={isUploading || !isCandidateProfileComplete}
              >
                Skip
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={handleContinue}
              disabled={isUploading || !isCandidateProfileComplete}
              className="flex-1 gradient-primary text-white"
            >
              {noResumeWarning && !resumeText.trim()
                ? "Continue without resume"
                : resumeText.trim()
                  ? "Continue with Resume"
                  : "Continue"}
            </Button>
          </motion.div>
        </CardContent>
      </Card>
      </motion.div>
    </AnimatedBackground>
  );
}

export default memo(ResumeUpload);