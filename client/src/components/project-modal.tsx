import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { safeText } from "@/lib/utils";
import { insertProjectSchema } from "@shared/schema";
import { Calendar, User, Target } from "lucide-react";

// Form schema for project creation
const projectFormSchema = insertProjectSchema.extend({
  startAt: z.string().optional(),
  targetAt: z.string().optional(),
}).refine((data) => {
  if (data.startAt && data.targetAt) {
    const start = new Date(data.startAt);
    const target = new Date(data.targetAt);
    return target >= start;
  }
  return true;
}, {
  message: "Target date must be after start date",
  path: ["targetAt"],
});

type ProjectFormData = z.infer<typeof projectFormSchema>;

interface User {
  id: string;
  name: string;
  role: string;
}

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectModal({ isOpen, onClose }: ProjectModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch users for owner selection
  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users'],
    enabled: isOpen,
  });

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      title: "",
      scope: "",
      status: "planning",
      startAt: "",
      targetAt: "",
      ownerId: "",
    },
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      form.reset({
        title: "",
        scope: "",
        status: "planning",
        startAt: "",
        targetAt: "",
        ownerId: "",
      });
    }
  }, [isOpen, form]);

  const createProjectMutation = useMutation({
    mutationFn: async (projectData: ProjectFormData) => {
      // Transform date strings to Date objects or null
      const transformedData = {
        ...projectData,
        startAt: projectData.startAt ? new Date(projectData.startAt).toISOString() : undefined,
        targetAt: projectData.targetAt ? new Date(projectData.targetAt).toISOString() : undefined,
        ownerId: projectData.ownerId && projectData.ownerId !== "none" ? projectData.ownerId : undefined,
      };

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transformedData),
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
        
        throw new Error(errorData.error || errorData.message || 'Failed to create project');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ 
        title: "Project created successfully",
        description: "Your new project has been added to the system."
      });
      onClose();
      form.reset();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to create project", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const onSubmit = (data: ProjectFormData) => {
    createProjectMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100vw-2rem)] w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6" data-testid="project-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Target className="w-5 h-5" />
            <span>Create New Project</span>
          </DialogTitle>
          <DialogDescription>
            Create a new project to organize and track your team's work.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => {
                  const titleLength = field.value?.length || 0;
                  return (
                    <FormItem className="md:col-span-2">
                      <div className="flex items-center justify-between">
                        <FormLabel>Project Title *</FormLabel>
                        <span className={`text-xs ${
                          titleLength > 180 
                            ? 'text-red-600' 
                            : titleLength > 160 
                              ? 'text-yellow-600' 
                              : 'text-muted-foreground'
                        }`}>
                          {titleLength}/200
                        </span>
                      </div>
                      <FormControl>
                        <Input
                          placeholder="Enter project title (max 200 chars)"
                          data-testid="input-project-title"
                          maxLength={200}
                          className={titleLength > 180 ? 'border-red-300 focus:border-red-500' : ''}
                          {...field}
                          onChange={(e) => {
                            if (e.target.value.length <= 200) {
                              field.onChange(e.target.value)
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )
                }}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-project-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="planning">Planning</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-project-owner">
                          <SelectValue placeholder="Select owner" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No owner</SelectItem>
                        {users?.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {safeText(user.name)} ({safeText(user.role)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center space-x-1">
                      <Calendar className="w-4 h-4" />
                      <span>Start Date</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        data-testid="input-project-start-date"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="targetAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center space-x-1">
                      <Target className="w-4 h-4" />
                      <span>Target Date</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        data-testid="input-project-target-date"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => {
                const scopeLength = field.value?.length || 0;
                return (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Project Scope *</FormLabel>
                      <span className={`text-xs ${
                        scopeLength > 450 
                          ? 'text-red-600' 
                          : scopeLength > 400 
                            ? 'text-yellow-600' 
                            : 'text-muted-foreground'
                      }`}>
                        {scopeLength}/500
                      </span>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the project scope, objectives, and deliverables... (max 500 chars)"
                        rows={4}
                        data-testid="textarea-project-scope"
                        maxLength={500}
                        className={scopeLength > 450 ? 'border-red-300 focus:border-red-500' : ''}
                        {...field}
                        onChange={(e) => {
                          if (e.target.value.length <= 500) {
                            field.onChange(e.target.value)
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />

            <div className="flex items-center justify-end space-x-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createProjectMutation.isPending}
                data-testid="button-create-project-submit"
              >
                {createProjectMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}