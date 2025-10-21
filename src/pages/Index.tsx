import { useState, useEffect } from "react";
import Auth from "@/components/Auth";
import RoleSelection from "@/components/RoleSelection";
import InterviewSession from "@/components/InterviewSession";
import SessionHistory from "@/components/SessionHistory";
import { Button } from "@/components/ui/button";
import { LogOut, History } from "lucide-react";

export default function Index() {
  const [user, setUser] = useState<any>(null);
  const [currentView, setCurrentView] = useState<"roles" | "interview" | "history">("roles");
  const [selectedRole, setSelectedRole] = useState<string>("");

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleAuthSuccess = (userData: any, token: string) => {
    setUser(userData);
  };

  const handleSignOut = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    setUser(null);
    setCurrentView("roles");
    setSelectedRole("");
  };

  const handleSelectRole = (role: string) => {
    console.log('=== HANDLE SELECT ROLE CALLED ===');
    console.log('Role:', role);
    console.log('User ID:', user?.id);
    setSelectedRole(role);
    setCurrentView("interview");
    console.log('View changed to interview, role set to:', role);
  };

  const handleCompleteInterview = () => {
    setCurrentView("roles");
    setSelectedRole("");
  };

  if (!user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
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
              data-testid="button-view-history"
            >
              <History className="w-4 h-4" />
              History
            </Button>
          )}
          <Button
            onClick={handleSignOut}
            variant="outline"
            className="gap-2 bg-card shadow-md"
            data-testid="button-signout"
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
