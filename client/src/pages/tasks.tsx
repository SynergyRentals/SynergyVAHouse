import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskModal } from "@/components/task-modal";
import { Plus, Search, Filter } from "lucide-react";

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

export default function Tasks() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });

  const filteredTasks = tasks?.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         task.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || task.category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesCategory;
  }) || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'WAITING': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'BLOCKED': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'DONE': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const getPriorityIcon = (priority: number) => {
    if (priority <= 2) return '🔴'; // High
    if (priority <= 3) return '🟡'; // Medium
    return '🟢'; // Low
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No due date';
    return new Date(dateString).toLocaleDateString();
  };

  const getSLAStatus = (task: Task) => {
    if (!task.slaAt) return null;
    const now = new Date();
    const slaTime = new Date(task.slaAt);
    
    if (slaTime < now) return { type: 'breach', text: 'BREACHED', class: 'text-red-600' };
    
    const minutesRemaining = Math.floor((slaTime.getTime() - now.getTime()) / (1000 * 60));
    if (minutesRemaining <= 5) return { type: 'warning', text: `${minutesRemaining}m left`, class: 'text-yellow-600' };
    
    return { type: 'ok', text: `${minutesRemaining}m left`, class: 'text-green-600' };
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
            <p className="text-muted-foreground">Manage all your tasks and track progress</p>
          </div>
          <Button 
            data-testid="button-create-task"
            onClick={() => setIsCreatingTask(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search tasks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-tasks"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="WAITING">Waiting</SelectItem>
                  <SelectItem value="BLOCKED">Blocked</SelectItem>
                  <SelectItem value="DONE">Done</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full md:w-48" data-testid="select-category-filter">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="reservations.refund_request">Refund Requests</SelectItem>
                  <SelectItem value="reservations.cancellation_request">Cancellations</SelectItem>
                  <SelectItem value="guest.messaging_known_answer">Guest Messages</SelectItem>
                  <SelectItem value="access.smart_lock_issue">Smart Lock Issues</SelectItem>
                  <SelectItem value="cleaning.issue">Cleaning Issues</SelectItem>
                  <SelectItem value="maintenance.issue">Maintenance Issues</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tasks List */}
        <div className="space-y-4">
          {filteredTasks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Filter className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium text-foreground mb-2">No tasks found</h3>
                <p className="text-muted-foreground">
                  {searchTerm || statusFilter !== "all" || categoryFilter !== "all" 
                    ? "Try adjusting your filters to see more tasks."
                    : "Create your first task to get started."
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredTasks.map((task) => {
              const slaStatus = getSLAStatus(task);
              return (
                <Card 
                  key={task.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedTask(task)}
                  data-testid={`task-card-${task.id}`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className="text-lg">{getPriorityIcon(task.priority)}</span>
                          <h3 className="text-lg font-medium text-foreground">{task.title}</h3>
                          <Badge className={getStatusColor(task.status)}>
                            {task.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground mb-3">
                          <span className="font-medium">{task.category.replace(/\./g, ' → ')}</span>
                          <span>Due: {formatDate(task.dueAt)}</span>
                          {task.assignee && (
                            <span>Assigned to: {task.assignee.name}</span>
                          )}
                        </div>

                        {slaStatus && (
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium">SLA:</span>
                            <span className={`text-sm font-medium ${slaStatus.class}`}>
                              {slaStatus.text}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {slaStatus && slaStatus.type === 'breach' && (
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                        )}
                        {slaStatus && slaStatus.type === 'warning' && (
                          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        )}
                        {slaStatus && slaStatus.type === 'ok' && (
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Task Modal */}
        {(selectedTask || isCreatingTask) && (
          <TaskModal 
            task={selectedTask} 
            isOpen={!!(selectedTask || isCreatingTask)} 
            onClose={() => {
              setSelectedTask(null);
              setIsCreatingTask(false);
            }} 
          />
        )}
      </div>
  );
}
