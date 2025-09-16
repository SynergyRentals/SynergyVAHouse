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
import { safeText, urlSafeHref } from "@/lib/utils";
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
import { AISuggestions } from "./ai-suggestions";

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
  dodSchema?: any;
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
  const [showAdminOverride, setShowAdminOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [selectedAdminUser, setSelectedAdminUser] = useState('');
  const [dodValidation, setDodValidation] = useState<any>(null);
  const [newTaskData, setNewTaskData] = useState({
    title: '',
    category: '',
    priority: 3,
    assigneeId: '',
    dueAt: '',
    description: '',
    playbookKey: ''
  });
  const [currentSuggestionId, setCurrentSuggestionId] = useState<string | null>(null);
  
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
        description: '',
        playbookKey: ''
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

  // Fetch all users for admin override
  const { data: users } = useQuery<Array<{id: string, name: string, role: string}>>(
    { queryKey: ['/api/users'] }
  );

  // Get manager users for admin override
  const managerUsers = users?.filter(user => user.role.toLowerCase().includes('manager')) || [];

  const updateTaskMutation = useMutation({
    mutationFn: async (updates: Partial<Task>) => {
      if (!task?.id) throw new Error('No task to update');
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        
        // If it's a validation error with field-specific errors, include that information
        if (errorData.fieldErrors && typeof errorData.fieldErrors === 'object') {
          const fieldErrorMessages = Object.entries(errorData.fieldErrors)
            .map(([field, message]) => `${field}: ${message}`)
            .join('\n');
          
          const fullMessage = `${errorData.message || 'Validation failed'}\n\nField errors:\n${fieldErrorMessages}`;
          throw new Error(fullMessage);
        }
        
        throw new Error(errorData.error || errorData.message || 'Failed to update task');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({ title: "Task updated successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update task", 
        description: error.message,
        variant: "destructive" 
      });
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
      
      if (!response.ok) {
        const errorData = await response.json();
        
        // If it's a validation error with field-specific errors, include that information
        if (errorData.fieldErrors && typeof errorData.fieldErrors === 'object') {
          const fieldErrorMessages = Object.entries(errorData.fieldErrors)
            .map(([field, message]) => `${field}: ${message}`)
            .join('\n');
          
          const fullMessage = `${errorData.message || 'Validation failed'}\n\nField errors:\n${fieldErrorMessages}`;
          throw new Error(fullMessage);
        }
        
        throw new Error(errorData.error || errorData.message || 'Failed to create task');
      }
      
      return response.json();
    },
    onSuccess: async (createdTask) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({ title: "Task created successfully" });
      
      // If there's a suggestion ID, link it to the created task
      if (currentSuggestionId) {
        try {
          const response = await fetch(`/api/ai/suggestion/${currentSuggestionId}/link`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: createdTask.id,
              actorId: 'web-user' // TODO: Get actual user ID from auth context
            }),
          });
          
          if (response.ok) {
            toast({
              title: "AI Suggestion Linked",
              description: "AI suggestions have been linked to the task successfully.",
            });
          } else {
            console.error('Failed to link suggestion to task');
          }
        } catch (error) {
          console.error('Error linking suggestion to task:', error);
        }
      }
      
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

  // Real-time DoD validation using API
  const validateDoDMutation = useMutation({
    mutationFn: async (evidence: any) => {
      if (!task?.id) throw new Error('No task to validate');
      const response = await fetch(`/api/tasks/${task.id}/validate-dod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evidence),
      });
      if (!response.ok) throw new Error('Failed to validate DoD');
      return response.json();
    },
    onSuccess: (validation) => {
      setDodValidation(validation);
    },
  });

  // Legacy validateDoD function for compatibility
  const validateDoD = () => {
    if (dodValidation) return dodValidation.valid;
    if (!currentTask?.dodSchema && !playbook?.content.definition_of_done) return true;
    
    const dod = currentTask?.dodSchema || playbook?.content.definition_of_done;
    if (!dod) return true;
    
    const { required_fields = [], required_evidence = [] } = dod;
    
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

  // Update evidence and validate in real-time
  const updateEvidence = (key: string, value: any) => {
    const newEvidenceData = { ...evidenceData, [key]: value };
    setEvidenceData(newEvidenceData);
    
    // Trigger real-time validation
    if (task?.id) {
      validateDoDMutation.mutate(newEvidenceData);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === 'DONE' && (currentTask?.dodSchema || playbook?.content.definition_of_done)) {
      setIsCompleting(true);
      // Initialize evidence data from existing task evidence
      if (currentTask?.evidence) {
        setEvidenceData(currentTask.evidence);
      }
      // Trigger initial validation
      if (task?.id) {
        validateDoDMutation.mutate(currentTask?.evidence || {});
      }
    } else {
      updateTaskMutation.mutate({ status: newStatus });
    }
  };

  const handleCompleteWithEvidence = () => {
    if (!validateDoD() && !showAdminOverride) {
      toast({ 
        title: "Missing required evidence", 
        description: "Please complete all required fields and evidence before marking as done.",
        variant: "destructive" 
      });
      return;
    }
    
    // Prepare update data
    const updateData: any = {
      status: 'DONE',
      evidence: { ...task?.evidence, ...evidenceData, completedAt: new Date() }
    };
    
    // Add admin override data if needed
    if (showAdminOverride && !validateDoD()) {
      if (!overrideReason.trim()) {
        toast({ 
          title: "Override reason required", 
          description: "Please provide a reason for the admin override.",
          variant: "destructive" 
        });
        return;
      }
      
      if (!selectedAdminUser) {
        toast({ 
          title: "Admin user required", 
          description: "Please select a manager to authorize the override.",
          variant: "destructive" 
        });
        return;
      }
      
      updateData.adminOverride = true;
      updateData.overrideReason = overrideReason;
      updateData.overrideUserId = selectedAdminUser;
    }
    
    updateTaskMutation.mutate(updateData);
    setIsCompleting(false);
    setShowAdminOverride(false);
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
                {isCreatingNew ? "Create New Task" : safeText(currentTask?.title) || "Loading..."}
              </DialogTitle>
              {!isCreatingNew && currentTask && (
                <DialogDescription className="flex items-center space-x-4">
                  <Badge className={getStatusColor(currentTask.status)}>
                    {currentTask.status.replace('_', ' ')}
                  </Badge>
                  <span className="text-lg">{getPriorityIcon(currentTask.priority)}</span>
                  <span>{safeText(currentTask.category).replace(/\./g, ' → ')}</span>
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
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="task-title">Title *</Label>
                  <span className={`text-xs ${
                    newTaskData.title.length > 180 
                      ? 'text-red-600' 
                      : newTaskData.title.length > 160 
                        ? 'text-yellow-600' 
                        : 'text-muted-foreground'
                  }`}>
                    {newTaskData.title.length}/200
                  </span>
                </div>
                <Input
                  id="task-title"
                  value={newTaskData.title}
                  onChange={(e) => {
                    if (e.target.value.length <= 200) {
                      setNewTaskData(prev => ({ ...prev, title: e.target.value }))
                    }
                  }}
                  maxLength={200}
                  placeholder="Enter task title (max 200 chars)"
                  className={newTaskData.title.length > 180 ? 'border-red-300 focus:border-red-500' : ''}
                  data-testid="input-task-title"
                />
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="task-category">Category *</Label>
                  <span className={`text-xs ${
                    newTaskData.category.length > 90 
                      ? 'text-red-600' 
                      : newTaskData.category.length > 80 
                        ? 'text-yellow-600' 
                        : 'text-muted-foreground'
                  }`}>
                    {newTaskData.category.length}/100
                  </span>
                </div>
                <Input
                  id="task-category"
                  value={newTaskData.category}
                  onChange={(e) => {
                    if (e.target.value.length <= 100) {
                      setNewTaskData(prev => ({ ...prev, category: e.target.value }))
                    }
                  }}
                  maxLength={100}
                  placeholder="e.g., support.urgent (max 100 chars)"
                  className={newTaskData.category.length > 90 ? 'border-red-300 focus:border-red-500' : ''}
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
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="task-description">Description</Label>
                <span className={`text-xs ${
                  newTaskData.description.length > 450 
                    ? 'text-red-600' 
                    : newTaskData.description.length > 400 
                      ? 'text-yellow-600' 
                      : 'text-muted-foreground'
                }`}>
                  {newTaskData.description.length}/500
                </span>
              </div>
              <Textarea
                id="task-description"
                value={newTaskData.description}
                onChange={(e) => {
                  if (e.target.value.length <= 500) {
                    setNewTaskData(prev => ({ ...prev, description: e.target.value }))
                  }
                }}
                maxLength={500}
                placeholder="Add task description... (max 500 chars)"
                rows={4}
                className={newTaskData.description.length > 450 ? 'border-red-300 focus:border-red-500' : ''}
                data-testid="textarea-task-description"
              />
            </div>

            {/* AI Suggestions for New Task */}
            {newTaskData.title.trim() && (
              <AISuggestions
                taskTitle={newTaskData.title}
                taskDescription={newTaskData.description}
                sourceContext="manual_creation"
                onApplySuggestion={(category, playbookKey) => {
                  setNewTaskData(prev => ({
                    ...prev,
                    category: category || prev.category,
                    playbookKey: playbookKey || prev.playbookKey || ''
                  }));
                }}
                onResponseDraftReady={(draft) => {
                  // Store response draft for later use
                  console.log('Response draft ready:', draft);
                }}
                onSuggestionGenerated={(suggestionId) => {
                  setCurrentSuggestionId(suggestionId);
                }}
              />
            )}
            
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
                <span className="font-medium">{safeText(currentTask.assignee?.name) || 'Unassigned'}</span>
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

            {(() => {
              const safeUrl = urlSafeHref(currentTask.sourceUrl);
              return safeUrl && (
                <div className="flex items-center space-x-2">
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  <a 
                    href={safeUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                    data-testid="link-source"
                  >
                    View source message
                  </a>
                </div>
              );
            })()}

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

            {/* Enhanced Definition of Done Modal */}
            {isCompleting && (currentTask?.dodSchema || playbook?.content.definition_of_done) && (
              <div className="border border-border rounded-lg p-6 bg-muted/50 space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-foreground flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5" />
                    <span>Complete Task - Definition of Done</span>
                  </h4>
                  {dodValidation && (
                    <div className={`flex items-center space-x-2 text-sm ${
                      dodValidation.valid ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {dodValidation.valid ? '✓ All requirements met' : `⚠ ${(dodValidation.missingFields?.length || 0) + (dodValidation.missingEvidence?.length || 0)} missing`}
                    </div>
                  )}
                </div>
                
                {/* DoD Requirements from task dodSchema or playbook */}
                {(() => {
                  const dod = currentTask?.dodSchema || playbook?.content.definition_of_done;
                  if (!dod) return null;
                  
                  return (
                    <div className="space-y-6">
                      {/* Required Fields */}
                      {dod.required_fields && dod.required_fields.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium mb-3 block">Required Fields</Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {dod.required_fields.map((field: string) => {
                              const isFieldMissing = dodValidation?.missingFields?.includes(field);
                              return (
                                <div key={field} className={`space-y-2 ${isFieldMissing ? 'border-l-2 border-red-400 pl-3' : ''}`}>
                                  <Label className={`text-sm flex items-center space-x-2 ${
                                    isFieldMissing ? 'text-red-600' : 'text-foreground'
                                  }`}>
                                    {isFieldMissing ? '⚠' : evidenceData[field] ? '✓' : '○'}
                                    <span>{field.replace(/_/g, ' ')}</span>
                                  </Label>
                                  <Input
                                    value={evidenceData[field] || ''}
                                    onChange={(e) => updateEvidence(field, e.target.value)}
                                    placeholder={`Enter ${field.replace(/_/g, ' ')}`}
                                    className={isFieldMissing ? 'border-red-400' : ''}
                                    data-testid={`input-dod-${field}`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Required Evidence */}
                      {dod.required_evidence && dod.required_evidence.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium mb-3 block">Required Evidence</Label>
                          <div className="space-y-4">
                            {dod.required_evidence.map((evidenceType: string) => {
                              const isEvidenceMissing = dodValidation?.missingEvidence?.includes(evidenceType);
                              const evidenceValue = evidenceData[evidenceType];
                              
                              return (
                                <div key={evidenceType} className={`space-y-2 ${isEvidenceMissing ? 'border-l-2 border-red-400 pl-3' : ''}`}>
                                  <Label className={`text-sm flex items-center space-x-2 ${
                                    isEvidenceMissing ? 'text-red-600' : 'text-foreground'
                                  }`}>
                                    {isEvidenceMissing ? '⚠' : evidenceValue ? '✓' : '○'}
                                    <span>{evidenceType.replace(/_/g, ' ')}</span>
                                  </Label>
                                  <div className="space-y-2">
                                    <div className="flex items-center space-x-2">
                                      <Input
                                        type="url"
                                        value={evidenceValue?.url || ''}
                                        onChange={(e) => updateEvidence(evidenceType, { 
                                          ...evidenceValue, 
                                          url: e.target.value 
                                        })}
                                        placeholder={`URL for ${evidenceType.replace(/_/g, ' ')}`}
                                        className={isEvidenceMissing ? 'border-red-400' : ''}
                                        data-testid={`input-evidence-${evidenceType}-url`}
                                      />
                                      <Button variant="outline" size="sm">
                                        <Upload className="w-4 h-4" />
                                      </Button>
                                    </div>
                                    <Textarea
                                      value={evidenceValue?.notes || ''}
                                      onChange={(e) => updateEvidence(evidenceType, { 
                                        ...evidenceValue, 
                                        notes: e.target.value 
                                      })}
                                      placeholder={`Notes for ${evidenceType.replace(/_/g, ' ')}`}
                                      rows={2}
                                      className={isEvidenceMissing ? 'border-red-400' : ''}
                                      data-testid={`textarea-evidence-${evidenceType}-notes`}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Validation Status & Admin Override */}
                <div className="space-y-4">
                  {dodValidation && !dodValidation.valid && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h5 className="font-medium text-red-800 dark:text-red-300 mb-2">Requirements Not Met</h5>
                          <div className="space-y-1 text-sm text-red-700 dark:text-red-400">
                            {dodValidation.missingFields?.map((field: string) => (
                              <div key={field}>• Missing field: {field.replace(/_/g, ' ')}</div>
                            ))}
                            {dodValidation.missingEvidence?.map((evidence: string) => (
                              <div key={evidence}>• Missing evidence: {evidence.replace(/_/g, ' ')}</div>
                            ))}
                          </div>
                          {managerUsers.length > 0 && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="mt-3"
                              onClick={() => setShowAdminOverride(!showAdminOverride)}
                              data-testid="button-toggle-admin-override"
                            >
                              {showAdminOverride ? 'Cancel Override' : 'Admin Override'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Admin Override Panel */}
                  {showAdminOverride && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 space-y-4">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                        <h5 className="font-medium text-yellow-800 dark:text-yellow-300">Manager Override Required</h5>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-medium">Select Manager</Label>
                          <Select value={selectedAdminUser} onValueChange={setSelectedAdminUser}>
                            <SelectTrigger data-testid="select-admin-user">
                              <SelectValue placeholder="Choose manager..." />
                            </SelectTrigger>
                            <SelectContent>
                              {managerUsers.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {safeText(user.name)} ({safeText(user.role)})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label className="text-sm font-medium">Override Reason *</Label>
                          <Input
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="Reason for override..."
                            data-testid="input-override-reason"
                          />
                        </div>
                      </div>
                      
                      <p className="text-sm text-yellow-700 dark:text-yellow-400">
                        ⚠ This will complete the task without meeting DoD requirements and will be logged in the audit trail.
                      </p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    {validateDoDMutation.isPending ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div> Validating...</>
                    ) : dodValidation?.valid ? (
                      <><CheckCircle className="w-4 h-4 text-green-600" /> All requirements completed</>
                    ) : (
                      <><AlertTriangle className="w-4 h-4" /> Complete requirements or use admin override</>
                    )}
                  </div>
                  <div className="flex items-center space-x-3">
                    <Button variant="outline" onClick={() => {
                      setIsCompleting(false);
                      setShowAdminOverride(false);
                      setOverrideReason('');
                      setSelectedAdminUser('');
                    }}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleCompleteWithEvidence}
                      disabled={!validateDoD() && (!showAdminOverride || !overrideReason || !selectedAdminUser)}
                      data-testid="button-complete-task"
                      className={showAdminOverride && !validateDoD() ? 'bg-yellow-600 hover:bg-yellow-700' : ''}
                    >
                      {updateTaskMutation.isPending ? 'Completing...' : 
                       showAdminOverride && !validateDoD() ? 'Complete with Override' : 
                       'Mark Complete'}
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
                      <span className="text-sm text-foreground">{safeText(step)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* AI Suggestions for Existing Task */}
            <AISuggestions
              taskId={currentTask.id}
              taskTitle={safeText(currentTask.title)}
              taskDescription={currentTask.comments?.map(c => safeText(c.body)).join(' ') || ''}
              sourceContext={currentTask.sourceUrl ? 'external_request' : 'internal_task'}
              onApplySuggestion={() => {
                // Refresh task data after AI suggestions are applied
                queryClient.invalidateQueries({ queryKey: ['/api/tasks', currentTask.id] });
                queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
              }}
              onResponseDraftReady={(draft) => {
                // Store response draft for later use
                console.log('Response draft ready for task:', draft);
              }}
            />

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
                    <p className="text-sm text-foreground">{safeText(comment.body)}</p>
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
