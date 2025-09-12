import OpenAI from "openai";
import { storage } from "../storage";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export interface CategorySuggestion {
  category: string;
  confidence: number;
  reasoning: string;
}

export interface PlaybookSuggestion {
  playbookKey: string;
  category: string;
  confidence: number;
  reasoning: string;
}

export interface ResponseDraft {
  subject: string;
  content: string;
  tone: string;
  nextSteps: string[];
  requiresApproval: boolean;
}

export interface AISuggestions {
  categorySuggestions: CategorySuggestion[];
  playbookSuggestions: PlaybookSuggestion[];
  responseDraft: ResponseDraft;
  confidence: number;
}

/**
 * Get all available categories and playbooks for AI analysis
 */
async function getAvailablePlaybooks() {
  try {
    const playbooks = await storage.getPlaybooks();
    return playbooks.map(p => ({
      key: p.key,
      category: p.category,
      content: typeof p.content === 'string' ? JSON.parse(p.content) : p.content
    }));
  } catch (error) {
    console.error('Error fetching playbooks:', error);
    return [];
  }
}

/**
 * Analyze task content and generate AI-powered suggestions
 */
export async function generateTaskSuggestions(
  taskTitle: string,
  taskDescription?: string,
  sourceContext?: string
): Promise<AISuggestions> {
  try {
    const playbooks = await getAvailablePlaybooks();
    const playbookSummary = playbooks.map(p => ({
      key: p.key,
      category: p.category,
      description: p.content.description || p.content.title || 'No description',
      steps: p.content.steps?.slice(0, 2) || [] // First 2 steps only
    }));

    const analysisPrompt = `You are an expert VA operations analyst. Analyze the following task and provide intelligent suggestions.

TASK TO ANALYZE:
Title: ${taskTitle}
Description: ${taskDescription || 'No description provided'}
Source Context: ${sourceContext || 'No additional context'}

AVAILABLE PLAYBOOKS:
${JSON.stringify(playbookSummary, null, 2)}

AVAILABLE CATEGORIES:
- reservations.refund_request
- reservations.cancellation_request  
- access.smart_lock_issue
- guest.messaging_known_answer
- internet.wifi_issue
- follow_up

Please analyze the task and provide suggestions in the following JSON format:
{
  "categorySuggestions": [
    {
      "category": "most_relevant_category",
      "confidence": 0.95,
      "reasoning": "Why this category fits best"
    }
  ],
  "playbookSuggestions": [
    {
      "playbookKey": "most_relevant_playbook_key",
      "category": "category_name",
      "confidence": 0.90,
      "reasoning": "Why this playbook is recommended"
    }
  ],
  "responseDraft": {
    "subject": "Professional subject line",
    "content": "Draft response content that is helpful and professional",
    "tone": "professional|friendly|urgent",
    "nextSteps": ["action 1", "action 2"],
    "requiresApproval": true
  },
  "confidence": 0.85
}

Focus on:
1. Matching task content to appropriate categories and playbooks
2. Drafting helpful, professional responses
3. Identifying if the response needs approval (complex/sensitive issues = true)
4. Providing actionable next steps
5. Give confidence scores based on how well the task matches available options`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system", 
          content: "You are an expert VA operations analyst specializing in task categorization and response drafting. Always respond with valid JSON."
        },
        {
          role: "user",
          content: analysisPrompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3 // Lower temperature for more consistent categorization
    });

    const suggestions = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate and clean up the response
    return {
      categorySuggestions: suggestions.categorySuggestions || [],
      playbookSuggestions: suggestions.playbookSuggestions || [],
      responseDraft: suggestions.responseDraft || {
        subject: "Task Response",
        content: "I'll review this task and get back to you shortly.",
        tone: "professional",
        nextSteps: ["Review task details", "Provide appropriate response"],
        requiresApproval: true
      },
      confidence: suggestions.confidence || 0.5
    };

  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    
    // Fallback response
    return {
      categorySuggestions: [{
        category: "guest.messaging_known_answer",
        confidence: 0.3,
        reasoning: "Default fallback category - AI analysis failed"
      }],
      playbookSuggestions: [{
        playbookKey: "guest_messaging_known_answer_v1",
        category: "guest.messaging_known_answer", 
        confidence: 0.3,
        reasoning: "Default fallback playbook - AI analysis failed"
      }],
      responseDraft: {
        subject: "Task Review",
        content: "Thank you for your request. I'm reviewing the details and will provide a response shortly.",
        tone: "professional",
        nextSteps: ["Manual review required", "Provide appropriate response"],
        requiresApproval: true
      },
      confidence: 0.3
    };
  }
}

/**
 * Improve an existing response draft based on feedback
 */
export async function improveResponseDraft(
  originalDraft: string,
  feedback: string,
  taskContext: string
): Promise<ResponseDraft> {
  try {
    const improvementPrompt = `Please improve this response draft based on the feedback provided.

ORIGINAL DRAFT:
${originalDraft}

FEEDBACK:
${feedback}

TASK CONTEXT:
${taskContext}

Please provide an improved response in this JSON format:
{
  "subject": "Improved subject line",
  "content": "Improved response content",
  "tone": "professional|friendly|urgent",
  "nextSteps": ["action 1", "action 2"],
  "requiresApproval": true
}

The improved response should:
1. Address the feedback points
2. Maintain professional tone
3. Be more helpful and specific
4. Include clear next steps`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert at improving customer service responses. Always respond with valid JSON."
        },
        {
          role: "user", 
          content: improvementPrompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.4
    });

    const improved = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
      subject: improved.subject || "Improved Response",
      content: improved.content || originalDraft,
      tone: improved.tone || "professional",
      nextSteps: improved.nextSteps || [],
      requiresApproval: improved.requiresApproval !== false
    };

  } catch (error) {
    console.error('Error improving response draft:', error);
    return {
      subject: "Response Update",
      content: originalDraft,
      tone: "professional", 
      nextSteps: ["Manual review required"],
      requiresApproval: true
    };
  }
}

/**
 * Generate follow-up suggestions for completed tasks
 */
export async function generateFollowUpSuggestions(
  taskTitle: string,
  taskDescription: string,
  completedActions: string[]
): Promise<string[]> {
  try {
    const followUpPrompt = `Based on this completed task, suggest relevant follow-up actions:

COMPLETED TASK:
Title: ${taskTitle}
Description: ${taskDescription}
Actions Taken: ${completedActions.join(', ')}

Please suggest 2-3 relevant follow-up actions as a JSON array of strings.
Focus on:
1. Quality assurance checks
2. Customer satisfaction verification  
3. Process improvement opportunities
4. Documentation updates

Respond with JSON: {"followUps": ["action 1", "action 2", "action 3"]}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert at identifying relevant follow-up actions for completed tasks. Always respond with valid JSON."
        },
        {
          role: "user",
          content: followUpPrompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.5
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result.followUps || [];

  } catch (error) {
    console.error('Error generating follow-up suggestions:', error);
    return [
      "Verify customer satisfaction",
      "Document lessons learned",
      "Update process if needed"
    ];
  }
}