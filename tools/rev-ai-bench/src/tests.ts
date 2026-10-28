import { TestCase } from './types.js';

export const GENERAL_TESTS: TestCase[] = [
  {
    id: 'gen-1',
    category: 'general',
    name: 'Multi-step reasoning',
    prompt: 'Solve step by step: A company has 3 departments. Each department has 4 teams. Each team has 5 people. If 20% of people are managers, how many managers are there total? Show your reasoning.',
    expectedFormat: 'text',
    scoringCriteria: {
      mustHave: ['60'],
      objectiveCheck: (r) => r.includes('60') && /reason|step/i.test(r)
    }
  },
  {
    id: 'gen-2',
    category: 'general',
    name: 'Instruction following',
    prompt: 'List exactly 3 colors, each on a new line, with no extra text or explanation.',
    expectedFormat: 'text',
    scoringCriteria: {
      objectiveCheck: (r) => {
        const lines = r.trim().split('\n').filter(l => l.trim());
        return lines.length === 3;
      }
    }
  }
];

export const BROWSER_TESTS: TestCase[] = [
  {
    id: 'browser-1',
    category: 'browser',
    name: 'Search intent',
    prompt: 'User says: "Find me recent news about AI". Generate a browser action plan as JSON with action "navigate" and a search URL.',
    expectedFormat: 'json',
    scoringCriteria: {
      validJson: true,
      mustHave: ['navigate', 'url']
    }
  },
  {
    id: 'browser-2',
    category: 'browser',
    name: 'Tool selection',
    prompt: 'I need to click the login button. Generate JSON with action "click" and a selector. Use a reasonable CSS selector.',
    expectedFormat: 'json',
    scoringCriteria: {
      validJson: true,
      mustHave: ['click']
    }
  }
];

export const GAMING_TESTS: TestCase[] = [
  {
    id: 'game-1',
    category: 'gaming',
    name: 'NPC dialogue action',
    prompt: 'You are an NPC in a medieval game. Player says "Hello". Respond with a dialogue action in JSON: {"type": "dialogue", "text": "...", "tone": "..."}',
    expectedFormat: 'json',
    scoringCriteria: {
      validJson: true,
      mustHave: ['dialogue', 'text']
    }
  }
];

export const ALL_TESTS = [...GENERAL_TESTS, ...BROWSER_TESTS, ...GAMING_TESTS];
