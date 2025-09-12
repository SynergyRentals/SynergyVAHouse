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

interface AISuggestionsProps {
  taskId?: string;
  taskTitle: string;
  taskDescription?: string;
  sourceContext?: string;
  onApplySuggestion?: (category?: string, playbookKey?: string) => void;
  onResponseDraftReady?: (draft: ResponseDraft) => void;
}

export function AISuggestions({
  taskId,
  taskTitle,
  taskDescription,
  sourceContext,
  onApplySuggestion,
  onResponseDraftReady
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
  const { data: suggestions, isLoading: isGenerating, refetch: regenerateSuggestions } = useQuery({
    queryKey: ['ai-suggestions', taskTitle, taskDescription],
    queryFn: async (): Promise<AISuggestions> => {
      const response = taskId 
        ? await apiRequest('POST', `/api/ai/suggest-for-task/${taskId}`, {})
        : await apiRequest('POST', '/api/ai/suggest-task', {
            taskTitle,
            taskDescription,
            sourceContext
          });
      return response.json();
    },
    enabled: !!taskTitle
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
        actorId: 'current-user' // TODO: Get actual user ID
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

  if (!taskTitle) return null;

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
            <Badge className={getConfidenceColor(suggestions.confidence)}>
              {Math.round(suggestions.confidence * 100)}% confident
            </Badge>
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

              {/* Apply Suggestions Button */}
              {(selectedSuggestions.category || selectedSuggestions.playbook) && (
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