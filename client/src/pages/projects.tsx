import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, User, Target } from "lucide-react";

interface Project {
  id: string;
  title: string;
  scope: string;
  status: string;
  startAt?: string;
  targetAt?: string;
  owner?: {
    id: string;
    name: string;
    slackId: string;
  };
  taskStats: {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
    open: number;
  };
}

export default function Projects() {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
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

  const calculateProgress = (taskStats: Project['taskStats']) => {
    if (taskStats.total === 0) return 0;
    return Math.round((taskStats.completed / taskStats.total) * 100);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString();
  };

  const getDaysRemaining = (targetDate?: string) => {
    if (!targetDate) return null;
    const now = new Date();
    const target = new Date(targetDate);
    const diffTime = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Projects</h1>
            <p className="text-muted-foreground">Track progress and manage project tasks</p>
          </div>
          <Button data-testid="button-create-project">
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>

        {projects && projects.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium text-foreground mb-2">No projects yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first project to start organizing your work.
              </p>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects?.map((project) => {
              const progress = calculateProgress(project.taskStats);
              const daysRemaining = getDaysRemaining(project.targetAt);
              const isOverdue = daysRemaining !== null && daysRemaining < 0;
              
              return (
                <Card 
                  key={project.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedProject(project.id)}
                  data-testid={`project-card-${project.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-2">{project.title}</CardTitle>
                        <Badge className={getStatusColor(project.status)}>
                          {project.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-foreground">{progress}%</div>
                        <div className="text-xs text-muted-foreground">Complete</div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {project.scope}
                    </p>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{project.taskStats.completed}/{project.taskStats.total} tasks</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span>{project.taskStats.open}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                          <span>{project.taskStats.inProgress}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          <span>{project.taskStats.blocked}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="pt-3 border-t border-border space-y-2">
                      {project.owner && (
                        <div className="flex items-center space-x-2 text-sm">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Owner:</span>
                          <span className="font-medium">{project.owner.name}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center space-x-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Target:</span>
                        <span className={`font-medium ${isOverdue ? 'text-red-600' : ''}`}>
                          {formatDate(project.targetAt)}
                        </span>
                      </div>
                      
                      {daysRemaining !== null && (
                        <div className="text-sm">
                          {isOverdue ? (
                            <span className="text-red-600 font-medium">
                              {Math.abs(daysRemaining)} days overdue
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {daysRemaining} days remaining
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
  );
}
