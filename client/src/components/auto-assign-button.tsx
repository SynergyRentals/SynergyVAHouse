import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Zap, CheckCircle2, AlertCircle } from "lucide-react";

interface AutoAssignButtonProps {
  taskId: string;
  /** @deprecated Use onAssigned instead */
  onSuccess?: () => void;
  onAssigned?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
}

export function AutoAssignButton({ 
  taskId, 
  onSuccess,
  onAssigned, 
  disabled = false,
  size = 'sm',
  variant = 'outline'
}: AutoAssignButtonProps) {
  const [isAssigning, setIsAssigning] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleAutoAssign = async () => {
    setIsAssigning(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/auto-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: {} }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to auto-assign');
      }

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Task Assigned Successfully",
          description: (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="font-medium">{result.assigneeName}</span>
              </div>
              <p className="text-sm text-muted-foreground">{result.reason}</p>
              {result.alternatives && result.alternatives.length > 0 && (
                <div className="mt-2 pt-2 border-t">
                  <p className="text-xs text-muted-foreground">Other options:</p>
                  {result.alternatives.map((alt: any, idx: number) => (
                    <p key={idx} className="text-xs">{alt.name}: {alt.reason}</p>
                  ))}
                </div>
              )}
            </div>
          ),
        });
        
        queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
        queryClient.invalidateQueries({ queryKey: ['/api/tasks/workloads'] });
        queryClient.invalidateQueries({ queryKey: ['/api/tasks/recommendations'] });
        queryClient.invalidateQueries({ queryKey: ['/api/tasks/workload-summary'] });
        
        // Call both callbacks for backward compatibility
        onAssigned?.();
        onSuccess?.();
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Assignment Failed",
        description: error.message,
      });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={size}
            variant={variant}
            onClick={handleAutoAssign}
            disabled={disabled || isAssigning}
            className="gap-2"
            data-testid={`button-auto-assign-${taskId}`}
          >
            {isAssigning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Auto-Assign
              </>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Automatically assign to best-available VA</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface BulkAutoAssignButtonProps {
  taskIds: string[];
  onCompleted?: (results: { successful: number; failed: number }) => void;
  disabled?: boolean;
}

export function BulkAutoAssignButton({ 
  taskIds, 
  onCompleted,
  disabled = false
}: BulkAutoAssignButtonProps) {
  const [isAssigning, setIsAssigning] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleBulkAssign = async () => {
    setIsAssigning(true);
    try {
      const response = await fetch('/api/tasks/batch-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to batch assign');
      }

      const data = await response.json();
      const results = data.results || [];
      const successful = results.filter((r: any) => r.success).length;
      const failed = results.length - successful;

      toast({
        title: "Bulk Assignment Complete",
        description: (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>{successful} tasks assigned successfully</span>
            </div>
            {failed > 0 && (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span>{failed} tasks failed</span>
              </div>
            )}
          </div>
        ),
      });

      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/workloads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/workload-summary'] });
      onCompleted?.({ successful, failed });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Bulk Assignment Failed",
        description: error.message,
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const isDisabled = disabled || taskIds.length === 0 || isAssigning;

  return (
    <Button
      variant="default"
      onClick={handleBulkAssign}
      disabled={isDisabled}
      className="gap-2"
      data-testid="button-bulk-auto-assign"
    >
      {isAssigning ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Assigning...
        </>
      ) : (
        <>
          <Zap className="h-4 w-4" />
          Auto-Assign Selected ({taskIds.length})
        </>
      )}
    </Button>
  );
}

interface CapacityBadgeProps {
  capacityScore: number;
  size?: 'sm' | 'default';
  showLabel?: boolean;
}

export function CapacityBadge({ 
  capacityScore, 
  size = 'default',
  showLabel = false 
}: CapacityBadgeProps) {
  const getVariant = (score: number): 'default' | 'secondary' | 'destructive' => {
    if (score >= 80) return 'default';
    if (score >= 50) return 'secondary';
    return 'destructive';
  };

  const getColor = (score: number): string => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getExplanation = (score: number): string => {
    if (score >= 80) return 'High capacity - ready for new tasks';
    if (score >= 50) return 'Moderate capacity - some availability';
    return 'Low capacity - near or at limit';
  };

  const variant = getVariant(capacityScore);
  const dotColor = getColor(capacityScore);
  const explanation = getExplanation(capacityScore);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={variant}
            className={`gap-1.5 ${size === 'sm' ? 'text-xs px-2 py-0.5' : ''}`}
            data-testid={`badge-capacity-${capacityScore}`}
          >
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            {showLabel && <span>Capacity: </span>}
            <span className="font-medium">{capacityScore}/100</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">Current capacity: {capacityScore}/100</p>
            <p className="text-xs text-muted-foreground">{explanation}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
