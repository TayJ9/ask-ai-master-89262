-- Block anonymous access to profiles table
CREATE POLICY "Block anonymous access to profiles" 
ON public.profiles 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Block anonymous access to interview_responses table
CREATE POLICY "Block anonymous access to interview_responses" 
ON public.interview_responses 
FOR SELECT 
USING (auth.role() = 'authenticated');