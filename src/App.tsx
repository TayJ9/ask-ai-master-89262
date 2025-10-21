import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { queryClient } from "@/lib/queryClient";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Switch>
      <Route path="/" component={Index} />
      <Route component={NotFound} />
    </Switch>
  </QueryClientProvider>
);

export default App;
