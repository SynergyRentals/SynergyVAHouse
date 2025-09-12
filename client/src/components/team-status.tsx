import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock } from "lucide-react";

interface User {
  id: string;
  name: string;
  role: string;
  timezone: string;
}

interface Task {
  id: string;
  status: string;
  assigneeId?: string;
  slaAt?: string;
  dueAt?: string;
}

export function TeamStatus() {
  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });

  const getTeamMemberStats = (userId: string) => {
    const userTasks = tasks?.filter(task => task.assigneeId === userId) || [];
    const now = new Date();
    
    const activeTasks = userTasks.filter(task => task.status !== 'DONE').length;
    const overdueTasks = userTasks.filter(task => 
      task.status !== 'DONE' && task.dueAt && new Date(task.dueAt) < now
    ).length;
    const slaBreaches = userTasks.filter(task => 
      task.status !== 'DONE' && task.slaAt && new Date(task.slaAt) < now
    ).length;
    
    return { activeTasks, overdueTasks, slaBreaches };
  };

  const getStatusColor = (stats: ReturnType<typeof getTeamMemberStats>) => {
    if (stats.slaBreaches > 0) return 'bg-red-500';
    if (stats.overdueTasks > 2) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusText = (stats: ReturnType<typeof getTeamMemberStats>) => {
    if (stats.slaBreaches > 0) return 'SLA Breach';
    if (stats.overdueTasks > 2) return 'Overloaded';
    return 'On Track';
  };

  const getCurrentTime = (timezone: string) => {
    try {
      return new Date().toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return 'N/A';
    }
  };

  const teamMembers = users?.filter(user => 
    !user.role.toLowerCase().includes('manager')
  ) || [];

  return (
    <Card data-testid="card-team-status">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center space-x-2">
          <Users className="w-5 h-5" />
          <span>Team Status</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {teamMembers.length > 0 ? (
          teamMembers.map((user) => {
            const stats = getTeamMemberStats(user.id);
            const statusColor = getStatusColor(stats);
            const statusText = getStatusText(stats);
            const currentTime = getCurrentTime(user.timezone);
            
            return (
              <div 
                key={user.id} 
                className="flex items-center justify-between"
                data-testid={`team-member-${user.id}`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-primary-foreground text-sm font-medium">
                      {user.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-card-foreground">
                      {user.name}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center space-x-2">
                      <span>{user.role}</span>
                      <span>•</span>
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{currentTime}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className="text-sm font-medium text-card-foreground">
                      {stats.activeTasks} active
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {stats.overdueTasks > 0 && `${stats.overdueTasks} overdue`}
                      {stats.slaBreaches > 0 && ` • ${stats.slaBreaches} SLA`}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-center space-y-1">
                    <div className={`w-3 h-3 rounded-full ${statusColor}`}></div>
                    <Badge 
                      variant={stats.slaBreaches > 0 ? "destructive" : stats.overdueTasks > 2 ? "secondary" : "default"}
                      className="text-xs px-2 py-0"
                    >
                      {statusText}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-4">
            <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No team members found</p>
          </div>
        )}
        
        {/* Team Summary */}
        {teamMembers.length > 0 && (
          <div className="pt-3 border-t border-border">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-sm font-bold text-foreground">
                  {teamMembers.filter(user => {
                    const stats = getTeamMemberStats(user.id);
                    return stats.slaBreaches === 0 && stats.overdueTasks <= 2;
                  }).length}
                </div>
                <div className="text-xs text-muted-foreground">On Track</div>
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">
                  {teamMembers.filter(user => {
                    const stats = getTeamMemberStats(user.id);
                    return stats.overdueTasks > 2 && stats.slaBreaches === 0;
                  }).length}
                </div>
                <div className="text-xs text-muted-foreground">Overloaded</div>
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">
                  {teamMembers.filter(user => {
                    const stats = getTeamMemberStats(user.id);
                    return stats.slaBreaches > 0;
                  }).length}
                </div>
                <div className="text-xs text-muted-foreground">SLA Breach</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
