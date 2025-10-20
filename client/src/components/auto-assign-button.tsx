import { Button } from "@/components/ui/button";
import { Wand2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface AutoAssignButtonProps {
  taskId: string;
  onSuccess?: () => void;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
}

export function AutoAssignButton({ 
  taskId, 
  onSuccess, 
  size = 'sm',
  variant = 'outline'
}: AutoAssignButtonProps) {
  const [isAssigning, setIsAssigning] = useState(false);
  const queryClient = useQueryClient();

  const handleAutoAssign = async () => {
    setIsAssigning(true);
    try {
      const response = await fetch(\`/api/tasks/\${taskId}/auto-assign\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: {} }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to auto-assign');
      }

      const result = await response.json();
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/workloads'] });
      
      if (result.success) {
        alert(\`✅ Assigned to \${result.assigneeName}\\n\${result.reason}\`);
        onSuccess?.();
      }
    } catch (error: any) {
      alert(\`❌ Auto-assign failed: \${error.message}\`);
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleAutoAssign}
      disabled={isAssigning}
      className=\"gap-2\"
    >
      <Wand2 className=\"h-4 w-4\" />
      {isAssigning ? 'Assigning...' : 'Auto-Assign'}
    </Button>
  );
}
