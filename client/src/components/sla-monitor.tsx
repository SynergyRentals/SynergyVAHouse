import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";

interface Task {
  id: string;
  title: string;
  category: string;
  status: string;
  slaAt?: string;
  assignee?: {
    name: string;
  };
}

export function SLAMonitor() {
  const { data: slaBreachTasks } = useQuery<Task[]>({
    queryKey: ['/api/tasks', { slaBreached: 'true' }],
  });

  const { data: allTasks } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });

  const tasksWithSLA = allTasks?.filter(task => task.slaAt) || [];
  const activeSLATimers = tasksWithSLA.filter(task => 
    task.status !== 'DONE' && 
    task.slaAt && 
    new Date(task.slaAt) > new Date()
  );

  const getSLATimeRemaining = (slaAt: string) => {
    const now = new Date();
    const slaTime = new Date(slaAt);
    const diffMinutes = Math.floor((slaTime.getTime() - now.getTime()) / (1000 * 60));
    return Math.max(0, diffMinutes);
  };

  const getSLAProgress = (slaAt: string) => {
    const minutesRemaining = getSLATimeRemaining(slaAt);
    if (minutesRemaining >= 10) return 100;
    return (minutesRemaining / 10) * 100;
  };

  const slaComplianceRate = tasksWithSLA.length > 0 
    ? Math.round(((tasksWithSLA.length - (slaBreachTasks?.length || 0)) / tasksWithSLA.length) * 100)
    : 100;

  return (
    <Card data-testid="card-sla-monitor">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center space-x-2">
          <Clock className="w-5 h-5" />
          <span>SLA Monitor</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">Real-time response tracking</p>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {/* SLA Compliance Rate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">First Response Rate</span>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-chart-3">{slaComplianceRate}%</span>
              {slaComplianceRate >= 95 ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
              )}
            </div>
          </div>
          <Progress value={slaComplianceRate} className="h-2" />
        </div>

        {/* Active SLA Timers */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Active SLA Timers</span>
            <span className="text-sm font-medium text-chart-1">{activeSLATimers.length}</span>
          </div>
          
          {activeSLATimers.length > 0 ? (
            <div className="space-y-2">
              {activeSLATimers.slice(0, 3).map((task) => {
                const minutesRemaining = getSLATimeRemaining(task.slaAt!);
                const progress = getSLAProgress(task.slaAt!);
                const isUrgent = minutesRemaining <= 5;
                
                return (
                  <div 
                    key={task.id} 
                    className={`flex items-center justify-between p-2 rounded ${
                      isUrgent ? 'bg-red-50 dark:bg-red-900/20' : 'bg-muted/50'
                    }`}
                    data-testid={`sla-timer-${task.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {task.title.length > 30 ? `${task.title.substring(0, 30)}...` : task.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {task.assignee?.name || 'Unassigned'}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={isUrgent ? "destructive" : "secondary"} className="text-xs">
                        {minutesRemaining}m
                      </Badge>
                      {isUrgent && <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>}
                    </div>
                  </div>
                );
              })}
              
              {activeSLATimers.length > 3 && (
                <div className="text-xs text-muted-foreground text-center">
                  +{activeSLATimers.length - 3} more active timers
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-600" />
              <p className="text-sm text-muted-foreground">All SLAs on track</p>
            </div>
          )}
        </div>

        {/* SLA Breaches Alert */}
        {slaBreachTasks && slaBreachTasks.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-red-900 dark:text-red-100">
                {slaBreachTasks.length} SLA Breach{slaBreachTasks.length > 1 ? 'es' : ''}
              </span>
            </div>
            <div className="space-y-1">
              {slaBreachTasks.slice(0, 2).map((task) => (
                <div key={task.id} className="text-xs text-red-800 dark:text-red-200">
                  {task.title.length > 40 ? `${task.title.substring(0, 40)}...` : task.title}
                </div>
              ))}
              {slaBreachTasks.length > 2 && (
                <div className="text-xs text-red-700 dark:text-red-300">
                  +{slaBreachTasks.length - 2} more breaches
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="pt-3 border-t border-border">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-foreground">{tasksWithSLA.length}</div>
              <div className="text-xs text-muted-foreground">Tasks w/ SLA</div>
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">{slaBreachTasks?.length || 0}</div>
              <div className="text-xs text-muted-foreground">Breaches</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
