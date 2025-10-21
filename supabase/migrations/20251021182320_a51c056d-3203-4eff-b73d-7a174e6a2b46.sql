-- Add INSERT policy to profiles table to prevent fake profile creation
CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = id);