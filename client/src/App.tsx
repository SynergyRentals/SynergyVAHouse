import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import Tasks from "@/pages/tasks";
import Projects from "@/pages/projects";
import Playbooks from "@/pages/playbooks";
import Analytics from "@/pages/analytics";
import Kanban from "@/pages/kanban";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";
import { WebSocketProvider } from "@/hooks/use-websocket";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/projects" component={Projects} />
      <Route path="/kanban" component={Kanban} />
      <Route path="/playbooks" component={Playbooks} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </WebSocketProvider>
    </QueryClientProvider>
  );
}

export default App;
