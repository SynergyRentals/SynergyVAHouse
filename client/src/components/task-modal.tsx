import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  Clock, 
  User, 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  ExternalLink,
  Upload,
  MessageSquare,
  History
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  category: string;
  status: string;
  priority: number;
  dueAt?: string;
  slaAt?: string;
  sourceUrl?: string;
  playbookKey?: string;
  evidence?: any;
  assignee?: {
    id: string;
    name: string;
    slackId: string;
  };
  comments?: Comment[];
  audits?: Audit[];
}

interface Comment {
  id: string;
  body: string;
  authorId?: string;
  createdAt: string;
}

interface Audit {
  id: string;
  action: string;
  actorId?: string;
  ts: string;
  data?: any;
}

interface Playbook {
  key: string;
  content: {
    definition_of_done?: {
      required_fields: string[];
      required_evidence: string[];
    };
    sla?: {
      first_response_minutes: number;
      breach_escalate_to: string;
    };
    steps: string[];
  };
}

interface TaskModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TaskModal({ task, isOpen, onClose }: TaskModalProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [evidenceData, setEvidenceData] = useState<Record<string, any>>({});
  const [newComment, setNewComment] = useState("");
  const [isCreatingNew, setIsCreatingNew] = useState(!task);
  const [newTaskData, setNewTaskData] = useState({
    title: '',
    category: '',
    priority: 3,
    assigneeId: '',
    dueAt: '',
    description: ''
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset component state when task prop changes
  useEffect(() => {
    setIsCreatingNew(!task);
    if (!task) {
      setNewTaskData({
        title: '',
        category: '',
        priority: 3,
        assigneeId: '',
        dueAt: '',
        description: ''
      });
    }
    setIsCompleting(false);
    setEvidenceData({});
    setNewComment("");
  }, [task]);

  // Fetch detailed task data
  const { data: detailedTask, isLoading } = useQuery<Task>({
    queryKey: ['/api/tasks', task?.id],
    enabled: isOpen && !!task?.id,
  });

  // Fetch playbook if task has one
  const { data: playbook } = useQuery<Playbook>({
    queryKey: ['/api/playbooks', task?.playbookKey],
    enabled: !!task?.playbookKey,
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (updates: Partial<Task>) => {
      if (!task?.id) throw new Error('No task to update');
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update task');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({ title: "Task updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update task", variant: "destructive" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: typeof newTaskData) => {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...taskData,
          type: 'reactive', // Manual tasks created through UI are reactive
          status: 'OPEN',
          dueAt: taskData.dueAt || null,
        }),
      });
      if (!response.ok) throw new Error('Failed to create task');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({ title: "Task created successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to create task", variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (comment: string) => {
      if (!task?.id) throw new Error('No task to add comment to');
      const response = await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: comment, authorId: 'current-user' }),
      });
      if (!response.ok) throw new Error('Failed to add comment');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', task?.id] });
      setNewComment("");
      toast({ title: "Comment added" });
    },
  });

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

  const getSLAStatus = () => {
    if (!task?.slaAt) return null;
    const now = new Date();
    const slaTime = new Date(task.slaAt);
    
    if (slaTime < now) return { type: 'breach', text: 'BREACHED', class: 'text-red-600' };
    
    const minutesRemaining = Math.floor((slaTime.getTime() - now.getTime()) / (1000 * 60));
    if (minutesRemaining <= 5) return { type: 'warning', text: `${minutesRemaining}m left`, class: 'text-yellow-600' };
    
    return { type: 'ok', text: `${minutesRemaining}m left`, class: 'text-green-600' };
  };

  const validateDoD = () => {
    if (!playbook?.content.definition_of_done) return true;
    
    const { required_fields, required_evidence } = playbook.content.definition_of_done;
    
    for (const field of required_fields) {
      if (!evidenceData[field] || evidenceData[field] === '') {
        return false;
      }
    }
    
    for (const evidence of required_evidence) {
      if (!evidenceData[evidence]) {
        return false;
      }
    }
    
    return true;
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === 'DONE' && playbook?.content.definition_of_done) {
      setIsCompleting(true);
    } else {
      updateTaskMutation.mutate({ status: newStatus });
    }
  };

  const handleCompleteWithEvidence = () => {
    if (!validateDoD()) {
      toast({ 
        title: "Missing required evidence", 
        description: "Please complete all required fields and evidence before marking as done.",
        variant: "destructive" 
      });
      return;
    }
    
    updateTaskMutation.mutate({ 
      status: 'DONE',
      evidence: { ...task?.evidence, ...evidenceData, completedAt: new Date() }
    });
    setIsCompleting(false);
    onClose();
  };

  const currentTask = detailedTask || task;
  const slaStatus = currentTask ? getSLAStatus() : null;

  const handleCreateTask = () => {
    if (!newTaskData.title || !newTaskData.category) {
      toast({ 
        title: "Missing required fields", 
        description: "Please enter a title and category",
        variant: "destructive" 
      });
      return;
    }
    createTaskMutation.mutate(newTaskData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="task-modal">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-xl mb-2">
                {isCreatingNew ? "Create New Task" : currentTask?.title || "Loading..."}
              </DialogTitle>
              {!isCreatingNew && currentTask && (
                <DialogDescription className="flex items-center space-x-4">
                  <Badge className={getStatusColor(currentTask.status)}>
                    {currentTask.status.replace('_', ' ')}
                  </Badge>
                  <span className="text-lg">{getPriorityIcon(currentTask.priority)}</span>
                  <span>{currentTask.category.replace(/\./g, ' → ')}</span>
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : isCreatingNew ? (
          <div className="space-y-6">
            {/* New Task Creation Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task-title">Title *</Label>
                <Input
                  id="task-title"
                  value={newTaskData.title}
                  onChange={(e) => setNewTaskData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter task title"
                  data-testid="input-task-title"
                />
              </div>
              
              <div>
                <Label htmlFor="task-category">Category *</Label>
                <Input
                  id="task-category"
                  value={newTaskData.category}
                  onChange={(e) => setNewTaskData(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="e.g., support.urgent"
                  data-testid="input-task-category"
                />
              </div>
              
              <div>
                <Label htmlFor="task-priority">Priority</Label>
                <Select value={newTaskData.priority.toString()} onValueChange={(value) => setNewTaskData(prev => ({ ...prev, priority: parseInt(value) }))}>
                  <SelectTrigger data-testid="select-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">🔴 High (1)</SelectItem>
                    <SelectItem value="2">🔴 High (2)</SelectItem>
                    <SelectItem value="3">🟡 Medium (3)</SelectItem>
                    <SelectItem value="4">🟢 Low (4)</SelectItem>
                    <SelectItem value="5">🟢 Low (5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="task-due">Due Date</Label>
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={newTaskData.dueAt}
                  onChange={(e) => setNewTaskData(prev => ({ ...prev, dueAt: e.target.value }))}
                  data-testid="input-task-due"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={newTaskData.description}
                onChange={(e) => setNewTaskData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Add task description..."
                rows={4}
                data-testid="textarea-task-description"
              />
            </div>
            
            <div className="flex items-center justify-end space-x-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreateTask}
                disabled={createTaskMutation.isPending || !newTaskData.title || !newTaskData.category}
                data-testid="button-create-task"
              >
                {createTaskMutation.isPending ? "Creating..." : "Create Task"}
              </Button>
            </div>
          </div>
        ) : currentTask ? (
          <div className="space-y-6">
            {/* Task Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Assignee:</span>
                <span className="font-medium">{currentTask.assignee?.name || 'Unassigned'}</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Due:</span>
                <span className="font-medium">
                  {currentTask.dueAt ? new Date(currentTask.dueAt).toLocaleDateString() : 'No due date'}
                </span>
              </div>
              
              {slaStatus && (
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">SLA:</span>
                  <span className={`font-medium ${slaStatus.class}`}>{slaStatus.text}</span>
                </div>
              )}
            </div>

            {currentTask.sourceUrl && (
              <div className="flex items-center space-x-2">
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
                <a 
                  href={currentTask.sourceUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                  data-testid="link-source"
                >
                  View source message
                </a>
              </div>
            )}

            <Separator />

            {/* Status Management */}
            <div className="flex items-center space-x-4">
              <Label>Update Status:</Label>
              <Select value={currentTask.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-48" data-testid="select-task-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="WAITING">Waiting</SelectItem>
                  <SelectItem value="BLOCKED">Blocked</SelectItem>
                  <SelectItem value="DONE">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Definition of Done Modal */}
            {isCompleting && playbook?.content.definition_of_done && (
              <div className="border border-border rounded-lg p-4 bg-muted/50">
                <h4 className="font-medium text-foreground mb-4 flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5" />
                  <span>Complete Task - Definition of Done</span>
                </h4>
                
                <div className="space-y-4">
                  {/* Required Fields */}
                  {playbook.content.definition_of_done.required_fields.length > 0 && (
                    <div>
                      <Label className="text-sm font-medium">Required Fields</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        {playbook.content.definition_of_done.required_fields.map((field) => (
                          <div key={field}>
                            <Label className="text-sm">{field.replace(/_/g, ' ')}</Label>
                            <Input
                              value={evidenceData[field] || ''}
                              onChange={(e) => setEvidenceData(prev => ({ ...prev, [field]: e.target.value }))}
                              placeholder={`Enter ${field.replace(/_/g, ' ')}`}
                              data-testid={`input-${field}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Required Evidence */}
                  {playbook.content.definition_of_done.required_evidence.length > 0 && (
                    <div>
                      <Label className="text-sm font-medium">Required Evidence</Label>
                      <div className="space-y-3 mt-2">
                        {playbook.content.definition_of_done.required_evidence.map((evidence) => (
                          <div key={evidence}>
                            <Label className="text-sm">{evidence.replace(/_/g, ' ')}</Label>
                            <div className="flex items-center space-x-2">
                              <Input
                                type="url"
                                value={evidenceData[evidence] || ''}
                                onChange={(e) => setEvidenceData(prev => ({ ...prev, [evidence]: e.target.value }))}
                                placeholder="URL or file reference"
                                data-testid={`input-evidence-${evidence}`}
                              />
                              <Button variant="outline" size="sm">
                                <Upload className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-6">
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Complete all required fields to mark as done</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Button variant="outline" onClick={() => setIsCompleting(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleCompleteWithEvidence}
                      disabled={!validateDoD()}
                      data-testid="button-complete-task"
                    >
                      Mark Complete
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Playbook Steps */}
            {playbook && !isCompleting && (
              <div>
                <h4 className="font-medium text-foreground mb-3 flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5" />
                  <span>Playbook Steps</span>
                </h4>
                <ol className="space-y-2">
                  {playbook.content.steps.map((step, index) => (
                    <li key={index} className="flex items-start space-x-3">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">
                        {index + 1}
                      </span>
                      <span className="text-sm text-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <Separator />

            {/* Comments Section */}
            <div>
              <h4 className="font-medium text-foreground mb-3 flex items-center space-x-2">
                <MessageSquare className="w-5 h-5" />
                <span>Comments ({currentTask.comments?.length || 0})</span>
              </h4>
              
              <div className="space-y-3">
                {currentTask.comments?.map((comment) => (
                  <div key={comment.id} className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">User</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{comment.body}</p>
                  </div>
                ))}
                
                <div className="flex space-x-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1"
                    data-testid="textarea-new-comment"
                  />
                  <Button 
                    onClick={() => addCommentMutation.mutate(newComment)}
                    disabled={!newComment.trim() || addCommentMutation.isPending}
                    data-testid="button-add-comment"
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {/* Audit Trail */}
            {currentTask.audits && currentTask.audits.length > 0 && (
              <div>
                <h4 className="font-medium text-foreground mb-3 flex items-center space-x-2">
                  <History className="w-5 h-5" />
                  <span>Activity History</span>
                </h4>
                <div className="space-y-2">
                  {currentTask.audits.slice(0, 5).map((audit) => (
                    <div key={audit.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{audit.action.replace(/_/g, ' ')}</span>
                      <span className="text-muted-foreground">
                        {new Date(audit.ts).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p>No task data available</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
