const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// In-memory task storage (would be Redis/DB in production)
const aiTasks = new Map();

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ============================================
// AI INTENT CLASSIFIER (Simplified)
// ============================================
const AIIntentType = {
  NAVIGATE_URL: 'navigate_url',
  SEARCH: 'search',
  AUTOMATION: 'automation',
  GENERATION: 'generation',
  UNKNOWN: 'unknown',
};

const AIProvider = {
  DETERMINISTIC: 'deterministic',
  CHATGPT: 'chatgpt',
  CLAUDE: 'claude',
  OLLAMA: 'ollama',
};

function classifyIntent(command) {
  const lower = command.toLowerCase();

  // Navigation intents
  if (
    lower.includes('youtube') ||
    lower.includes('gmail') ||
    lower.includes('wiki') ||
    lower.includes('reddit') ||
    lower.includes('search') ||
    lower.includes('go to') ||
    lower.includes('open') ||
    lower.includes('visit')
  ) {
    return {
      intent: AIIntentType.NAVIGATE_URL,
      confidence: 0.95,
      provider: AIProvider.DETERMINISTIC,
      requiresBrowser: true,
      taskType: 'automation',
    };
  }

  // Automation intents
  if (
    lower.includes('click') ||
    lower.includes('scroll') ||
    lower.includes('type') ||
    lower.includes('fill') ||
    lower.includes('automate')
  ) {
    return {
      intent: AIIntentType.AUTOMATION,
      confidence: 0.9,
      provider: AIProvider.DETERMINISTIC,
      requiresBrowser: true,
      taskType: 'automation',
    };
  }

  // Default - treat as search/navigation
  return {
    intent: AIIntentType.SEARCH,
    confidence: 0.8,
    provider: AIProvider.DETERMINISTIC,
    requiresBrowser: true,
    taskType: 'automation',
  };
}

// ============================================
// URL PARSER
// ============================================
function parseCommandToUrl(command) {
  const lowerCommand = command.toLowerCase();
  let url = '';

  // YouTube
  if (lowerCommand.includes('youtube') || lowerCommand.includes('yt ')) {
    let query = '';
    const patterns = [
      /(?:search|find|watch|look up|search for)[\s]+(.+?)[\s]+(?:on|in|at)[\s]+(?:youtube|yt)/i,
      /(?:youtube|yt)[\s:,-]*(.+)/i,
      /(?:search|find)[\s]+(.+?)[\s]+youtube/i,
    ];

    for (const pattern of patterns) {
      const match = command.match(pattern);
      if (match && match[1]) {
        query = match[1]
          .replace(/^(go to|search|search for|find|to|and|then)[\s]*/gi, '')
          .trim();
        if (query) break;
      }
    }

    if (!query) {
      query = command
        .replace(/^.*?(?:youtube|yt)[\s:,-]*/i, '')
        .replace(/^(go to|search|search for|find|to|and|then)[\s]*/gi, '')
        .trim();
    }

    if (query) {
      url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    } else {
      url = 'https://www.youtube.com';
    }
  }
  // Gmail
  else if (lowerCommand.includes('gmail') || lowerCommand.includes('email')) {
    url = 'https://mail.google.com';
  }
  // Wikipedia
  else if (lowerCommand.includes('wiki')) {
    url = 'https://wikipedia.org';
  }
  // Reddit
  else if (lowerCommand.includes('reddit')) {
    let query = command.match(
      /(?:search|find|look up)[\s]+(.+?)[\s]+(?:on|in|at)[\s]+reddit/i
    );
    if (query && query[1]) {
      url = `https://www.reddit.com/search/?q=${encodeURIComponent(query[1].trim())}`;
    } else {
      url = 'https://reddit.com';
    }
  }
  // Generic search
  else if (lowerCommand.includes('search') || lowerCommand.includes('google')) {
    let query = command.replace(/^.*?(?:search|google)[:\s]*/gi, '').trim();
    if (!query) {
      const match = command.match(/(?:search|find|look up)[\s]+(.+)/i);
      if (match) query = match[1].trim();
    }
    url = `https://www.google.com/search?q=${encodeURIComponent(query || command)}`;
  }
  // Default - Google search
  else {
    const topic = command
      .replace(
        /^(go to|visit|open|navigate|show me|find|look up|get|search for|search)[\s]*/gi,
        ''
      )
      .trim();
    url = `https://www.google.com/search?q=${encodeURIComponent(topic || command)}`;
  }

  return url;
}

