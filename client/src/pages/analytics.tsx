import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Users,
  Download,
  Calendar
} from "lucide-react";

interface WeeklyScorecard {
  inboundTasks: number;
  completedTasks: number;
  openTasks: number;
  slaFirstResponsePercent: number;
  slaBreachCount: number;
  avgCycleTimeHours: number;
  reopenRatePercent: number;
  followupCreatedVsSatisfied: string;
  evidenceCompletenessPercent: number;
  projectMilestonesOnTimePercent: number;
}

interface MetricRollup {
  day: string;
  userId?: string;
  counts: {
    created: number;
    completed: number;
    overdue: number;
    slaBreaches: number;
    reopens: number;
    followupsCreated: number;
  };
}

interface User {
  id: string;
  name: string;
  role: string;
}

export default function Analytics() {
  const [timeRange, setTimeRange] = useState("7d");
  const [selectedUser, setSelectedUser] = useState<string>("all");

  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  const { data: scorecard, isLoading: scorecardLoading } = useQuery<WeeklyScorecard>({
    queryKey: ['/api/metrics/scorecard', timeRange],
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<MetricRollup[]>({
    queryKey: ['/api/metrics', { 
      startDate: getStartDate(timeRange).toISOString(),
      endDate: new Date().toISOString(),
      userId: selectedUser === "all" ? undefined : selectedUser
    }],
  });

  function getStartDate(range: string): Date {
    const now = new Date();
    switch (range) {
      case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case "90d": return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default: return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }

  const getPerformanceColor = (percentage: number) => {
    if (percentage >= 90) return "text-green-600";
    if (percentage >= 75) return "text-yellow-600";
    return "text-red-600";
  };

  const getPerformanceIcon = (percentage: number) => {
    if (percentage >= 90) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (percentage >= 75) return <TrendingUp className="w-4 h-4 text-yellow-600" />;
    return <TrendingDown className="w-4 h-4 text-red-600" />;
  };

  const exportScorecard = async () => {
    try {
      const response = await fetch('/api/metrics/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scorecard, timeRange })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `va-ops-scorecard-${timeRange}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  if (scorecardLoading || metricsLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
            <p className="text-muted-foreground">Performance metrics and insights</p>
          </div>
          <div className="flex items-center space-x-4">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32" data-testid="select-time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-48" data-testid="select-user-filter">
                <SelectValue placeholder="All team members" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All team members</SelectItem>
                {users?.map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button onClick={exportScorecard} data-testid="button-export-scorecard">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Key Performance Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card data-testid="card-sla-compliance">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">SLA Compliance</p>
                  <div className="flex items-center space-x-2">
                    <p className={`text-2xl font-bold ${getPerformanceColor(scorecard?.slaFirstResponsePercent || 0)}`}>
                      {scorecard?.slaFirstResponsePercent || 0}%
                    </p>
                    {getPerformanceIcon(scorecard?.slaFirstResponsePercent || 0)}
                  </div>
                </div>
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div className="mt-4">
                <Progress value={scorecard?.slaFirstResponsePercent || 0} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-completion-rate">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Task Completion</p>
                  <div className="flex items-center space-x-2">
                    <p className="text-2xl font-bold text-foreground">
                      {scorecard ? Math.round((scorecard.completedTasks / (scorecard.completedTasks + scorecard.openTasks)) * 100) : 0}%
                    </p>
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  </div>
                </div>
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                {scorecard?.completedTasks || 0} completed, {scorecard?.openTasks || 0} open
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-evidence-completeness">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">Evidence Completeness</p>
                  <div className="flex items-center space-x-2">
                    <p className={`text-2xl font-bold ${getPerformanceColor(scorecard?.evidenceCompletenessPercent || 0)}`}>
                      {scorecard?.evidenceCompletenessPercent || 0}%
                    </p>
                    {getPerformanceIcon(scorecard?.evidenceCompletenessPercent || 0)}
                  </div>
                </div>
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                </div>
              </div>
              <div className="mt-4">
                <Progress value={scorecard?.evidenceCompletenessPercent || 0} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-sla-breaches">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm font-medium">SLA Breaches</p>
                  <div className="flex items-center space-x-2">
                    <p className="text-2xl font-bold text-destructive">
                      {scorecard?.slaBreachCount || 0}
                    </p>
                    {(scorecard?.slaBreachCount || 0) > 0 ? (
                      <TrendingUp className="w-4 h-4 text-red-600" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-green-600" />
                    )}
                  </div>
                </div>
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                {timeRange} period
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card data-testid="card-performance-metrics">
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Average Cycle Time</span>
                  <span className="font-medium">{scorecard?.avgCycleTimeHours?.toFixed(1) || 0}h</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Reopen Rate</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">{scorecard?.reopenRatePercent || 0}%</span>
                    <Badge variant={(scorecard?.reopenRatePercent || 0) < 5 ? "default" : "destructive"}>
                      {(scorecard?.reopenRatePercent || 0) < 5 ? "Good" : "High"}
                    </Badge>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Follow-up Satisfaction</span>
                  <span className="font-medium">{scorecard?.followupCreatedVsSatisfied || "0/0"}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Project Milestones On Time</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">{scorecard?.projectMilestonesOnTimePercent || 0}%</span>
                    {getPerformanceIcon(scorecard?.projectMilestonesOnTimePercent || 0)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-workload-distribution">
            <CardHeader>
              <CardTitle>Workload Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Inbound Tasks</span>
                  <span className="font-medium">{scorecard?.inboundTasks || 0}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Completed Tasks</span>
                  <span className="font-medium text-green-600">{scorecard?.completedTasks || 0}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Open Tasks</span>
                  <span className="font-medium text-blue-600">{scorecard?.openTasks || 0}</span>
                </div>
                
                <div className="pt-4 border-t border-border">
                  <div className="text-sm text-muted-foreground mb-2">Completion Rate</div>
                  <Progress 
                    value={scorecard ? (scorecard.completedTasks / (scorecard.completedTasks + scorecard.openTasks)) * 100 : 0} 
                    className="h-2" 
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Team Performance */}
        {selectedUser === "all" && (
          <Card data-testid="card-team-performance">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="w-5 h-5" />
                <span>Team Performance</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users?.filter(user => !user.role.toLowerCase().includes('manager')).map(user => {
                  const userMetrics = metrics?.filter(m => m.userId === user.id) || [];
                  const totalCompleted = userMetrics.reduce((sum, m) => sum + m.counts.completed, 0);
                  const totalBreaches = userMetrics.reduce((sum, m) => sum + m.counts.slaBreaches, 0);
                  
                  return (
                    <div key={user.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                          <span className="text-primary-foreground font-medium">
                            {user.name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{user.name}</div>
                          <div className="text-sm text-muted-foreground">{user.role}</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-6 text-sm">
                        <div className="text-center">
                          <div className="font-medium text-foreground">{totalCompleted}</div>
                          <div className="text-muted-foreground">Completed</div>
                        </div>
                        <div className="text-center">
                          <div className={`font-medium ${totalBreaches > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {totalBreaches}
                          </div>
                          <div className="text-muted-foreground">SLA Breaches</div>
                        </div>
                        <div className="text-center">
                          <div className={`w-3 h-3 rounded-full ${
                            totalBreaches > 2 ? 'bg-red-500' : 
                            totalBreaches > 0 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Export Information */}
        <Card data-testid="card-export-info">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="w-5 h-5" />
              <span>Weekly Scorecard Export</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Export comprehensive metrics to Google Sheets for stakeholder reporting and trend analysis.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="font-medium text-foreground">Included Metrics:</div>
                <ul className="text-muted-foreground space-y-1 mt-2">
                  <li>• Task volumes</li>
                  <li>• SLA performance</li>
                  <li>• Cycle times</li>
                  <li>• Quality metrics</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-foreground">Time Periods:</div>
                <ul className="text-muted-foreground space-y-1 mt-2">
                  <li>• Weekly trends</li>
                  <li>• Monthly summaries</li>
                  <li>• Historical data</li>
                  <li>• YoY comparisons</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-foreground">Team Breakdown:</div>
                <ul className="text-muted-foreground space-y-1 mt-2">
                  <li>• Individual performance</li>
                  <li>• Category analysis</li>
                  <li>• Workload distribution</li>
                  <li>• Skills mapping</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-foreground">Export Formats:</div>
                <ul className="text-muted-foreground space-y-1 mt-2">
                  <li>• CSV for analysis</li>
                  <li>• Google Sheets</li>
                  <li>• PDF reports</li>
                  <li>• Real-time dashboards</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  );
}
