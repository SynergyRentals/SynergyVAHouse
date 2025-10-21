import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Zap, TrendingUp, Clock, User } from "lucide-react";

interface AssignmentRecommendation {
  taskId: string;
  taskTitle: string;
  recommendedVA: string;
  vaName: string;
  reason: string;
}

interface AssignmentStats {
  unassignedCount: number;
  totalAssignedToday: number;
  averageAssignmentTime: number;
}

export function TaskAssignmentPanel() {
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recommendationsData, isLoading: loadingRecommendations } = useQuery<{ recommendations: AssignmentRecommendation[] }>({
    queryKey: ['/api/tasks/recommendations'],
  });

  const { data: statsData, isLoading: loadingStats } = useQuery<AssignmentStats>({
    queryKey: ['/api/tasks/workload-summary'],
  });

  const autoAssignAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/tasks/auto-assign-all');
      return await res.json();
    },
    onSuccess: (result: any) => {
      toast({
        title: "Auto-Assignment Complete",
        description: (
          <div className="space-y-1">
            {result.successful > 0 && (
              <p className="text-green-600 dark:text-green-400">
                ✓ {result.successful} tasks assigned successfully
              </p>
            )}
            {result.failed > 0 && (
              <p className="text-red-600 dark:text-red-400">
                ✗ {result.failed} tasks failed
              </p>
            )}
          </div>
        ),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/workload-summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/workloads'] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Auto-Assignment Failed",
        description: error.message,
      });
    },
  });

  const handleQuickAssign = async (taskId: string) => {
    setAssigningTaskId(taskId);
    try {
      const response = await fetch(`/api/tasks/${taskId}/auto-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: {} }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to auto-assign');
      }

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Task Assigned",
          description: `Assigned to ${result.assigneeName}`,
        });

        queryClient.invalidateQueries({ queryKey: ['/api/tasks/recommendations'] });
        queryClient.invalidateQueries({ queryKey: ['/api/tasks/workload-summary'] });
        queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
        queryClient.invalidateQueries({ queryKey: ['/api/tasks/workloads'] });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Assignment Failed",
        description: error.message,
      });
    } finally {
      setAssigningTaskId(null);
    }
  };

  const loading = loadingRecommendations || loadingStats;
  const recommendations = recommendationsData?.recommendations?.slice(0, 5) || [];
  const stats: AssignmentStats = statsData || {
    unassignedCount: 0,
    totalAssignedToday: 0,
    averageAssignmentTime: 0
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-muted">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-orange-600 dark:text-orange-400" data-testid="text-unassigned-count">
                {stats.unassignedCount}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Unassigned</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600 dark:text-green-400" data-testid="text-assigned-today">
                {stats.totalAssignedToday}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Assigned Today</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold" data-testid="text-avg-assignment-time">
                {stats.averageAssignmentTime}s
              </p>
              <p className="text-sm text-muted-foreground mt-1">Avg Assignment Time</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommended Assignments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Recommended Assignments
            </CardTitle>
            {stats.unassignedCount > 0 && (
              <Button
                variant="default"
                onClick={() => autoAssignAllMutation.mutate()}
                disabled={autoAssignAllMutation.isPending}
                className="gap-2"
                data-testid="button-auto-assign-all"
              >
                {autoAssignAllMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Auto-Assign All
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {recommendations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No unassigned tasks - great job! 🎉
            </p>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec) => (
                <div
                  key={rec.taskId}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  data-testid={`card-recommendation-${rec.taskId}`}
                >
                  <div className="flex-1 space-y-1">
                    <p className="font-medium text-sm" data-testid={`text-task-title-${rec.taskId}`}>
                      {rec.taskTitle}
                    </p>
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground" data-testid={`text-va-name-${rec.taskId}`}>
                        {rec.vaName}
                      </span>
                      <Badge variant="secondary" className="text-xs" data-testid={`badge-reason-${rec.taskId}`}>
                        {rec.reason}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleQuickAssign(rec.taskId)}
                    disabled={assigningTaskId === rec.taskId}
                    className="gap-2"
                    data-testid={`button-quick-assign-${rec.taskId}`}
                  >
                    {assigningTaskId === rec.taskId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            Assignment history will appear here
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
