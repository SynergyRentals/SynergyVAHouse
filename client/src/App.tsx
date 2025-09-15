import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/app-layout";
import Dashboard from "@/pages/dashboard";
import Tasks from "@/pages/tasks";
import Projects from "@/pages/projects";
import Playbooks from "@/pages/playbooks";
import Analytics from "@/pages/analytics";
import Kanban from "@/pages/kanban";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";
import { WebSocketProvider } from "@/hooks/use-websocket";

function LoginRedirect() {
  // Redirect to backend login endpoint
  window.location.href = '/api/login';
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <AppLayout><Dashboard /></AppLayout>} />
      <Route path="/dashboard" component={() => <AppLayout><Dashboard /></AppLayout>} />
      <Route path="/login" component={LoginRedirect} />
      <Route path="/oidc_login" component={LoginRedirect} />
      <Route path="/tasks" component={() => <AppLayout><Tasks /></AppLayout>} />
      <Route path="/projects" component={() => <AppLayout><Projects /></AppLayout>} />
      <Route path="/kanban" component={() => <AppLayout><Kanban /></AppLayout>} />
      <Route path="/playbooks" component={() => <AppLayout><Playbooks /></AppLayout>} />
      <Route path="/analytics" component={() => <AppLayout><Analytics /></AppLayout>} />
      <Route path="/settings" component={() => <AppLayout><Settings /></AppLayout>} />
      <Route component={() => <AppLayout><NotFound /></AppLayout>} />
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
