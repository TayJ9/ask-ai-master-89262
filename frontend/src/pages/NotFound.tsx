import { useLocation } from "wouter";
import { useEffect } from "react";
import AnimatedBackground from "@/components/ui/AnimatedBackground";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const [location] = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location);
  }, [location]);

  return (
    <AnimatedBackground className="flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <p className="text-xl text-muted-foreground">Oops! Page not found</p>
        <Button asChild>
          <a href="/">Return to Home</a>
        </Button>
      </div>
    </AnimatedBackground>
  );
};

export default NotFound;
