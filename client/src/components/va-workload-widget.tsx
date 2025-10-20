import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, RefreshCw, TrendingUp, AlertCircle } from "lucide-react";
import { useState } from "react";

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
  const [isRebalancing, setIsRebalancing] = useState(false);
  
  const { data, isLoading, refetch } = useQuery<{ workloads: VAWorkload[] }>({
    queryKey: ['/api/tasks/workloads'],
  });

  const handleRebalance = async () => {
    setIsRebalancing(true);
    try {
      const response = await fetch('/api/tasks/rebalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxTasksPerVA: 5 }),
      });
      const result = await response.json();
      alert(\`Rebalanced \${result.rebalanced} tasks!\\n\${result.details.join('\\n')}\`);
      refetch();
    } catch (error) {
      alert('Failed to rebalance workload');
    } finally {
      setIsRebalancing(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className=\"flex items-center gap-2\">
            <Users className=\"h-5 w-5\" />
            VA Workload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className=\"animate-pulse space-y-2\">
            <div className=\"h-12 bg-muted rounded\"></div>
            <div className=\"h-12 bg-muted rounded\"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const workloads = data?.workloads || [];
  const overloadedVAs = workloads.filter(va => va.openTaskCount > 5);

  return (
    <Card>
      <CardHeader>
        <div className=\"flex items-center justify-between\">
          <CardTitle className=\"flex items-center gap-2\">
            <Users className=\"h-5 w-5\" />
            VA Workload
          </CardTitle>
          <div className=\"flex gap-2\">
            <Button 
              size=\"sm\" 
              variant=\"outline\"
              onClick={() => refetch()}
            >
              <RefreshCw className=\"h-4 w-4\" />
            </Button>
            {overloadedVAs.length > 0 && (
              <Button 
                size=\"sm\" 
                variant=\"destructive\"
                onClick={handleRebalance}
                disabled={isRebalancing}
              >
                {isRebalancing ? 'Rebalancing...' : 'Rebalance'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className=\"space-y-3\">
          {workloads.length === 0 ? (
            <p className=\"text-sm text-muted-foreground\">No active VAs found</p>
          ) : (
            workloads.map(va => (
              <div 
                key={va.userId}
                className=\"flex items-center justify-between p-3 rounded-lg border\"
              >
                <div className=\"flex items-center gap-3 flex-1\">
                  <div className=\"flex flex-col\">
                    <span className=\"font-medium text-sm\">{va.name}</span>
                    <span className=\"text-xs text-muted-foreground\">
                      {va.isAvailable ? '🟢 Available' : '⚫ Off Shift'}
                    </span>
                  </div>
                </div>
                
                <div className=\"flex items-center gap-4\">
                  <div className=\"text-right\">
                    <p className=\"text-sm font-medium\">
                      {va.openTaskCount} open
                    </p>
                    <p className=\"text-xs text-muted-foreground\">
                      {va.todayCompletedCount} done today
                    </p>
                  </div>
                  
                  <Badge 
                    variant={
                      va.capacityScore >= 70 ? 'default' :
                      va.capacityScore >= 40 ? 'secondary' :
                      'destructive'
                    }
                    className=\"min-w-[60px] justify-center\"
                  >
                    {va.capacityScore}%
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
        
        {overloadedVAs.length > 0 && (
          <div className=\"mt-4 p-3 bg-destructive/10 rounded-lg flex items-start gap-2\">
            <AlertCircle className=\"h-4 w-4 text-destructive mt-0.5\" />
            <div className=\"flex-1\">
              <p className=\"text-sm font-medium text-destructive\">
                {overloadedVAs.length} VA(s) Overloaded
              </p>
              <p className=\"text-xs text-muted-foreground mt-1\">
                {overloadedVAs.map(va => va.name).join(', ')} have more than 5 open tasks
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
