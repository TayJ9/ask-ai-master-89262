import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import Auth from "@/components/Auth";
import RoleSelection from "@/components/RoleSelection";
import InterviewSession from "@/components/InterviewSession";
import SessionHistory from "@/components/SessionHistory";
import { Button } from "@/components/ui/button";
import { LogOut, History } from "lucide-react";

export default function Index() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [currentView, setCurrentView] = useState<"roles" | "interview" | "history">("roles");
  const [selectedRole, setSelectedRole] = useState<string>("");

  useEffect(() => {
    // Listen for auth changes FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    // THEN check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentView("roles");
    setSelectedRole("");
  };

  const handleSelectRole = (role: string) => {
    setSelectedRole(role);
    setCurrentView("interview");
  };

  const handleCompleteInterview = () => {
    setCurrentView("roles");
    setSelectedRole("");
  };

  if (!user) {
    return <Auth />;
  }

  return (
    <>
      {currentView !== "interview" && (
        <div className="fixed top-4 right-4 flex gap-2 z-50">
          {currentView === "roles" && (
            <Button
              onClick={() => setCurrentView("history")}
              variant="outline"
              className="gap-2 bg-card shadow-md"
            >
              <History className="w-4 h-4" />
              History
            </Button>
          )}
          <Button
            onClick={handleSignOut}
            variant="outline"
            className="gap-2 bg-card shadow-md"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      )}

      {currentView === "roles" && <RoleSelection onSelectRole={handleSelectRole} />}
      
      {currentView === "interview" && (
        <InterviewSession
          role={selectedRole}
          userId={user.id}
          onComplete={handleCompleteInterview}
        />
      )}
      
      {currentView === "history" && (
        <SessionHistory userId={user.id} onBack={() => setCurrentView("roles")} />
      )}
    </>
  );
}
