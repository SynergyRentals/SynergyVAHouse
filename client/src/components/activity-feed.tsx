import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle, AlertTriangle, Clock, User } from "lucide-react";

interface Audit {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  actorId?: string;
  ts: string;
  data?: any;
}

interface User {
  id: string;
  name: string;
}

export function ActivityFeed() {
  const { data: audits, isLoading } = useQuery<Audit[]>({
    queryKey: ['/api/audits/recent'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  const getUserName = (actorId?: string) => {
    if (!actorId) return 'System';
    const user = users?.find(u => u.id === actorId);
    return user?.name || 'Unknown User';
  };

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'created':
      case 'created_from_message':
      case 'created_from_conduit_escalation':
        return <div className="w-2 h-2 bg-blue-500 rounded-full"></div>;
      case 'completed':
      case 'completed_with_evidence':
        return <div className="w-2 h-2 bg-green-500 rounded-full"></div>;
      case 'sla_breach_escalated':
        return <div className="w-2 h-2 bg-red-500 rounded-full"></div>;
      case 'blocked':
        return <div className="w-2 h-2 bg-orange-500 rounded-full"></div>;
      case 'updated':
      case 'updated_from_conduit':
      case 'updated_from_suiteop':
        return <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>;
      default:
        return <div className="w-2 h-2 bg-gray-500 rounded-full"></div>;
    }
  };

  const getActivityDescription = (audit: Audit) => {
    const userName = getUserName(audit.actorId);
    
    switch (audit.action) {
      case 'created':
        return `${userName} created a new task`;
      case 'created_from_message':
        return `${userName} created task from Slack message`;
      case 'created_from_conduit_escalation':
        return 'New task from Conduit escalation';
      case 'created_from_suiteop':
        return 'New task from SuiteOp';
      case 'completed':
        return `${userName} completed task`;
      case 'completed_with_evidence':
        return `${userName} completed task with evidence`;
      case 'sla_breach_escalated':
        return 'SLA breach escalated to #triage';
      case 'blocked':
        return `${userName} blocked task`;
      case 'updated':
        return `${userName} updated task`;
      case 'updated_from_conduit':
        return 'Task updated from Conduit';
      case 'updated_from_suiteop':
        return 'Task updated from SuiteOp';
      case 'handoff':
        return `${userName} handed off task`;
      case 'followup_created':
        return 'Follow-up task created from promise';
      case 'followup_reminder_sent':
        return 'Follow-up reminder sent';
      case 'followup_satisfied':
        return 'Follow-up promise satisfied';
      default:
        return `${userName} performed ${audit.action.replace(/_/g, ' ')}`;
    }
  };

  const getTimestamp = (ts: string) => {
    const now = new Date();
    const auditTime = new Date(ts);
    const diffMinutes = Math.floor((now.getTime() - auditTime.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const isHighPriority = (audit: Audit) => {
    return ['sla_breach_escalated', 'blocked', 'created_from_conduit_escalation'].includes(audit.action);
  };

  return (
    <Card data-testid="card-activity-feed">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center space-x-2">
          <Activity className="w-5 h-5" />
          <span>Recent Activity</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start space-x-3 animate-pulse">
                <div className="w-2 h-2 bg-gray-300 rounded-full mt-2"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-300 rounded w-3/4 mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : audits && audits.length > 0 ? (
          <div className="space-y-3">
            {audits.slice(0, 10).map((audit) => (
              <div 
                key={audit.id} 
                className={`flex items-start space-x-3 ${
                  isHighPriority(audit) ? 'p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800' : ''
                }`}
                data-testid={`activity-item-${audit.id}`}
              >
                {getActivityIcon(audit.action)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <p className="text-sm text-card-foreground font-medium">
                      {getActivityDescription(audit)}
                    </p>
                    {isHighPriority(audit) && (
                      <Badge variant="destructive" className="text-xs ml-2 flex-shrink-0">
                        Urgent
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 mt-1">
                    <p className="text-xs text-muted-foreground">
                      {getTimestamp(audit.ts)}
                    </p>
                    {audit.entity === 'task' && audit.entityId && (
                      <>
                        <span className="text-xs text-muted-foreground">•</span>
                        <p className="text-xs text-muted-foreground">
                          Task ID: {audit.entityId.substring(0, 8)}...
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Activity className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        )}
        
        {audits && audits.length > 10 && (
          <div className="pt-3 border-t border-border text-center">
            <button className="text-sm text-primary hover:underline" data-testid="button-view-all-activity">
              View all activity
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
