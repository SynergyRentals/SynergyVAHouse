import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, BookOpen, Clock, AlertTriangle } from "lucide-react";

interface Playbook {
  id: string;
  key: string;
  category: string;
  content: {
    sla?: {
      first_response_minutes: number;
      breach_escalate_to: string;
    };
    definition_of_done?: {
      required_fields: string[];
      required_evidence: string[];
    };
    steps: string[];
    escalation?: {
      night_hours: string;
      route: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export default function Playbooks() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);

  const { data: playbooks, isLoading } = useQuery<Playbook[]>({
    queryKey: ['/api/playbooks'],
  });

  const filteredPlaybooks = playbooks?.filter(playbook => {
    const searchLower = searchTerm.toLowerCase();
    return playbook.key.toLowerCase().includes(searchLower) ||
           playbook.category.toLowerCase().includes(searchLower) ||
           playbook.content.steps.some(step => step.toLowerCase().includes(searchLower));
  }) || [];

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'reservations': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      'guest': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      'access': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      'internet': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      'cleaning': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
      'maintenance': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      'ota': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
      'inventory': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
    };
    
    const categoryPrefix = category.split('.')[0];
    return colors[categoryPrefix] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  };

  const formatCategoryName = (category: string) => {
    return category.split('.').map(part => 
      part.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    ).join(' → ');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading playbooks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Playbooks</h1>
            <p className="text-muted-foreground">Standard operating procedures and workflows</p>
          </div>
          <Button data-testid="button-create-playbook">
            <Plus className="w-4 h-4 mr-2" />
            New Playbook
          </Button>
        </div>

        {/* Search */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search playbooks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-playbooks"
              />
            </div>
          </CardContent>
        </Card>

        {filteredPlaybooks.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {searchTerm ? 'No playbooks found' : 'No playbooks available'}
              </h3>
              <p className="text-muted-foreground">
                {searchTerm 
                  ? 'Try adjusting your search terms.'
                  : 'Create your first playbook to standardize procedures.'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlaybooks.map((playbook) => (
              <Card 
                key={playbook.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedPlaybook(playbook)}
                data-testid={`playbook-card-${playbook.key}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between mb-2">
                    <Badge className={getCategoryColor(playbook.category)}>
                      {formatCategoryName(playbook.category)}
                    </Badge>
                    {playbook.content.sla && (
                      <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{playbook.content.sla.first_response_minutes}m SLA</span>
                      </div>
                    )}
                  </div>
                  <CardTitle className="text-lg">
                    {playbook.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </CardTitle>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Steps ({playbook.content.steps.length})</h4>
                    <ul className="space-y-1">
                      {playbook.content.steps.slice(0, 3).map((step, index) => (
                        <li key={index} className="text-sm text-muted-foreground flex items-start space-x-2">
                          <span className="text-xs bg-muted rounded-full w-4 h-4 flex items-center justify-center mt-0.5 flex-shrink-0">
                            {index + 1}
                          </span>
                          <span className="line-clamp-2">{step}</span>
                        </li>
                      ))}
                      {playbook.content.steps.length > 3 && (
                        <li className="text-xs text-muted-foreground italic">
                          +{playbook.content.steps.length - 3} more steps...
                        </li>
                      )}
                    </ul>
                  </div>

                  {playbook.content.definition_of_done && (
                    <div className="pt-3 border-t border-border">
                      <h4 className="text-sm font-medium text-foreground mb-2 flex items-center space-x-1">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Definition of Done</span>
                      </h4>
                      <div className="space-y-1">
                        {playbook.content.definition_of_done.required_fields.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {playbook.content.definition_of_done.required_fields.length} required fields
                          </div>
                        )}
                        {playbook.content.definition_of_done.required_evidence.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {playbook.content.definition_of_done.required_evidence.length} evidence items
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {playbook.content.sla && (
                    <div className="pt-3 border-t border-border">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">SLA Breach → </span>
                        <span className="font-medium">{playbook.content.sla.breach_escalate_to}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Playbook Detail Modal */}
        {selectedPlaybook && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl mb-2">
                      {selectedPlaybook.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </CardTitle>
                    <Badge className={getCategoryColor(selectedPlaybook.category)}>
                      {formatCategoryName(selectedPlaybook.category)}
                    </Badge>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedPlaybook(null)}
                    data-testid="button-close-playbook"
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent className="p-6 space-y-6">
                {/* SLA Information */}
                {selectedPlaybook.content.sla && (
                  <div>
                    <h3 className="text-lg font-medium text-foreground mb-3 flex items-center space-x-2">
                      <Clock className="w-5 h-5" />
                      <span>SLA Requirements</span>
                    </h3>
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">First Response Time:</span>
                        <span className="font-medium">{selectedPlaybook.content.sla.first_response_minutes} minutes</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Breach Escalation:</span>
                        <span className="font-medium">{selectedPlaybook.content.sla.breach_escalate_to}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Steps */}
                <div>
                  <h3 className="text-lg font-medium text-foreground mb-3">Execution Steps</h3>
                  <ol className="space-y-3">
                    {selectedPlaybook.content.steps.map((step, index) => (
                      <li key={index} className="flex items-start space-x-3">
                        <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">
                          {index + 1}
                        </span>
                        <span className="text-foreground">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Definition of Done */}
                {selectedPlaybook.content.definition_of_done && (
                  <div>
                    <h3 className="text-lg font-medium text-foreground mb-3 flex items-center space-x-2">
                      <AlertTriangle className="w-5 h-5" />
                      <span>Definition of Done</span>
                    </h3>
                    <div className="space-y-4">
                      {selectedPlaybook.content.definition_of_done.required_fields.length > 0 && (
                        <div>
                          <h4 className="font-medium text-foreground mb-2">Required Fields:</h4>
                          <ul className="space-y-1">
                            {selectedPlaybook.content.definition_of_done.required_fields.map((field, index) => (
                              <li key={index} className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-primary rounded-full"></div>
                                <span className="text-muted-foreground">{field.replace(/_/g, ' ')}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {selectedPlaybook.content.definition_of_done.required_evidence.length > 0 && (
                        <div>
                          <h4 className="font-medium text-foreground mb-2">Required Evidence:</h4>
                          <ul className="space-y-1">
                            {selectedPlaybook.content.definition_of_done.required_evidence.map((evidence, index) => (
                              <li key={index} className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-primary rounded-full"></div>
                                <span className="text-muted-foreground">{evidence.replace(/_/g, ' ')}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Escalation Rules */}
                {selectedPlaybook.content.escalation && (
                  <div>
                    <h3 className="text-lg font-medium text-foreground mb-3">Escalation Rules</h3>
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Night Hours:</span>
                        <span className="font-medium">{selectedPlaybook.content.escalation.night_hours}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Route To:</span>
                        <span className="font-medium">{selectedPlaybook.content.escalation.route}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
