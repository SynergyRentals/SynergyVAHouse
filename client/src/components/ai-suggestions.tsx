import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Brain, CheckCircle, X, ThumbsUp, ThumbsDown, Edit3, Zap } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface CategorySuggestion {
  category: string;
  confidence: number;
  reasoning: string;
}

interface PlaybookSuggestion {
  playbookKey: string;
  category: string;
  confidence: number;
  reasoning: string;
}

interface ResponseDraft {
  subject: string;
  content: string;
  tone: string;
  nextSteps: string[];
  requiresApproval: boolean;
}

interface AISuggestions {
  categorySuggestions: CategorySuggestion[];
  playbookSuggestions: PlaybookSuggestion[];
  responseDraft: ResponseDraft;
  confidence: number;
}

interface AISuggestionsWithMeta extends AISuggestions {
  suggestionId: string;
  status: string;
  slackApprovalTs?: string;
  approvedBy?: string;
  approvedAt?: Date;
}

interface AISuggestionRecord {
  id: string;
  taskId: string;
  type: string;
  suggestions: AISuggestions;
  appliedSuggestions?: any;
  confidence: number;
  status: string;
  approvedBy?: string;
  approvedAt?: Date;
  slackApprovalTs?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AISuggestionsProps {
  taskId?: string;
  taskTitle: string;
  taskDescription?: string;
  sourceContext?: string;
  onApplySuggestion?: (category?: string, playbookKey?: string) => void;
  onResponseDraftReady?: (draft: ResponseDraft) => void;
  onSuggestionGenerated?: (suggestionId: string) => void;
}

export function AISuggestions({
  taskId,
  taskTitle,
  taskDescription,
  sourceContext,
  onApplySuggestion,
  onResponseDraftReady,
  onSuggestionGenerated
}: AISuggestionsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<{
    category?: string;
    playbook?: string;
  }>({});
  const [responseFeedback, setResponseFeedback] = useState("");
  const [showResponseImprover, setShowResponseImprover] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Generate AI suggestions
  const { data: suggestions, isLoading: isGenerating, refetch: regenerateSuggestions, error: suggestionsError } = useQuery({
    queryKey: ['ai-suggestions', taskTitle, taskDescription, taskId],
    queryFn: async (): Promise<AISuggestionsWithMeta> => {
      const response = taskId 
        ? await apiRequest('POST', `/api/ai/suggest-for-task/${taskId}`, {
            actorId: 'web-user' // TODO: Get actual user ID from auth context
          })
        : await apiRequest('POST', '/api/ai/suggest-task', {
            taskTitle,
            taskDescription,
            sourceContext,
            taskId,
            actorId: 'web-user' // TODO: Get actual user ID from auth context
          });
      return response.json();
    },
    enabled: !!taskTitle,
    retry: (failureCount, error: any) => {
      // Don't retry if it's an OpenAI issue
      if (error?.status === 500 && error?.message?.includes('OpenAI')) {
        return false;
      }
      return failureCount < 2;
    }
  });

  // Get suggestion history for existing tasks
  const { data: suggestionHistory } = useQuery({
    queryKey: ['ai-suggestions-history', taskId],
    queryFn: async (): Promise<AISuggestionRecord[]> => {
      const response = await apiRequest('GET', `/api/ai/suggestions/${taskId}`);
      return response.json();
    },
    enabled: !!taskId
  });

  // Apply suggestions mutation
  const applySuggestionsMutation = useMutation({
    mutationFn: async ({ category, playbookKey }: { category?: string; playbookKey?: string }) => {
      if (!taskId) {
        // For new tasks, just call the callback
        onApplySuggestion?.(category, playbookKey);
        return;
      }
      
      return await apiRequest('POST', `/api/ai/apply-suggestions/${taskId}`, {
        category,
        playbookKey,
        actorId: 'web-user' // TODO: Get actual user ID from auth context
      });
    },
    onSuccess: () => {
      toast({
        title: "Suggestions Applied",
        description: "AI suggestions have been applied successfully.",
      });
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['/api/tasks', taskId] });
        queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to apply AI suggestions.",
        variant: "destructive",
      });
    }
  });

  // Link suggestion to task mutation
  const linkSuggestionMutation = useMutation({
    mutationFn: async ({ suggestionId, taskId }: { suggestionId: string; taskId: string }) => {
      const response = await apiRequest('PATCH', `/api/ai/suggestion/${suggestionId}/link`, {
        taskId,
        actorId: 'web-user' // TODO: Get actual user ID from auth context
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Suggestion Linked",
        description: "AI suggestion has been linked to the task successfully.",
      });
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['ai-suggestions-history', taskId] });
        queryClient.invalidateQueries({ queryKey: ['/api/tasks', taskId] });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to link AI suggestion to task.",
        variant: "destructive",
      });
    }
  });

  // Improve response draft mutation
  const improveResponseMutation = useMutation({
    mutationFn: async ({ originalDraft, feedback }: { originalDraft: string; feedback: string }): Promise<ResponseDraft> => {
      const response = await apiRequest('POST', '/api/ai/improve-response', {
        originalDraft,
        feedback,
        taskContext: `${taskTitle} - ${taskDescription || ''}`
      });
      return response.json();
    },
    onSuccess: (improvedDraft: ResponseDraft) => {
      toast({
        title: "Response Improved",
        description: "AI has improved the response draft based on your feedback.",
      });
      onResponseDraftReady?.(improvedDraft);
      setShowResponseImprover(false);
      setResponseFeedback("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to improve response draft.",
        variant: "destructive",
      });
    }
  });

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (confidence >= 0.6) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  };

  const handleApplySuggestions = () => {
    applySuggestionsMutation.mutate(selectedSuggestions);
  };

  const handleImproveResponse = () => {
    if (!suggestions?.responseDraft || !responseFeedback.trim()) return;
    
    improveResponseMutation.mutate({
      originalDraft: suggestions.responseDraft.content,
      feedback: responseFeedback
    });
  };

  useEffect(() => {
    if (suggestions?.responseDraft) {
      onResponseDraftReady?.(suggestions.responseDraft);
    }
  }, [suggestions?.responseDraft, onResponseDraftReady]);

  useEffect(() => {
    if (suggestions?.suggestionId && !taskId) {
      // For new tasks, call the callback to provide suggestion ID to parent
      onSuggestionGenerated?.(suggestions.suggestionId);
    }
  }, [suggestions?.suggestionId, taskId, onSuggestionGenerated]);

  // Function to manually link suggestion to task (exposed for external use)
  const linkToTask = (taskId: string) => {
    if (suggestions?.suggestionId) {
      linkSuggestionMutation.mutate({
        suggestionId: suggestions.suggestionId,
        taskId
      });
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'approved':
      case 'applied':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'rejected':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
      case 'applied':
        return <CheckCircle className="h-3 w-3" />;
      case 'pending':
        return <Brain className="h-3 w-3" />;
      case 'rejected':
        return <X className="h-3 w-3" />;
      default:
        return <Zap className="h-3 w-3" />;
    }
  };

  if (!taskTitle) return null;

  // Show error state for OpenAI issues
  if (suggestionsError && !isGenerating) {
    return (
      <Card className="border-red-200 dark:border-red-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <X className="h-4 w-4" />
            AI Suggestions Unavailable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            AI suggestions are currently unavailable. This could be due to OpenAI service issues or configuration problems.
          </p>
          <Button
            onClick={() => regenerateSuggestions()}
            variant="outline"
            size="sm"
            data-testid="button-retry-suggestions"
          >
            <Brain className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-purple-200 dark:border-purple-800">
      <CardHeader 
        className="cursor-pointer" 
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid="ai-suggestions-header"
      >
        <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
          <Brain className="h-5 w-5" />
          AI Suggestions
          {isGenerating && (
            <div className="animate-spin h-4 w-4 border-2 border-purple-600 border-t-transparent rounded-full" />
          )}
          {suggestions && (
            <>
              <Badge className={getConfidenceColor(suggestions.confidence)}>
                {Math.round(suggestions.confidence * 100)}% confident
              </Badge>
              {suggestions.status && (
                <Badge variant={getStatusBadgeVariant(suggestions.status)} className="flex items-center gap-1">
                  {getStatusIcon(suggestions.status)}
                  {suggestions.status}
                </Badge>
              )}
            </>
          )}
        </CardTitle>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6" data-testid="ai-suggestions-content">
          {isGenerating ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-center">
                <Zap className="h-8 w-8 mx-auto mb-2 text-purple-600 animate-pulse" />
                <p className="text-sm text-muted-foreground">AI is analyzing the task...</p>
              </div>
            </div>
          ) : suggestions ? (
            <>
              {/* Category Suggestions */}
              {suggestions.categorySuggestions.length > 0 && (
                <div>
                  <Label className="text-sm font-semibold">Category Suggestions</Label>
                  <div className="space-y-2 mt-2">
                    {suggestions.categorySuggestions.map((suggestion, index) => (
                      <div 
                        key={index}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedSuggestions.category === suggestion.category
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                            : 'border-gray-200 hover:border-purple-300 dark:border-gray-700'
                        }`}
                        onClick={() => setSelectedSuggestions(prev => ({
                          ...prev,
                          category: prev.category === suggestion.category ? undefined : suggestion.category
                        }))}
                        data-testid={`category-suggestion-${index}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{suggestion.category}</span>
                          <Badge className={getConfidenceColor(suggestion.confidence)}>
                            {Math.round(suggestion.confidence * 100)}%
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{suggestion.reasoning}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Playbook Suggestions */}
              {suggestions.playbookSuggestions.length > 0 && (
                <div>
                  <Label className="text-sm font-semibold">Playbook Suggestions</Label>
                  <div className="space-y-2 mt-2">
                    {suggestions.playbookSuggestions.map((suggestion, index) => (
                      <div 
                        key={index}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedSuggestions.playbook === suggestion.playbookKey
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                            : 'border-gray-200 hover:border-purple-300 dark:border-gray-700'
                        }`}
                        onClick={() => setSelectedSuggestions(prev => ({
                          ...prev,
                          playbook: prev.playbook === suggestion.playbookKey ? undefined : suggestion.playbookKey
                        }))}
                        data-testid={`playbook-suggestion-${index}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium">{suggestion.playbookKey}</span>
                            <div className="text-xs text-muted-foreground">{suggestion.category}</div>
                          </div>
                          <Badge className={getConfidenceColor(suggestion.confidence)}>
                            {Math.round(suggestion.confidence * 100)}%
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{suggestion.reasoning}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestion Status Information */}
              {suggestions.status && suggestions.status !== 'generated' && (
                <div className="p-3 border rounded-lg bg-muted/50" data-testid="suggestion-status-info">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(suggestions.status)}
                    <span className="font-medium capitalize">{suggestions.status}</span>
                    {suggestions.approvedBy && (
                      <span className="text-sm text-muted-foreground">
                        by {suggestions.approvedBy}
                      </span>
                    )}
                    {suggestions.approvedAt && (
                      <span className="text-sm text-muted-foreground">
                        {new Date(suggestions.approvedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {suggestions.slackApprovalTs && (
                    <p className="text-xs text-muted-foreground">
                      Slack approval workflow active
                    </p>
                  )}
                </div>
              )}

              {/* Apply Suggestions Button */}
              {(selectedSuggestions.category || selectedSuggestions.playbook) && 
               suggestions.status !== 'applied' && suggestions.status !== 'rejected' && (
                <Button
                  onClick={handleApplySuggestions}
                  disabled={applySuggestionsMutation.isPending}
                  className="w-full"
                  data-testid="apply-suggestions-button"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Apply Selected Suggestions
                </Button>
              )}

              <Separator />

              {/* Response Draft */}
              {suggestions.responseDraft && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-semibold">AI Response Draft</Label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowResponseImprover(!showResponseImprover)}
                        data-testid="improve-response-button"
                      >
                        <Edit3 className="h-4 w-4 mr-1" />
                        Improve
                      </Button>
                      {suggestions.responseDraft.requiresApproval && (
                        <Badge variant="destructive" data-testid="approval-required-badge">
                          Approval Required
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Subject</Label>
                      <p className="text-sm font-medium">{suggestions.responseDraft.subject}</p>
                    </div>
                    
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Response</Label>
                      <p className="text-sm whitespace-pre-wrap">{suggestions.responseDraft.content}</p>
                    </div>

                    <div className="flex gap-4">
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground">Tone</Label>
                        <Badge variant="outline">{suggestions.responseDraft.tone}</Badge>
                      </div>
                    </div>

                    {suggestions.responseDraft.nextSteps.length > 0 && (
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground">Next Steps</Label>
                        <ul className="text-sm space-y-1 mt-1">
                          {suggestions.responseDraft.nextSteps.map((step, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <span className="text-muted-foreground">•</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Response Improvement Section */}
                  {showResponseImprover && (
                    <div className="space-y-3 mt-4 p-4 border rounded-lg">
                      <Label className="text-sm font-semibold">Improve Response</Label>
                      <Textarea
                        placeholder="Provide feedback on how to improve this response..."
                        value={responseFeedback}
                        onChange={(e) => setResponseFeedback(e.target.value)}
                        className="min-h-[80px]"
                        data-testid="response-feedback-input"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleImproveResponse}
                          disabled={!responseFeedback.trim() || improveResponseMutation.isPending}
                          size="sm"
                          data-testid="submit-improvement-button"
                        >
                          <ThumbsUp className="h-4 w-4 mr-1" />
                          Improve Response
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowResponseImprover(false);
                            setResponseFeedback("");
                          }}
                          data-testid="cancel-improvement-button"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Suggestion History */}
              {suggestionHistory && suggestionHistory.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-sm font-semibold">Suggestion History</Label>
                    <div className="space-y-2 mt-2" data-testid="suggestion-history">
                      {suggestionHistory.slice(0, 3).map((record, index) => (
                        <div 
                          key={record.id}
                          className="p-2 border rounded text-sm"
                          data-testid={`suggestion-history-${index}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(record.status)}
                              <span className="font-medium">{record.type}</span>
                              <Badge variant={getStatusBadgeVariant(record.status)} className="text-xs">
                                {record.status}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(record.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {record.confidence}% confidence
                            {record.approvedBy && ` • Approved by ${record.approvedBy}`}
                          </div>
                        </div>
                      ))}
                      {suggestionHistory.length > 3 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{suggestionHistory.length - 3} more suggestions
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Regenerate Button */}
              <Button
                variant="outline"
                onClick={() => regenerateSuggestions()}
                className="w-full"
                data-testid="regenerate-suggestions-button"
              >
                <Zap className="h-4 w-4 mr-2" />
                Regenerate Suggestions
              </Button>
            </>
          ) : (
            <div className="text-center p-4">
              <p className="text-sm text-muted-foreground">No suggestions available</p>
              <Button
                variant="outline"
                onClick={() => regenerateSuggestions()}
                className="mt-2"
                data-testid="generate-suggestions-button"
              >
                <Brain className="h-4 w-4 mr-2" />
                Generate Suggestions
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}