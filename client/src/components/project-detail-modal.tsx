import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar, 
  User, 
  Target, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  Circle,
  PlayCircle,
  XCircle,
  Edit,
  Plus
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'BLOCKED' | 'DONE';
  priority: number;
  dueAt?: string;
  category: string;
}

interface ProjectDetail {
  id: string;
  title: string;
  scope: string;
  status: string;
  startAt?: string;
  targetAt?: string;
  createdAt: string;
  updatedAt: string;
  owner?: {
    id: string;
    name: string;
    slackId: string;
  };
  tasks: Task[];
  kanbanColumns?: {
    backlog: Task[];
    inProgress: Task[];
    waiting: Task[];
    blocked: Task[];
    done: Task[];
  };
}

interface ProjectDetailModalProps {
  projectId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectDetailModal({ projectId, isOpen, onClose }: ProjectDetailModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading, error } = useQuery<ProjectDetail>({
    queryKey: [`/api/projects/${projectId}`],
    enabled: isOpen && !!projectId,
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'planning': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'on_hold': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'completed': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const getTaskStatusIcon = (status: string) => {
    switch (status) {
      case 'OPEN': return <Circle className="w-4 h-4 text-blue-500" />;
      case 'IN_PROGRESS': return <PlayCircle className="w-4 h-4 text-yellow-500" />;
      case 'WAITING': return <Clock className="w-4 h-4 text-orange-500" />;
      case 'BLOCKED': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'DONE': return <CheckCircle className="w-4 h-4 text-green-500" />;
      default: return <Circle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority <= 2) return 'text-red-600 font-semibold';
    if (priority === 3) return 'text-yellow-600 font-medium';
    return 'text-gray-600';
  };

  const getPriorityLabel = (priority: number) => {
    if (priority === 1) return 'Critical';
    if (priority === 2) return 'High';
    if (priority === 3) return 'Medium';
    if (priority === 4) return 'Low';
    return 'Very Low';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getDaysRemaining = (targetDate?: string) => {
    if (!targetDate) return null;
    const now = new Date();
    const target = new Date(targetDate);
    const diffTime = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getKanbanColumns = () => {
    if (!project) {
      return {
        backlog: [],
        inProgress: [],
        waiting: [],
        blocked: [],
        done: []
      };
    }

    // Use kanbanColumns from API if available, otherwise compute from tasks
    if (project.kanbanColumns) {
      return project.kanbanColumns;
    }

    // Fallback: compute from tasks
    const tasks = project.tasks || [];
    return {
      backlog: tasks.filter(task => task.status === 'OPEN'),
      inProgress: tasks.filter(task => task.status === 'IN_PROGRESS'),
      waiting: tasks.filter(task => task.status === 'WAITING'),
      blocked: tasks.filter(task => task.status === 'BLOCKED'),
      done: tasks.filter(task => task.status === 'DONE')
    };
  };

  const calculateProgress = () => {
    if (!project || !project.tasks || project.tasks.length === 0) return 0;
    const completedTasks = project.tasks.filter(task => task.status === 'DONE').length;
    return Math.round((completedTasks / project.tasks.length) * 100);
  };

  if (!isOpen || !projectId) {
    return null;
  }

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh]" data-testid="project-detail-modal">
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading project details...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error || !project) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl" data-testid="project-detail-modal">
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-500" />
              <h3 className="text-lg font-medium text-foreground mb-2">Failed to load project</h3>
              <p className="text-muted-foreground mb-4">
                Unable to fetch project details. Please try again.
              </p>
              <Button onClick={onClose} data-testid="button-close-error">
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const progress = calculateProgress();
  const daysRemaining = getDaysRemaining(project.targetAt);
  const isOverdue = daysRemaining !== null && daysRemaining < 0;
  const kanbanColumns = getKanbanColumns();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh]" data-testid="project-detail-modal">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold flex items-center space-x-3">
                <Target className="w-6 h-6 text-primary" />
                <span data-testid="text-project-title">{project.title}</span>
              </DialogTitle>
              <div className="flex items-center space-x-3 mt-2">
                <Badge className={getStatusColor(project.status)} data-testid="badge-project-status">
                  {project.status.replace('_', ' ')}
                </Badge>
                <div className="text-2xl font-bold text-primary" data-testid="text-project-progress">
                  {progress}%
                </div>
                <span className="text-muted-foreground">complete</span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" data-testid="button-edit-project">
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={onClose} data-testid="button-close-project-detail">
                Close
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
          <div className="space-y-6">
            {/* Project Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Project Scope */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Project Scope</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-foreground leading-relaxed" data-testid="text-project-scope">
                      {project.scope}
                    </p>
                  </CardContent>
                </Card>

                {/* Tasks Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center justify-between">
                      Tasks Overview
                      <Button size="sm" variant="outline" data-testid="button-add-task">
                        <Plus className="w-4 h-4 mr-1" />
                        Add Task
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Overall Progress</span>
                        <span className="text-sm text-muted-foreground" data-testid="text-task-counts">
                          {kanbanColumns.done.length} of {project.tasks?.length || 0} tasks completed
                        </span>
                      </div>
                      <Progress value={progress} className="h-3" />
                      
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4">
                        <div className="text-center">
                          <div className="flex items-center justify-center space-x-1 mb-2">
                            <Circle className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-medium">Open</span>
                          </div>
                          <div className="text-2xl font-bold" data-testid="count-open-tasks">
                            {kanbanColumns.backlog.length}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center space-x-1 mb-2">
                            <PlayCircle className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm font-medium">In Progress</span>
                          </div>
                          <div className="text-2xl font-bold" data-testid="count-inprogress-tasks">
                            {kanbanColumns.inProgress.length}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center space-x-1 mb-2">
                            <Clock className="w-4 h-4 text-orange-500" />
                            <span className="text-sm font-medium">Waiting</span>
                          </div>
                          <div className="text-2xl font-bold" data-testid="count-waiting-tasks">
                            {kanbanColumns.waiting.length}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center space-x-1 mb-2">
                            <XCircle className="w-4 h-4 text-red-500" />
                            <span className="text-sm font-medium">Blocked</span>
                          </div>
                          <div className="text-2xl font-bold" data-testid="count-blocked-tasks">
                            {kanbanColumns.blocked.length}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center space-x-1 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm font-medium">Done</span>
                          </div>
                          <div className="text-2xl font-bold" data-testid="count-done-tasks">
                            {kanbanColumns.done.length}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Project Details Sidebar */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Project Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {project.owner && (
                      <div className="flex items-center space-x-3">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm text-muted-foreground">Owner</div>
                          <div className="font-medium" data-testid="text-project-owner">
                            {project.owner.name}
                          </div>
                        </div>
                      </div>
                    )}

                    <Separator />

                    <div className="flex items-center space-x-3">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Start Date</div>
                        <div className="font-medium" data-testid="text-project-start-date">
                          {formatDate(project.startAt)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Target className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Target Date</div>
                        <div className={`font-medium ${isOverdue ? 'text-red-600' : ''}`} data-testid="text-project-target-date">
                          {formatDate(project.targetAt)}
                        </div>
                      </div>
                    </div>

                    {daysRemaining !== null && (
                      <div className="bg-secondary/50 rounded-lg p-3">
                        <div className="text-sm font-medium mb-1">
                          {isOverdue ? 'Overdue by' : 'Time Remaining'}
                        </div>
                        <div className={`text-lg font-bold ${isOverdue ? 'text-red-600' : 'text-primary'}`} data-testid="text-days-remaining">
                          {Math.abs(daysRemaining)} days
                        </div>
                      </div>
                    )}

                    <Separator />

                    <div className="text-sm text-muted-foreground">
                      <div>Created: {formatDate(project.createdAt)}</div>
                      <div>Updated: {formatDate(project.updatedAt)}</div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Tasks List */}
            {project.tasks && project.tasks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {project.tasks
                      .sort((a, b) => {
                        // Sort by priority (1 = highest) then by due date
                        if (a.priority !== b.priority) return a.priority - b.priority;
                        if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
                        return a.dueAt ? -1 : 1;
                      })
                      .slice(0, 10)
                      .map((task) => (
                        <div 
                          key={task.id} 
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-secondary/50 transition-colors"
                          data-testid={`task-item-${task.id}`}
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            {getTaskStatusIcon(task.status)}
                            <div className="flex-1">
                              <div className="font-medium">{task.title}</div>
                              <div className="text-sm text-muted-foreground">
                                {task.category}
                                {task.dueAt && (
                                  <span className="ml-2">
                                    • Due {formatDate(task.dueAt)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(task.priority)} bg-secondary`}>
                              {getPriorityLabel(task.priority)}
                            </span>
                          </div>
                        </div>
                      ))}
                    
                    {project.tasks.length > 10 && (
                      <div className="text-center pt-2">
                        <Button variant="outline" size="sm" data-testid="button-view-all-tasks">
                          View all {project.tasks.length} tasks
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}