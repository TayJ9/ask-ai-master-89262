import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, X, CheckCircle2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiPostFormData, apiPost, ApiError } from "@/lib/api";

interface ResumeUploadProps {
  onResumeUploaded: (resumeText: string, candidateInfo?: { name: string; major: string; year: string; sessionId?: string }) => void;
  onSkip: () => void;
  onBack?: () => void;
}

export default function ResumeUpload({ onResumeUploaded, onSkip, onBack }: ResumeUploadProps) {
  const [resumeText, setResumeText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [candidateMajor, setCandidateMajor] = useState("");
  const [candidateYear, setCandidateYear] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      return;
    }

    // Validate candidate info
    if (!candidateName.trim() || !candidateMajor.trim() || !candidateYear.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in your name, major, and year before uploading.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadedFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("resume", file);
      formData.append("name", candidateName.trim());
      formData.append("major", candidateMajor.trim());
      formData.append("year", candidateYear.trim());

      const data = await apiPostFormData('/api/upload-resume', formData);
      
      // Store sessionId and candidate info
      const candidateInfo = {
        name: candidateName.trim(),
        major: candidateMajor.trim(),
        year: candidateYear.trim(),
        sessionId: data.sessionId
      };
      
      // Extract resume text from parsed data if available
      const extractedResumeText = data.resumeText || resumeText || 
        `Name: ${candidateName}\nMajor: ${candidateMajor}\nYear: ${candidateYear}`;
      
      setResumeText(extractedResumeText);
      
      toast({
        title: "Resume uploaded successfully",
        description: `Session ID: ${data.sessionId}`,
      });
      
      // Call callback with resume text and candidate info
      onResumeUploaded(extractedResumeText, candidateInfo);
    } catch (error: any) {
      const errorMessage = error instanceof ApiError 
        ? error.message 
        : (error.message || "Failed to process resume. Please try again.");
      
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
      setUploadedFileName(null);
    } finally {
      setIsUploading(false);
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

    if (!candidateName.trim() || !candidateMajor.trim() || !candidateYear.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in your name, major, and year.",
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
    if (!candidateName.trim() || !candidateMajor.trim() || !candidateYear.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in your name, major, and year.",
        variant: "destructive",
      });
      return;
    }

    if (resumeText.trim()) {
      const candidateInfo = {
        name: candidateName.trim(),
        major: candidateMajor.trim(),
        year: candidateYear.trim()
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
    <div className="min-h-screen p-6 gradient-secondary flex items-center justify-center">
      <Card className="max-w-2xl w-full shadow-xl">
        <CardHeader>
          <div className="flex items-start justify-between mb-2">
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
          </div>
          <CardTitle className="text-3xl">Upload Your Resume</CardTitle>
          <CardDescription className="text-base">
            Upload your resume and provide your information to help personalize your interview.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Candidate Information Fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
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
                <Label htmlFor="year">Academic Year *</Label>
                <Input
                  id="year"
                  placeholder="Junior"
                  value={candidateYear}
                  onChange={(e) => setCandidateYear(e.target.value)}
                  disabled={isUploading}
                />
              </div>
            </div>
          </div>

          {/* File Upload Section */}
          <div className="space-y-4">
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
                disabled={isUploading || !candidateName.trim() || !candidateMajor.trim() || !candidateYear.trim()}
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
                disabled={isUploading || !resumeText.trim() || !candidateName.trim() || !candidateMajor.trim() || !candidateYear.trim()}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <FileText className="w-4 h-4 mr-2" />
                Save Text
              </Button>
            </div>
          </div>

          {/* Resume Preview */}
          {resumeText && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Resume Preview</span>
                <span className="text-xs text-muted-foreground">
                  {resumeText.length} characters
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {resumeText}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={onSkip}
              variant="outline"
              className="flex-1"
            >
              Skip
            </Button>
            <Button
              onClick={handleContinue}
              disabled={!resumeText.trim() || isUploading || !candidateName.trim() || !candidateMajor.trim() || !candidateYear.trim()}
              className="flex-1 gradient-primary text-white"
            >
              Continue with Resume
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

