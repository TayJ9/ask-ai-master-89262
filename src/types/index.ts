// Core application types
export interface User {
  id: string;
  email: string;
  full_name?: string;
  created_at: string;
}

export interface InterviewSession {
  id: string;
  user_id: string;
  role: InterviewRole;
  status: SessionStatus;
  started_at: string | null;
  completed_at: string | null;
  overall_score: number | null;
  feedback_summary: string | null;
}

export interface InterviewQuestion {
  id: string;
  role: InterviewRole;
  category: string;
  difficulty: QuestionDifficulty;
  question_text: string;
  order_index: number;
  created_at: string | null;
}

export interface InterviewResponse {
  id: string;
  session_id: string;
  question_id: string;
  transcript: string;
  score: number | null;
  strengths: string[] | null;
  improvements: string[] | null;
  audio_duration_seconds: number | null;
  created_at: string | null;
}

// Enums
export type InterviewRole = 'software-engineer' | 'product-manager' | 'marketing';
export type SessionStatus = 'in_progress' | 'completed' | 'cancelled';
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

// API Response types
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export interface AnalysisResponse {
  score: number;
  strengths: string[];
  improvements: string[];
}

export interface SpeechToTextResponse {
  text: string;
}

export interface TextToSpeechResponse {
  audioContent: string;
}

// Component Props
export interface AuthFormData {
  email: string;
  password: string;
  fullName?: string;
}

export interface InterviewSessionProps {
  role: InterviewRole;
  userId: string;
  onComplete: () => void;
}

export interface RoleSelectionProps {
  onSelectRole: (role: InterviewRole) => void;
}

export interface SessionHistoryProps {
  userId: string;
  onBack: () => void;
}

// Error types
export interface AppError {
  code: string;
  message: string;
  details?: any;
}

export interface ValidationError {
  field: string;
  message: string;
}

// Utility types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// State management types
export interface AppState {
  user: User | null;
  session: InterviewSession | null;
  currentView: 'auth' | 'roles' | 'interview' | 'history';
  selectedRole: InterviewRole | '';
  loading: boolean;
  error: AppError | null;
}

// Hook return types
export interface UseErrorHandlerReturn {
  handleError: (error: unknown, options?: ErrorHandlerOptions) => string;
}

export interface ErrorHandlerOptions {
  showToast?: boolean;
  logError?: boolean;
  fallbackMessage?: string;
}

// Form validation types
export interface FormFieldError {
  field: string;
  message: string;
}

export interface FormState<T> {
  data: T;
  errors: FormFieldError[];
  isValid: boolean;
  isSubmitting: boolean;
}

// Audio/Media types
export interface AudioRecording {
  blob: Blob;
  duration: number;
  mimeType: string;
}

export interface MediaConstraints {
  audio: boolean;
  video: boolean;
}

// Performance monitoring types
export interface PerformanceMetrics {
  componentRenderTime: number;
  apiResponseTime: number;
  memoryUsage: number;
}

// Security types
export interface SecurityHeaders {
  'X-Content-Type-Options': string;
  'X-Frame-Options': string;
  'X-XSS-Protection': string;
  'Strict-Transport-Security': string;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (req: Request) => string;
}
