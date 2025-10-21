-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Create profiles on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create interview questions bank
CREATE TABLE public.interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  question_text TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.interview_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view questions"
  ON public.interview_questions FOR SELECT
  USING (true);

-- Create interview sessions
CREATE TABLE public.interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  overall_score INTEGER,
  feedback_summary TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON public.interview_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sessions"
  ON public.interview_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON public.interview_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Create interview responses
CREATE TABLE public.interview_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.interview_questions(id) ON DELETE CASCADE,
  transcript TEXT NOT NULL,
  audio_duration_seconds INTEGER,
  score INTEGER CHECK (score >= 0 AND score <= 100),
  strengths TEXT[],
  improvements TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.interview_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own responses"
  ON public.interview_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.interview_sessions
      WHERE interview_sessions.id = interview_responses.session_id
      AND interview_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own responses"
  ON public.interview_responses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.interview_sessions
      WHERE interview_sessions.id = interview_responses.session_id
      AND interview_sessions.user_id = auth.uid()
    )
  );

-- Insert sample questions for different roles
INSERT INTO public.interview_questions (role, question_text, category, difficulty, order_index) VALUES
('software-engineer', 'Tell me about yourself and your background in software engineering.', 'introduction', 'easy', 1),
('software-engineer', 'Describe a challenging technical problem you solved recently.', 'technical', 'medium', 2),
('software-engineer', 'How do you approach code reviews and collaboration with team members?', 'teamwork', 'medium', 3),
('software-engineer', 'What is your experience with testing and quality assurance?', 'technical', 'medium', 4),
('software-engineer', 'Where do you see yourself in your career in the next 3-5 years?', 'career', 'easy', 5),

('product-manager', 'Tell me about yourself and your experience in product management.', 'introduction', 'easy', 1),
('product-manager', 'How do you prioritize features when you have limited resources?', 'strategy', 'hard', 2),
('product-manager', 'Describe a time when you had to make a difficult product decision.', 'decision-making', 'medium', 3),
('product-manager', 'How do you work with engineering and design teams?', 'teamwork', 'medium', 4),
('product-manager', 'What metrics do you use to measure product success?', 'analytics', 'medium', 5),

('marketing', 'Tell me about yourself and your marketing experience.', 'introduction', 'easy', 1),
('marketing', 'Describe a successful marketing campaign you led.', 'experience', 'medium', 2),
('marketing', 'How do you measure the ROI of your marketing initiatives?', 'analytics', 'medium', 3),
('marketing', 'How do you stay current with marketing trends and technologies?', 'learning', 'easy', 4),
('marketing', 'Describe your approach to brand positioning and messaging.', 'strategy', 'hard', 5);