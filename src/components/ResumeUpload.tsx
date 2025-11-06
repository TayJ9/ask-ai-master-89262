import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, X, CheckCircle2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ResumeUploadProps {
  onResumeUploaded: (resumeText: string) => void;
  onSkip: () => void;
  onBack?: () => void;
}

export default function ResumeUpload({ onResumeUploaded, onSkip, onBack }: ResumeUploadProps) {
  const [resumeText, setResumeText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
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

    setIsUploading(true);
    setUploadedFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/resume/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload resume");
      }

      const data = await response.json();
      setResumeText(data.resumeText);
      
      toast({
        title: "Resume uploaded successfully",
        description: "Your resume has been processed.",
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to process resume. Please try again.",
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

    setIsUploading(true);

    try {
      const data = await apiRequest("/api/resume/upload", "POST", { text: resumeText });
      setResumeText(data.resumeText);
      
      toast({
        title: "Resume saved",
        description: "Your resume text has been saved.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to save",
        description: error.message || "Failed to save resume text.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleContinue = () => {
    if (resumeText.trim()) {
      onResumeUploaded(resumeText);
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
          <CardTitle className="text-3xl">Upload Your Resume (Optional)</CardTitle>
          <CardDescription className="text-base">
            Upload your resume to help the interviewer personalize questions based on your experience. 
            You can upload a PDF file or paste your resume text below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
                disabled={isUploading}
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
                disabled={isUploading || !resumeText.trim()}
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
              disabled={!resumeText.trim() || isUploading}
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

