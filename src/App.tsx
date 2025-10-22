import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Switch>
      <Route path="/" component={Index} />
      <Route component={NotFound} />
    </Switch>
    <Toaster />
  </QueryClientProvider>
);

export default App;
