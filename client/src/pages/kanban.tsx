import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  Filter, 
  Plus,
  Clock,
  User,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ArrowRight
} from "lucide-react";
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent,
  useDroppable
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { 
  useSortable 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TaskModal } from "@/components/task-modal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  project?: {
    id: string;
    title: string;
  };
}

interface Project {
  id: string;
  title: string;
  scope: string;
  status: string;
  taskStats: {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
    open: number;
  };
}

const COLUMN_STATUS_MAP = {
  backlog: ['OPEN'],
  inprogress: ['IN_PROGRESS'],
  review: ['WAITING'],
  blocked: ['BLOCKED'],
  done: ['DONE']
};

const COLUMNS = [
  { id: 'backlog', title: 'Backlog', statuses: COLUMN_STATUS_MAP.backlog },
  { id: 'inprogress', title: 'In Progress', statuses: COLUMN_STATUS_MAP.inprogress },
  { id: 'review', title: 'Review', statuses: COLUMN_STATUS_MAP.review },
  { id: 'blocked', title: 'Blocked', statuses: COLUMN_STATUS_MAP.blocked },
  { id: 'done', title: 'Done', statuses: COLUMN_STATUS_MAP.done }
];

function TaskCard({ task }: { task: Task }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getPriorityIcon = (priority: number) => {
    if (priority <= 2) return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (priority <= 3) return <Circle className="w-4 h-4 text-yellow-500" />;
    return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  };

  const getSLAStatus = (task: Task) => {
    if (!task.slaAt) return null;
    const now = new Date();
    const slaTime = new Date(task.slaAt);
    
    if (slaTime < now) return { type: 'breach', text: 'BREACHED', class: 'text-red-600' };
    
    const minutesRemaining = Math.floor((slaTime.getTime() - now.getTime()) / (1000 * 60));
    if (minutesRemaining <= 5) return { type: 'warning', text: `${minutesRemaining}m`, class: 'text-yellow-600' };
    
    return { type: 'ok', text: `${minutesRemaining}m`, class: 'text-green-600' };
  };

  const slaStatus = getSLAStatus(task);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid={`kanban-task-card-${task.id}`}
    >
      <Card className="mb-3 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center space-x-2">
              {getPriorityIcon(task.priority)}
              <h4 className="text-sm font-medium truncate flex-1">{task.title}</h4>
            </div>
            {slaStatus && (
              <div className={`text-xs font-medium ${slaStatus.class}`}>
                {slaStatus.text}
              </div>
            )}
          </div>
          
          <div className="text-xs text-muted-foreground mb-2">
            {task.category.replace(/\./g, ' → ')}
          </div>
          
          {task.project && (
            <Badge variant="outline" className="text-xs mb-2">
              {task.project.title}
            </Badge>
          )}
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {task.assignee && (
              <div className="flex items-center space-x-1">
                <User className="w-3 h-3" />
                <span>{task.assignee.name}</span>
              </div>
            )}
            {task.dueAt && (
              <div className="flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>{new Date(task.dueAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KanbanColumn({ column, tasks }: { column: typeof COLUMNS[0], tasks: Task[] }) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.id,
  });

  const style = {
    backgroundColor: isOver ? 'rgba(59, 130, 246, 0.05)' : undefined,
    borderColor: isOver ? 'rgb(59, 130, 246)' : undefined,
  };

  return (
    <div className="flex-1 min-w-72" data-testid={`kanban-column-${column.id}`}>
      <Card className="h-full transition-colors" style={style}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{column.title}</CardTitle>
            <Badge variant="secondary" data-testid={`kanban-column-count-${column.id}`}>
              {tasks.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div ref={setNodeRef} className="space-y-2 min-h-[200px]">
            <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </SortableContext>
            {tasks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Circle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No tasks</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NextStepsPanel({ tasks }: { tasks: Task[] }) {
  // Smart "Next 3 Steps" logic
  const getNextSteps = () => {
    const openTasks = tasks.filter(task => task.status === 'OPEN');
    
    // Sort by priority (lower number = higher priority) and SLA urgency
    const sortedTasks = openTasks.sort((a, b) => {
      // First by SLA urgency
      const aSlaUrgent = a.slaAt && new Date(a.slaAt).getTime() - Date.now() < 300000; // 5 min
      const bSlaUrgent = b.slaAt && new Date(b.slaAt).getTime() - Date.now() < 300000;
      if (aSlaUrgent && !bSlaUrgent) return -1;
      if (!aSlaUrgent && bSlaUrgent) return 1;
      
      // Then by priority
      return a.priority - b.priority;
    });
    
    return sortedTasks.slice(0, 3);
  };

  const nextSteps = getNextSteps();

  return (
    <Card className="w-80" data-testid="next-steps-panel">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <ArrowRight className="w-5 h-5 text-primary" />
          <span>Next 3 Steps</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {nextSteps.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">All caught up!</p>
          </div>
        ) : (
          nextSteps.map((task, index) => (
            <div 
              key={task.id} 
              className="flex items-start space-x-3 p-3 bg-muted/50 rounded-lg"
              data-testid={`next-step-${index + 1}`}
            >
              <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                {index + 1}
              </div>
              <div className="flex-1">
                <h5 className="text-sm font-medium mb-1">{task.title}</h5>
                <p className="text-xs text-muted-foreground">
                  {task.category.replace(/\./g, ' → ')}
                </p>
                {task.slaAt && (
                  <p className="text-xs text-red-600 font-medium mt-1">
                    SLA: {Math.floor((new Date(task.slaAt).getTime() - Date.now()) / 60000)}m left
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function Kanban() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<'all' | 'project'>('all');
  const { toast } = useToast();

  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ['/api/users'],
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: any }) => {
      return apiRequest(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Task updated",
        description: "Task status has been updated successfully."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update task status.",
        variant: "destructive"
      });
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const getColumnForStatus = (status: string) => {
    for (const column of COLUMNS) {
      if (column.statuses.includes(status)) {
        return column.id;
      }
    }
    return 'backlog';
  };

  const getStatusForColumn = (columnId: string) => {
    const column = COLUMNS.find(c => c.id === columnId);
    return column?.statuses[0] || 'OPEN';
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const taskId = active.id as string;
    const newColumnId = over.id as string;
    
    const task = tasks?.find(t => t.id === taskId);
    if (!task) return;

    const currentColumnId = getColumnForStatus(task.status);
    
    if (currentColumnId !== newColumnId) {
      const newStatus = getStatusForColumn(newColumnId);
      updateTaskMutation.mutate({
        taskId,
        updates: { status: newStatus }
      });
    }
  };

  const filteredTasks = (tasks || []).filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         task.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAssignee = assigneeFilter === "all" || task.assignee?.id === assigneeFilter;
    const matchesProject = projectFilter === "all" || task.project?.id === projectFilter;
    const matchesPriority = priorityFilter === "all" || task.priority.toString() === priorityFilter;
    
    return matchesSearch && matchesAssignee && matchesProject && matchesPriority;
  });

  const getTasksForColumn = (column: typeof COLUMNS[0]) => {
    return filteredTasks.filter(task => column.statuses.includes(task.status));
  };

  if (tasksLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading kanban board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Kanban Board</h1>
            <p className="text-muted-foreground">Visual project management and task tracking</p>
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
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search tasks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-kanban"
                />
              </div>
              
              <div className="flex flex-wrap gap-4">
                <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                  <SelectTrigger className="w-48" data-testid="select-assignee-filter">
                    <SelectValue placeholder="Filter by assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Assignees</SelectItem>
                    {users?.map(user => (
                      <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-48" data-testid="select-project-filter">
                    <SelectValue placeholder="Filter by project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects?.map(project => (
                      <SelectItem key={project.id} value={project.id}>{project.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-48" data-testid="select-priority-filter">
                    <SelectValue placeholder="Filter by priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="1">High Priority</SelectItem>
                    <SelectItem value="2">High Priority</SelectItem>
                    <SelectItem value="3">Medium Priority</SelectItem>
                    <SelectItem value="4">Low Priority</SelectItem>
                    <SelectItem value="5">Low Priority</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Kanban Layout */}
        <div className="flex gap-6 overflow-x-auto pb-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="flex space-x-6 flex-1">
              {COLUMNS.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  tasks={getTasksForColumn(column)}
                />
              ))}
            </div>
          </DndContext>
          
          {/* Next Steps Panel */}
          <NextStepsPanel tasks={filteredTasks} />
        </div>
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