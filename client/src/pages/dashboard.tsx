import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import { 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  Bell,
  Home,
  ListTodo,
  FolderKanban,
  BookOpen,
  BarChart3,
  KanbanSquare
} from "lucide-react";
import { SLAMonitor } from "@/components/sla-monitor";
import { TeamStatus } from "@/components/team-status";
import { ActivityFeed } from "@/components/activity-feed";
import { TaskModal } from "@/components/task-modal";

interface DashboardStats {
  todayStats: { total: number };
  overdueStats: { total: number };
  completedStats: { total: number };
  blockedStats: { total: number };
  slaBreachStats: { total: number };
}

interface Task {
  id: string;
  title: string;
  category: string;
  status: string;
  priority: number;
  dueAt?: string;
  slaAt?: string;
  assignee?: {
    id: string;
    name: string;
    slackId: string;
  };
}

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<'va' | 'manager'>('va');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/tasks/stats'],
  });

  const { data: todayTasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ['/api/tasks', { dueToday: 'true' }],
  });

  const { data: overdueTasks } = useQuery<Task[]>({
    queryKey: ['/api/tasks', { overdue: 'true' }],
  });

  const { data: slaBreachTasks } = useQuery<Task[]>({
    queryKey: ['/api/tasks', { slaBreached: 'true' }],
  });

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'OPEN': return '🔵';
      case 'IN_PROGRESS': return '🟡';
      case 'WAITING': return '🟠';
      case 'BLOCKED': return '🔴';
      case 'DONE': return '✅';
      default: return '⚪';
    }
  };

  const getSLAStatus = (task: Task) => {
    if (!task.slaAt) return null;
    const now = new Date();
    const slaTime = new Date(task.slaAt);
    
    if (slaTime < now) return { type: 'breach', text: '🚨 BREACHED', class: 'text-destructive' };
    
    const minutesRemaining = Math.floor((slaTime.getTime() - now.getTime()) / (1000 * 60));
    if (minutesRemaining <= 5) return { type: 'warning', text: '⚠️ Warning', class: 'text-yellow-600' };
    
    return { type: 'ok', text: '✅ On track', class: 'text-green-600' };
  };

  if (statsLoading || tasksLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-64 bg-sidebar border-r border-sidebar-border flex-shrink-0">
        <div className="p-6">
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
                <span className="text-sidebar-primary-foreground text-sm font-medium">J</span>
              </div>
              <div>
                <div className="text-sidebar-foreground font-medium text-sm">@Jorel</div>
                <div className="text-sidebar-foreground/60 text-xs">Lead EA & Data</div>
                <div className="text-sidebar-foreground/60 text-xs">Manila: {new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-2">
            <Link href="/">
              <a className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                <Home className="w-5 h-5" />
                <span className="font-medium">Dashboard</span>
              </a>
            </Link>
            <Link href="/tasks">
              <a className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                <ListTodo className="w-5 h-5" />
                <span>Tasks</span>
              </a>
            </Link>
            <Link href="/projects">
              <a className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                <FolderKanban className="w-5 h-5" />
                <span>Projects</span>
              </a>
            </Link>
            <Link href="/kanban">
              <a className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                <KanbanSquare className="w-5 h-5" />
                <span>Kanban</span>
              </a>
            </Link>
            <Link href="/playbooks">
              <a className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                <BookOpen className="w-5 h-5" />
                <span>Playbooks</span>
              </a>
            </Link>
            <Link href="/analytics">
              <a className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                <BarChart3 className="w-5 h-5" />
                <span>Analytics</span>
              </a>
            </Link>
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
        <header className="border-b border-border bg-card">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h2 className="text-xl font-semibold text-card-foreground">Dashboard</h2>
                <div className="flex space-x-1 bg-muted rounded-lg p-1">
                  <button 
                    onClick={() => setViewMode('va')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      viewMode === 'va' 
                        ? 'bg-background text-foreground' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    data-testid="button-va-view"
                  >
                    VA View
                  </button>
                  <button 
                    onClick={() => setViewMode('manager')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      viewMode === 'manager' 
                        ? 'bg-background text-foreground' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    data-testid="button-manager-view"
                  >
                    Manager View
                  </button>
                </div>
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
                  {(stats?.slaBreachStats.total || 0) > 0 && (
                    <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {stats?.slaBreachStats.total}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 overflow-auto p-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <Card data-testid="card-today-tasks">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Today's Tasks</p>
                    <p className="text-2xl font-bold text-card-foreground">{stats?.todayStats.total || 0}</p>
                  </div>
                  <div className="w-10 h-10 bg-chart-1/10 rounded-lg flex items-center justify-center">
                    <ListTodo className="w-5 h-5 text-chart-1" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-chart-3 font-medium">+2</span>
                  <span className="text-muted-foreground ml-1">from yesterday</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-overdue-tasks">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Overdue</p>
                    <p className="text-2xl font-bold text-destructive">{stats?.overdueStats.total || 0}</p>
                  </div>
                  <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-destructive" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  {(stats?.overdueStats.total || 0) > 0 ? (
                    <span className="text-destructive font-medium">SLA breach alert sent</span>
                  ) : (
                    <span className="text-muted-foreground">All tasks on track</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-completed-tasks">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Completed (24h)</p>
                    <p className="text-2xl font-bold text-chart-3">{stats?.completedStats.total || 0}</p>
                  </div>
                  <div className="w-10 h-10 bg-chart-3/10 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-chart-3" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-chart-3 font-medium">96%</span>
                  <span className="text-muted-foreground ml-1">SLA compliance</span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-blocked-tasks">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Blocked</p>
                    <p className="text-2xl font-bold text-chart-4">{stats?.blockedStats.total || 0}</p>
                  </div>
                  <div className="w-10 h-10 bg-chart-4/10 rounded-lg flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-chart-4" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-muted-foreground">Waiting for</span>
                  <span className="text-chart-4 font-medium ml-1">@Dan approval</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Today's Tasks */}
            <div className="lg:col-span-2 space-y-6">
              {/* Today's Tasks Section */}
              <Card data-testid="card-today-tasks-list">
                <CardHeader className="border-b border-border">
                  <div className="flex items-center justify-between">
                    <CardTitle>Today's Tasks</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      data-testid="button-new-task"
                      onClick={() => setIsCreatingTask(true)}
                    >
                      + New Task
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {todayTasks && todayTasks.length > 0 ? (
                    todayTasks.map((task) => {
                      const slaStatus = getSLAStatus(task);
                      const isBreached = slaStatus?.type === 'breach';
                      
                      return (
                        <div 
                          key={task.id}
                          className={`flex items-center space-x-4 p-4 rounded-lg border hover:bg-muted transition-colors cursor-pointer ${
                            isBreached ? 'bg-destructive/10 border-destructive/20' : 'bg-muted/50 border-border'
                          }`}
                          onClick={() => setSelectedTask(task)}
                          data-testid={`task-item-${task.id}`}
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            <span>{getStatusEmoji(task.status)}</span>
                            <div className="flex-1">
                              <h4 className="font-medium text-card-foreground">{task.title}</h4>
                              <div className="flex items-center space-x-4 mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {task.category}
                                </Badge>
                                {slaStatus && (
                                  <span className={`text-xs ${slaStatus.class}`}>
                                    SLA: {slaStatus.text}
                                  </span>
                                )}
                                {task.assignee && (
                                  <span className="text-xs text-muted-foreground">
                                    Assigned to {task.assignee.name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className={`w-4 h-4 rounded-sm ${
                              isBreached ? 'bg-destructive animate-pulse' :
                              slaStatus?.type === 'warning' ? 'bg-yellow-500' : 'bg-chart-3'
                            }`}></div>
                            <button className="text-muted-foreground hover:text-foreground p-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <ListTodo className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No tasks due today</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Next Steps Section */}
              <Card data-testid="card-next-steps">
                <CardHeader className="border-b border-border">
                  <CardTitle>Next 3 Steps</CardTitle>
                  <p className="text-sm text-muted-foreground">Recommended actions based on your workload</p>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {slaBreachTasks && slaBreachTasks.length > 0 ? (
                    <div className="flex items-start space-x-4">
                      <div className="w-6 h-6 bg-destructive rounded-full flex items-center justify-center text-destructive-foreground text-sm font-medium">1</div>
                      <div>
                        <h4 className="font-medium text-card-foreground">Address SLA Breaches</h4>
                        <p className="text-sm text-muted-foreground">Complete {slaBreachTasks.length} overdue task(s) to restore SLA compliance</p>
                        <Button variant="link" className="text-destructive p-0 h-auto mt-2" data-testid="button-address-breaches">
                          Take Action →
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start space-x-4">
                        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">1</div>
                        <div>
                          <h4 className="font-medium text-card-foreground">Review daily checklist progress</h4>
                          <p className="text-sm text-muted-foreground">Complete remaining items for today's operational checklist</p>
                          <Button variant="link" className="text-primary p-0 h-auto mt-2" data-testid="button-view-checklist">
                            View Checklist →
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-start space-x-4">
                        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">2</div>
                        <div>
                          <h4 className="font-medium text-card-foreground">Check for new escalations</h4>
                          <p className="text-sm text-muted-foreground">Monitor #triage channel for any new issues requiring attention</p>
                          <Button variant="link" className="text-primary p-0 h-auto mt-2" data-testid="button-check-triage">
                            Monitor Triage →
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-start space-x-4">
                        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">3</div>
                        <div>
                          <h4 className="font-medium text-card-foreground">Update project status</h4>
                          <p className="text-sm text-muted-foreground">Ensure all project tasks have current status and progress notes</p>
                          <Button variant="link" className="text-primary p-0 h-auto mt-2" data-testid="button-update-projects">
                            View Projects →
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Sidebar */}
            <div className="space-y-6">
              <SLAMonitor />
              <ActivityFeed />
              <TeamStatus />
            </div>
          </div>
        </main>
      </div>

      {/* Task Modal for viewing existing tasks */}
      {selectedTask && (
        <TaskModal 
          task={selectedTask} 
          isOpen={!!selectedTask} 
          onClose={() => setSelectedTask(null)} 
        />
      )}

      {/* Task Modal for creating new tasks */}
      <TaskModal 
        isOpen={isCreatingTask}
        onClose={() => setIsCreatingTask(false)}
      />
    </div>
  );
}
