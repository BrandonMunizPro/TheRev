import {
  AIProvider,
  AIIntentType,
  IntentClassification,
} from './AIIntentTypes';
import { adapterFactory } from './adapters';

export interface BrowserAction {
  action:
    | 'navigate'
    | 'click'
    | 'type'
    | 'scroll'
    | 'wait'
    | 'extract'
    | 'screenshot'
    | 'fill'
    | 'play'
    | 'watch';
  params?: Record<string, any>;
  selector?: string;
  value?: string;
  description: string;
}

export interface AgentPlan {
  steps: BrowserAction[];
  reasoning: string;
}

const AUTOMATION_SERVER = 'http://localhost:9222';

export class BrowserAgent {
  private provider: AIProvider = AIProvider.OPEN_SOURCE;

  async initialize(provider: AIProvider = AIProvider.OPEN_SOURCE) {
    this.provider = provider;
  }

  async executeTask(userTask: string): Promise<{
    success: boolean;
    actions: BrowserAction[];
    results?: any[];
    error?: string;
    context?: string;
  }> {
    console.log('[BrowserAgent] Planning task:', userTask);

    try {
      // Get AI adapter
      const adapter = adapterFactory.getAdapter(this.provider);
      if (!adapter) {
        return {
          success: false,
          actions: [],
          error: 'No AI adapter available',
        };
      }

      // Create planning prompt
      const planningPrompt = this.createPlanningPrompt(userTask);

      // Get AI to plan the actions
      const response = await adapter.complete({
        provider: this.provider,
        prompt: planningPrompt,
        systemPrompt: `You are a browser automation agent. Analyze the user's request and create a step-by-step plan to accomplish it using browser actions.

Available actions:
- navigate(url): Go to a URL
- click(selector): Click an element by CSS selector
- type(selector, value): Type text into an input
- scroll(x, y): Scroll the page
- wait(ms): Wait for specified milliseconds
- extract(): Get the page content/text
- screenshot(): Take a screenshot

Return your plan as a JSON array of actions with this exact format:
[{"action": "navigate", "params": {"url": "https://..."}, "description": "Go to YouTube"}, {"action": "type", "selector": "#search", "value": "search term", "description": "Search for videos"}]

Common selectors:
- YouTube (current): input[aria-label="Search"], input[name="search"], ytd-searchbox input, #search-input
- YouTube search button: button[aria-label="Search"], button#search-icon-legacy, ytd-searchbox button
- Gmail: #identifierId, input[name="subject"], div[contenteditable="true"]
- Generic search: input[type="search"], input[type="text"], input[placeholder*="Search"], button[aria-label*="Search"]

Always use the most specific selector available. For YouTube, use aria-label selectors first.`,
        maxTokens: 1024,
        temperature: 0.3,
      });

      console.log(
        '[BrowserAgent] AI response:',
        response.content.substring(0, 500)
      );

      // Parse the AI's response to get actions
      const actions = this.parsePlan(response.content);

      if (actions.length === 0) {
        // Fallback - just navigate to search
        const searchUrl = this.extractSearchUrl(userTask);
        if (searchUrl) {
          return {
            success: true,
            actions: [
              {
                action: 'navigate',
                params: { url: searchUrl },
                description: 'Search ' + userTask,
              },
            ],
            results: [],
          };
        }
        return {
          success: false,
          actions: [],
          error: 'Could not understand task',
        };
      }

      // Execute the actions
      const results = await this.executeActions(actions);

      // Generate contextual information about the task
      let contextInfo = '';
      try {
        contextInfo = await this.generateContextInfo(userTask, results);
      } catch (e) {
        console.log('[BrowserAgent] Could not generate context:', e);
      }

      return {
        success: true,
        actions,
        results,
        context: contextInfo,
      };
    } catch (error) {
      console.error('[BrowserAgent] Error:', error);
      return {
        success: false,
        actions: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async generateContextInfo(
    userTask: string,
    results: any[]
  ): Promise<string> {
    const adapter = adapterFactory.getAdapter(this.provider);
    if (!adapter) return '';

    const taskLower = userTask.toLowerCase();

    // Get page content if available
    let pageContent = '';
    try {
      const contentRes = await fetch('http://localhost:9222/api/get-content', {
        method: 'POST',
      });
      const content = await contentRes.json();
      if (content.success && content.text) {
        pageContent = content.text.substring(0, 1500);
      }
    } catch (e) {}

    // Generate contextual info based on the task
    const contextPrompt = `The user asked: "${userTask}"

I executed browser actions and got results. 

${pageContent ? `Current page content:\n${pageContent}\n\n` : ''}

Based on what the user is searching for or doing, provide:
1. A brief summary or interesting context about what they searched for
2. Any relevant facts, history, or information related to their search
3. Keep it conversational and informative (2-3 sentences max)

For example:
- If searching for a sports moment → mention the player's stats/history
- If searching for a historical event → mention when it happened and why it's significant  
- If searching for a recipe → mention the cuisine and key ingredients
- If searching for a place → mention where it is and why it's notable

Provide engaging, relevant context:`;

    try {
      const response = await adapter.complete({
        provider: this.provider,
        prompt: contextPrompt,
        systemPrompt:
          'You are Rev, an informative AI assistant. Provide engaging context about what the user is searching for or viewing. Keep responses brief (2-3 sentences) but interesting.',
        maxTokens: 200,
        temperature: 0.7,
      });

      return response.content.trim();
    } catch (e) {
      return '';
    }
  }

  private createPlanningPrompt(task: string): string {
    return `User wants to: "${task}"

Create a step-by-step plan to accomplish this using browser actions. 
Return ONLY a JSON array, no other text.`;
  }

  private parsePlan(aiResponse: string): BrowserAction[] {
    try {
      // Try to extract JSON from response
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.log('[BrowserAgent] No JSON found in response');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and clean actions
      const actions: BrowserAction[] = [];
      for (const step of parsed) {
        if (step.action && typeof step.action === 'string') {
          actions.push({
            action: step.action,
            params: step.params || {},
            selector: step.selector,
            value: step.value,
            description: step.description || step.action,
          });
        }
      }

      console.log('[BrowserAgent] Parsed', actions.length, 'actions');
      return actions;
    } catch (error) {
      console.log('[BrowserAgent] Failed to parse AI response:', error);
      return [];
    }
  }

  private extractSearchUrl(task: string): string | null {
    const lower = task.toLowerCase();

    // Check if this is a "play" or "watch" command
    const isPlayCommand =
      lower.includes('play') ||
      lower.includes('watch') ||
      lower.includes('open') ||
      lower.includes('click');

    // YouTube search
    if (lower.includes('youtube')) {
      // Extract search query from task
      let query = task
        .replace(/.*(youtube|yt)[\s:,-]*/i, '')
        .replace(/search\s*(for)?/i, '')
        .replace(/play\s*(the\s+)?/i, '')
        .replace(/watch\s*(the\s+)?/i, '')
        .replace(/open\s*(the\s+)?/i, '')
        .replace(/video\s*(of\s*)?/i, '')
        .trim();

      if (query) {
        return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      }
      return 'https://www.youtube.com';
    }

    // Generic search
    const queryMatch = task.match(/(?:search|find|look up)[\s]+(.+)/i);
    if (queryMatch) {
      return `https://www.google.com/search?q=${encodeURIComponent(queryMatch[1])}`;
    }

    // If it's a play command but no specific search, return null to let the AI handle it
    if (isPlayCommand) {
      return null;
    }

    return null;
  }

  private async executeActions(actions: BrowserAction[]): Promise<any[]> {
    const results = [];

    for (const step of actions) {
      console.log('[BrowserAgent] Executing:', step.action, step.description);

      try {
        let result: any;

        switch (step.action) {
          case 'navigate':
            result = await this.callAutomation('/api/navigate', {
              url: step.params?.url,
            });
            break;

          case 'click':
          case 'play':
          case 'watch':
            // For play/watch, we want to click on the first video result
            // Use special endpoint that handles YouTube video clicks
            result = await this.callAutomation('/api/execute', {
              action: 'clickFirstVideo',
              params: { selector: step.selector },
            });
            break;

          case 'type':
            result = await this.callAutomation('/api/execute', {
              action: 'type',
              params: { selector: step.selector, value: step.value },
            });
            break;

          case 'scroll':
            result = await this.callAutomation('/api/execute', {
              action: 'scroll',
              params: { x: step.params?.x || 0, y: step.params?.y || 300 },
            });
            break;

          case 'wait':
            result = await this.callAutomation('/api/execute', {
              action: 'wait',
              params: { ms: step.params?.ms || 1000 },
            });
            break;

          case 'extract':
            result = await this.callAutomation('/api/get-content', {});
            break;

          case 'screenshot':
            result = await this.callAutomation('/api/screenshot', {});
            break;

          case 'fill':
            result = await this.callAutomation('/api/fill-form', {
              formData: [{ selector: step.selector, value: step.value }],
            });
            break;

          default:
            result = {
              success: false,
              error: `Unknown action: ${step.action}`,
            };
        }

        results.push({ step: step.description, result });

        if (
          !result.success &&
          step.action !== 'extract' &&
          step.action !== 'screenshot'
        ) {
          console.log(
            '[BrowserAgent] Action failed, continuing...',
            result.error
          );
        }
      } catch (error) {
        console.log('[BrowserAgent] Action error:', error);
        results.push({
          step: step.description,
          error: error instanceof Error ? error.message : 'Error',
        });
      }
    }

    return results;
  }

  private async callAutomation(endpoint: string, body: any): Promise<any> {
    try {
      const response = await fetch(`${AUTOMATION_SERVER}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection error',
      };
    }
  }
}

export const browserAgent = new BrowserAgent();
