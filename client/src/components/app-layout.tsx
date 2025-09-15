import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { 
  Bell,
  Home,
  ListTodo,
  FolderKanban,
  BookOpen,
  BarChart3,
  KanbanSquare,
  Settings
} from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  showHeader?: boolean;
  headerActions?: ReactNode;
}

interface NavigationItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  testId?: string;
}

const navigationItems: NavigationItem[] = [
  { href: "/", icon: Home, label: "Dashboard", testId: "nav-dashboard" },
  { href: "/tasks", icon: ListTodo, label: "Tasks", testId: "nav-tasks" },
  { href: "/projects", icon: FolderKanban, label: "Projects", testId: "nav-projects" },
  { href: "/kanban", icon: KanbanSquare, label: "Kanban", testId: "nav-kanban" },
  { href: "/playbooks", icon: BookOpen, label: "Playbooks", testId: "nav-playbooks" },
  { href: "/analytics", icon: BarChart3, label: "Analytics", testId: "nav-analytics" },
  { href: "/settings", icon: Settings, label: "Settings", testId: "nav-settings" },
];

export function AppLayout({ children, title, showHeader = true, headerActions }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Authentication required
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-muted-foreground mb-6">Please log in to access the VA Operations Hub</p>
          <a 
            href="/api/login" 
            className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            data-testid="button-login"
          >
            Log in with Replit
          </a>
        </div>
      </div>
    );
  }

  const isActiveRoute = (href: string) => {
    if (href === "/") {
      return location === "/";
    }
    return location.startsWith(href);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-64 bg-sidebar border-r border-sidebar-border flex-shrink-0">
        <div className="p-6">
          {/* Branding */}
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">S</span>
            </div>
            <div>
              <h1 className="text-sidebar-foreground font-semibold text-lg">Synergy VA Ops</h1>
              <p className="text-sidebar-foreground/60 text-sm">Operations Hub</p>
            </div>
          </div>

          {/* User Profile */}
          <div className="mb-6 p-4 bg-sidebar-accent rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-sidebar-primary rounded-full flex items-center justify-center">
                <span className="text-sidebar-primary-foreground text-sm font-medium">
                  {user?.name?.charAt(0) || user?.firstName?.charAt(0) || 'U'}
                </span>
              </div>
              <div>
                <div className="text-sidebar-foreground font-medium text-sm" data-testid="text-username">
                  {user?.name || `${user?.firstName} ${user?.lastName}` || 'User'}
                </div>
                <div className="text-sidebar-foreground/60 text-xs" data-testid="text-user-role">
                  {user?.role || 'Team Member'} {user?.department && `• ${user?.department}`}
                </div>
                <div className="text-sidebar-foreground/60 text-xs">
                  Manila: {new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-sidebar-border">
              <a 
                href="/api/logout" 
                className="text-xs text-sidebar-foreground/80 hover:text-sidebar-foreground transition-colors"
                data-testid="link-logout"
              >
                Log out
              </a>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = isActiveRoute(item.href);
              
              return (
                <Link 
                  key={item.href}
                  href={item.href} 
                  className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive 
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground' 
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                  data-testid={item.testId}
                >
                  <Icon className="w-5 h-5" />
                  <span className={isActive ? 'font-medium' : ''}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Quick Actions */}
          <div className="mt-8 pt-6 border-t border-sidebar-border">
            <h3 className="text-sidebar-foreground/60 text-xs uppercase tracking-wide font-medium mb-3">Quick Actions</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-sidebar-foreground/80">/task</span>
                <span className="text-sidebar-foreground/60">New task</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sidebar-foreground/80">/done</span>
                <span className="text-sidebar-foreground/60">Complete</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sidebar-foreground/80">/brief</span>
                <span className="text-sidebar-foreground/60">Status</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sidebar-foreground/80">/handoff</span>
                <span className="text-sidebar-foreground/60">Transfer</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        {showHeader && (
          <header className="border-b border-border bg-card">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {title && <h2 className="text-xl font-semibold text-card-foreground">{title}</h2>}
                </div>
                <div className="flex items-center space-x-4">
                  {/* SLA Indicator */}
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-chart-3 rounded-full animate-pulse"></div>
                    <span className="text-sm text-muted-foreground">SLA Monitor Active</span>
                  </div>
                  {/* Notification Bell */}
                  <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors" data-testid="button-notifications">
                    <Bell className="w-5 h-5" />
                  </button>
                  {/* Header Actions */}
                  {headerActions}
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}