// ============================================
// BROWSER AUTOMATION
// ============================================
async function executeBrowserAutomation(url, command) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    // Call the browser automation server
    const response = await fetch('http://localhost:9222/api/navigate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const result = await response.json();

    if (result.success) {
      // Get screenshot
      const screenshotRes = await fetch(
        'http://localhost:9222/api/screenshot',
        {
          method: 'POST',
        }
      );
      const screenshotData = await screenshotRes.json();

      return {
        success: true,
        url: result.url,
        title: result.title,
        screenshot: screenshotData.success ? screenshotData.screenshot : null,
      };
    }

    return { success: false, error: result.error };
  } catch (error) {
    clearTimeout(timeout);
    console.error('[Browser Automation] Error:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// API ENDPOINTS
// ============================================

// Main AI Browser Command Endpoint - Full Workflow
app.post('/api/ai-browser-command', async (req, res) => {
  try {
    const { command, userId = 'default-user' } = req.body;

    if (!command) {
      return res.json({ success: false, error: 'No command provided' });
    }

    console.log('[Ask Rev] ========== NEW TASK ==========');
    console.log('[Ask Rev] Command:', command);
    console.log('[Ask Rev] User:', userId);

    // Step 1: Classify intent
    const intent = classifyIntent(command);
    console.log(
      '[Ask Rev] Intent:',
      intent.intent,
      '- Provider:',
      intent.provider
    );

    // Step 2: Parse URL
    const url = parseCommandToUrl(command);
    console.log('[Ask Rev] Parsed URL:', url);

    // Step 3: Create task in AITaskSystem
    const taskId = `task_${uuidv4()}`;
    const task = {
      id: taskId,
      userId,
      status: 'processing',
      intent: intent.intent,
      provider: intent.provider,
      command,
      url,
      createdAt: new Date().toISOString(),
      steps: [],
    };
    aiTasks.set(taskId, task);
    console.log('[Ask Rev] Task created:', taskId);

    // Step 4: Execute via browser automation
    console.log('[Ask Rev] Executing browser automation...');
    const browserResult = await executeBrowserAutomation(url, command);

    task.steps.push({
      step: 'browser_automation',
      success: browserResult.success,
      url: browserResult.url,
      title: browserResult.title,
      timestamp: new Date().toISOString(),
    });

    if (browserResult.success) {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.result = {
        url: browserResult.url,
        title: browserResult.title,
        screenshot: browserResult.screenshot,
      };

      console.log('[Ask Rev] ✅ Task completed successfully');

      res.json({
        success: true,
        taskId,
        status: 'completed',
        url: browserResult.url,
        title: browserResult.title,
        screenshot: browserResult.screenshot,
        intent: intent.intent,
        provider: intent.provider,
        message: `Opening: ${browserResult.url}`,
      });
    } else {
      task.status = 'failed';
      task.error = browserResult.error;
      task.completedAt = new Date().toISOString();

      console.log('[Ask Rev] ❌ Task failed:', browserResult.error);

      // Fallback: just return the URL to open in a new window
      res.json({
        success: true,
        taskId,
        status: 'fallback',
        url: url,
        fallback: true,
        message: 'Opening in new window (automation unavailable)',
      });
    }

    // Save updated task
    aiTasks.set(taskId, task);
  } catch (error) {
    console.error('[Ask Rev] Error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Get task status
app.get('/api/ai-tasks/:taskId', (req, res) => {
  const task = aiTasks.get(req.params.taskId);
  if (task) {
    res.json({ success: true, task });
  } else {
    res.json({ success: false, error: 'Task not found' });
  }
});

// Get user's tasks
app.get('/api/ai-tasks', (req, res) => {
  const userId = req.query.userId || 'default-user';
  const userTasks = Array.from(aiTasks.values())
    .filter((t) => t.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);

  res.json({ success: true, tasks: userTasks });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      api: 'running',
      browserAutomation: 'checking...',
    },
  });
});

// Check browser automation status
app.get('/api/browser-status', async (req, res) => {
  try {
    const response = await fetch('http://localhost:9222/api/status');
    const data = await response.json();
    res.json({ success: true, ...data });
  } catch (error) {
    res.json({ success: false, error: 'Browser automation not available' });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running!' });
});

// AI Chat endpoint for the new AI browser
app.post('/api/ai-chat', async (req, res) => {
  const { message, context, url } = req.body;

  if (!message) {
    res.json({ success: false, error: 'No message provided' });
    return;
  }

  try {
    const lowerMessage = message.toLowerCase();

    // Known sites map
    const knownSites = {
      youtube: {
        base: 'https://www.youtube.com',
        search: '/results?search_query=',
      },
      'youtube.com': {
        base: 'https://www.youtube.com',
        search: '/results?search_query=',
      },
      gmail: { base: 'https://mail.google.com', search: null },
      google: { base: 'https://www.google.com', search: '/search?q=' },
      reddit: { base: 'https://www.reddit.com', search: '/search/?q=' },
      twitter: { base: 'https://twitter.com', search: null },
      facebook: { base: 'https://www.facebook.com', search: null },
      instagram: { base: 'https://www.instagram.com', search: null },
      github: { base: 'https://github.com', search: '/search?q=' },
      amazon: { base: 'https://www.amazon.com', search: '/s?k=' },
      netflix: { base: 'https://www.netflix.com', search: '/search?q=' },
      wiki: { base: 'https://en.wikipedia.org', search: '/wiki/' },
      wikipedia: { base: 'https://en.wikipedia.org', search: '/wiki/' },
    };

    // First, check for "youtube search X" or "search youtube X" patterns
    const searchMatch = message.match(
      /(?:search|find|look up)\s+(?:on\s+)?(\w+)\s+(.+)/i
    );
    if (searchMatch) {
      const site = searchMatch[1]?.toLowerCase();
      const query = searchMatch[2];
      if (site && query && knownSites[site]) {
        const siteInfo = knownSites[site];
        const targetUrl =
          siteInfo.base + siteInfo.search + encodeURIComponent(query);
        res.json({
          success: true,
          response: `Searching ${site} for "${query}"...`,
          actions: [{ type: 'NAVIGATE', value: targetUrl }],
        });
        return;
      }
    }

    // Check for "youtube search X" (site first)
    const siteSearchMatch = message.match(/^(\w+)\s+search\s+(.+)/i);
    if (siteSearchMatch) {
      const site = siteSearchMatch[1]?.toLowerCase();
      const query = siteSearchMatch[2];
      if (site && query && knownSites[site]) {
        const siteInfo = knownSites[site];
        const targetUrl =
          siteInfo.base + siteInfo.search + encodeURIComponent(query);
        res.json({
          success: true,
          response: `Searching ${site} for "${query}"...`,
          actions: [{ type: 'NAVIGATE', value: targetUrl }],
        });
        return;
      }
    }

    // Check for "go to youtube" or just "youtube" - check known sites
    const goToMatch = message.match(
      /(?:go to|open|visit|navigate to|show me)\s+(.+)/i
    );
    if (goToMatch) {
      const target = goToMatch[1]?.trim().toLowerCase();

      // Check if it's a known site
      if (knownSites[target]) {
        const targetUrl = knownSites[target].base;
        res.json({
          success: true,
          response: `Opening ${target}...`,
          actions: [{ type: 'NAVIGATE', value: targetUrl }],
        });
        return;
      }

      // Check for domain like youtube.com
      if (target.includes('.') || target.includes('http')) {
        const targetUrl = target.startsWith('http')
          ? target
          : 'https://' + target;
        res.json({
          success: true,
          response: `Opening ${targetUrl}...`,
          actions: [{ type: 'NAVIGATE', value: targetUrl }],
        });
        return;
      }

      // Otherwise search Google
      const searchUrl =
        'https://www.google.com/search?q=' + encodeURIComponent(target);
      res.json({
        success: true,
        response: `Searching for "${target}"...`,
        actions: [{ type: 'NAVIGATE', value: searchUrl }],
      });
      return;
    }

    // Check for just "youtube" or "reddit" at start
    const justSiteMatch = message.match(
      /^(youtube|gmail|reddit|twitter|facebook|github|amazon|netflix)(?:\s|$)/i
    );
    if (justSiteMatch) {
      const site = justSiteMatch[1].toLowerCase();
      const targetUrl = knownSites[site]?.base;
      if (targetUrl) {
        res.json({
          success: true,
          response: `Opening ${site}...`,
          actions: [{ type: 'NAVIGATE', value: targetUrl }],
        });
        return;
      }
    }

    // Check for URL pattern
    const urlMatch = message.match(/^(https?:\/\/)?([\w-]+\.[\w-]+)/i);
    if (urlMatch) {
      const targetUrl = urlMatch[1] ? message : 'https://' + message;
      res.json({
        success: true,
        response: `Opening ${targetUrl}...`,
        actions: [{ type: 'NAVIGATE', value: targetUrl }],
      });
      return;
    }

    // Handle direct search queries - only if contains search-related words
    if (
      lowerMessage.includes('search') ||
      lowerMessage.includes('find') ||
      lowerMessage.includes('look up')
    ) {
      const searchTerms = message
        .replace(/^(go to|open|visit|navigate|search|find|look up)\s*/i, '')
        .trim();
      if (searchTerms) {
        const searchUrl =
          'https://www.google.com/search?q=' + encodeURIComponent(searchTerms);
        res.json({
          success: true,
          response: `Searching for "${searchTerms}"...`,
          actions: [{ type: 'NAVIGATE', value: searchUrl }],
        });
        return;
      }
    }

    // Handle click commands
    const clickMatch = message.match(
      /(?:click|tap|press)[\s]+(?:on\s+)?(?:the\s+)?(.+)/i
    );
    if (clickMatch) {
      const element = clickMatch[1];
      res.json({
        success: true,
        response: `I'll click on "${element}" for you. (Element interaction coming soon)`,
        actions: [{ type: 'CLICK', selector: element }],
      });
      return;
    }

    // Handle type commands
    const typeMatch = message.match(
      /(?:type|enter|fill)[\s]+(?:in\s+)?(?:the\s+)?(.+?)[\s]+(?:with\s+|:|\s+)(.+)/i
    );
    if (typeMatch) {
      const field = typeMatch[1];
      const text = typeMatch[2];
      res.json({
        success: true,
        response: `I'll type "${text}" in ${field}. (Element interaction coming soon)`,
        actions: [{ type: 'TYPE', selector: field, text: text }],
      });
      return;
    }

    // Check if asking about current page
    if (
      lowerMessage.includes('this page') ||
      lowerMessage.includes('current page') ||
      lowerMessage.includes('what is')
    ) {
      if (context) {
        res.json({
          success: true,
          response: `Based on the current page: ${context.substring(0, 500)}... \n\nIs there something specific you'd like me to do on this page?`,
        });
      } else {
        res.json({
          success: true,
          response: `The current page is at ${url || 'unknown'}. I can analyze it if you wait a moment, or you can ask me to navigate somewhere else.`,
        });
      }
      return;
    }

    // Check if asking for help
    if (
      lowerMessage.includes('help') ||
      lowerMessage.includes('what can you do')
    ) {
      res.json({
        success: true,
        response: `I can help you with:\n\n• Navigating to websites (just say "go to youtube.com" or "search for cats on youtube")\n• Answering questions about the current page\n• Finding information online\n• And more!\n\nJust tell me what you want to do!`,
      });
      return;
    }

    // Default response
    res.json({
      success: true,
      response: `I understand you want me to "${message}". \n\nI can:\n• Navigate to websites\n• Search for information\n• Help with the current page\n\nWould you like me to go somewhere specific?`,
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(
    `🤖 AI Browser API: http://localhost:${PORT}/api/ai-browser-command`
  );
  console.log(`📋 Task API: http://localhost:${PORT}/api/ai-tasks`);
  console.log(`💚 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌐 Browser Status: http://localhost:${PORT}/api/browser-status`);
});
