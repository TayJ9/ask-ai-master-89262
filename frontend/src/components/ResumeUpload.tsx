import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, X, CheckCircle2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiPostFormData, apiPost, ApiError } from "@/lib/api";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import { motion } from "framer-motion";

interface ResumeUploadProps {
  onResumeUploaded: (resumeText: string, candidateInfo?: { firstName: string; major: string; year: string; sessionId?: string; resumeSource?: string }) => void;
  onSkip: () => void;
  onBack?: () => void;
}

export default function ResumeUpload({ onResumeUploaded, onSkip, onBack }: ResumeUploadProps) {
  const [resumeText, setResumeText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [candidateFirstName, setCandidateFirstName] = useState("");
  const [candidateMajor, setCandidateMajor] = useState("");
  const [candidateYear, setCandidateYear] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Log file details before upload for debugging
    console.log('Uploading file:', {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toISOString()
    });

    // Client-side file type validation
    if (file.type !== "application/pdf") {
      console.error('[ResumeUpload] Invalid file type:', file.type);
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
      console.error('[ResumeUpload] File too large:', {
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
      console.warn('[ResumeUpload] File extension mismatch:', file.name);
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
      console.error('[ResumeUpload] No auth token found in localStorage');
      console.error('[ResumeUpload] localStorage keys:', Object.keys(localStorage));
      toast({
        title: "Authentication Required",
        description: "Please sign in again to upload your resume.",
        variant: "destructive",
      });
      return;
    }

    // Log token info for debugging (masked)
    const tokenPreview = token.length > 20 ? `${token.substring(0, 20)}...` : token;
    console.log('[ResumeUpload] Token check before upload:', {
      exists: true,
      length: token.length,
      preview: tokenPreview,
      trimmed: token.trim() === token
    });

    setIsUploading(true);
    setUploadedFileName(file.name);

    try {
      // Log FormData contents before sending (file details only, not file content)
      console.log('[ResumeUpload] Preparing FormData:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        candidateName: candidateFirstName.trim(),
        major: candidateMajor.trim(),
        year: candidateYear.trim()
      });

      const formData = new FormData();
      formData.append("resume", file);
      // Backend expects "name", send first name there for compatibility
      formData.append("name", candidateFirstName.trim());
      formData.append("major", candidateMajor.trim());
      formData.append("year", candidateYear.trim());

      // Log headers being sent (masking token)
      const tokenForLog = localStorage.getItem('auth_token');
      const maskedToken = tokenForLog 
        ? `${tokenForLog.substring(0, 10)}...${tokenForLog.substring(tokenForLog.length - 4)}`
        : 'MISSING';
      console.log('[ResumeUpload] Sending upload request to /api/upload-resume with headers:', {
        hasAuthorization: !!tokenForLog,
        authorizationPreview: tokenForLog ? `Bearer ${maskedToken}` : 'none',
        contentType: 'multipart/form-data (set by browser)'
      });
      
      console.log('[ResumeUpload] Sending upload request to /api/upload-resume');
      const data = await apiPostFormData('/api/upload-resume', formData);
      console.log('[ResumeUpload] Upload successful:', {
        sessionId: data.sessionId,
        hasResumeText: !!data.resumeText,
        resumeTextLength: data.resumeText?.length || 0
      });
      
      // Store sessionId and candidate info
      const candidateInfo = {
        firstName: candidateFirstName.trim(),
        major: candidateMajor.trim(),
        year: candidateYear.trim(),
        sessionId: data.sessionId,
        resumeSource: "pdf_upload"
      };
      
      // Extract resume text from parsed data if available
      const extractedResumeText = data.resumeText || resumeText || 
        `First Name: ${candidateFirstName}\nMajor: ${candidateMajor}\nYear: ${candidateYear}`;
      
      setResumeText(extractedResumeText);
      
      toast({
        title: "Resume uploaded successfully",
        description: `Session ID: ${data.sessionId}`,
      });
      
      // Call callback with resume text and candidate info
      onResumeUploaded(extractedResumeText, candidateInfo);
    } catch (error: any) {
      // Enhanced error logging
      console.error('[ResumeUpload] Upload failed:', {
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
      setUploadedFileName(null);
      
      // Reset file input on error
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Generate UUID v4 for session IDs
  const generateSessionId = (): string => {
    // Use crypto.randomUUID() if available (modern browsers), otherwise fallback
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
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

    setIsUploading(true);

    try {
      const data = await apiPost('/api/resume/upload', { text: resumeText });
      setResumeText(data.resumeText || resumeText);
      
      toast({
        title: "Resume saved",
        description: "Your resume text has been saved.",
      });
    } catch (error: any) {
      const errorMessage = error instanceof ApiError 
        ? error.message 
        : (error.message || "Failed to save resume text.");
      
      toast({
        title: "Failed to save",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleContinue = () => {
    if (!candidateFirstName.trim() || !candidateMajor.trim() || !candidateYear.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in your first name, major, and year.",
        variant: "destructive",
      });
      return;
    }

    if (resumeText.trim()) {
      // Generate sessionId for text-only uploads (when no file was uploaded)
      const sessionId = generateSessionId();
      
      const candidateInfo = {
        firstName: candidateFirstName.trim(),
        major: candidateMajor.trim(),
        year: candidateYear.trim(),
        sessionId: sessionId,
        resumeSource: "text_resume"
      };
      onResumeUploaded(resumeText, candidateInfo);
    } else {
      toast({
        title: "No resume",
        description: "Please upload a resume or paste your resume text before continuing.",
        variant: "destructive",
      });
    }
  };

  return (
    <AnimatedBackground className="p-6 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-2xl w-full"
      >
      <Card className="shadow-xl">
        <CardHeader>
          <motion.div 
            className="flex items-start justify-between mb-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            {onBack && (
              <Button
                onClick={onBack}
                variant="outline"
                size="sm"
                className="gap-2"
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
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <CardTitle className="text-3xl">Upload Your Resume</CardTitle>
            <CardDescription className="text-base">
              Upload your resume and provide your information to help personalize your interview.
            </CardDescription>
          </motion.div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Candidate Information Fields */}
          <motion.div 
            className="space-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || !candidateFirstName.trim() || !candidateMajor.trim() || !candidateYear.trim()}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {isUploading ? "Uploading..." : "Upload PDF"}
              </Button>
              {uploadedFileName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="truncate max-w-xs">{uploadedFileName}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUploadedFileName(null);
                      setResumeText("");
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
                placeholder="Paste your resume text here... (e.g., skills, experience, education)"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                className="min-h-[200px] resize-none"
                disabled={isUploading}
              />
              <Button
                onClick={handleTextPaste}
                disabled={isUploading || !resumeText.trim() || !candidateFirstName.trim() || !candidateMajor.trim() || !candidateYear.trim()}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <FileText className="w-4 h-4 mr-2" />
                Save Text
              </Button>
            </div>
          </motion.div>

          {/* Resume Preview */}
          {resumeText && (
            <motion.div 
              className="p-4 bg-muted rounded-lg space-y-2"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            <Button
              onClick={onSkip}
              variant="outline"
              className="flex-1"
            >
              Skip
            </Button>
            <Button
              onClick={handleContinue}
              disabled={!resumeText.trim() || isUploading || !candidateFirstName.trim() || !candidateMajor.trim() || !candidateYear.trim()}
              className="flex-1 gradient-primary text-white"
            >
              Continue with Resume
            </Button>
          </motion.div>
        </CardContent>
      </Card>
      </motion.div>
    </AnimatedBackground>
  );
}

