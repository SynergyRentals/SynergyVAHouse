import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface VAWorkload {
  userId: string;
  name: string;
  timezone: string;
  isActive: boolean;
  openTaskCount: number;
  inProgressCount: number;
  todayCompletedCount: number;
  avgCompletionTimeMinutes: number | null;
  isAvailable: boolean;
  capacityScore: number;
}

export function VAWorkloadWidget() {
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<{ workloads: VAWorkload[] }>({
    queryKey: ['/api/tasks/workloads'],
    refetchInterval: 30000,
  });

  const rebalanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/tasks/rebalance', { maxTasksPerVA: 5 });
      return await res.json();
    },
    onSuccess: (result: any) => {
      toast({
        title: "Workload Rebalanced",
        description: `Rebalanced ${result.rebalanced || 0} tasks successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/workloads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Rebalance Failed",
        description: error.message,
      });
    },
  });

  const getCapacityColor = (score: number): string => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getCapacityTextColor = (score: number): string => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const handleRefresh = () => {
    refetch();
    setLastUpdate(new Date());
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            VA Workload Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            VA Workload Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const workloads = data?.workloads || [];
  const showRebalanceButton = workloads.some(va => va.capacityScore < 30);
  const totalVAs = workloads.length;
  const availableNow = workloads.filter(va => va.isAvailable).length;
  const avgCapacity = workloads.length > 0
    ? Math.round(workloads.reduce((sum, va) => sum + va.capacityScore, 0) / workloads.length)
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            VA Workload Status
          </CardTitle>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="ghost"
              onClick={handleRefresh}
              data-testid="button-refresh-workloads"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {showRebalanceButton && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => rebalanceMutation.mutate()}
                disabled={rebalanceMutation.isPending}
                data-testid="button-rebalance"
              >
                {rebalanceMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Rebalancing...
                  </>
                ) : (
                  'Rebalance'
                )}
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {workloads.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No active VAs found
            </p>
          ) : (
            workloads.map(va => (
              <div 
                key={va.userId}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                data-testid={`card-va-${va.userId}`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className={`h-2 w-2 rounded-full ${va.isAvailable ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div className="flex flex-col">
                    <span className="font-medium text-sm" data-testid={`text-va-name-${va.userId}`}>
                      {va.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {va.timezone}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs" data-testid={`badge-open-${va.userId}`}>
                        {va.openTaskCount} open
                      </Badge>
                      <Badge variant="secondary" className="text-xs" data-testid={`badge-progress-${va.userId}`}>
                        {va.inProgressCount} in progress
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1" data-testid={`text-completed-${va.userId}`}>
                      {va.todayCompletedCount} completed today
                    </p>
                  </div>
                  
                  <div className="text-right min-w-[60px]">
                    <p className={`text-2xl font-bold ${getCapacityTextColor(va.capacityScore)}`} data-testid={`text-capacity-${va.userId}`}>
                      {va.capacityScore}
                    </p>
                    <p className="text-xs text-muted-foreground">capacity</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {showRebalanceButton && (
          <Alert className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              One or more VAs have low capacity. Consider rebalancing workload.
            </AlertDescription>
          </Alert>
        )}

        {workloads.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-vas">
                  {totalVAs}
                </p>
                <p className="text-xs text-muted-foreground">Total VAs</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-available-vas">
                  {availableNow}
                </p>
                <p className="text-xs text-muted-foreground">Available Now</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${getCapacityTextColor(avgCapacity)}`} data-testid="text-avg-capacity">
                  {avgCapacity}
                </p>
                <p className="text-xs text-muted-foreground">Avg Capacity</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
