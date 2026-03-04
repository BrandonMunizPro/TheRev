import 'dotenv/config';
import 'reflect-metadata';
import express from 'express';
import { getUserFromRequest } from './auth/getUserFromRequest';
import { createYoga } from 'graphql-yoga';
import { AppDataSource } from './data-source';
import { buildSchema } from 'type-graphql';
import { UserResolver } from './resolvers/User';
import { ThreadResolver } from './resolvers/Thread';
import { AuthResolver } from './resolvers/Auth';
import { PostResolver } from './resolvers/Post';
import { ThreadAdminResolver } from './resolvers/ThreadPermissions';
import { GraphQLContext } from './graphql/context';
import { AIIntentClassifier } from './ai/AIIntentClassifier';
import { AIIntentType, IntentClassification } from './ai/AIIntentTypes';

const app = express();
const PORT = 4000;

const intentClassifier = new AIIntentClassifier();

async function startServer() {
  try {
    await AppDataSource.initialize();
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('📡 NEXUS database connected');
    }

    const schema = await buildSchema({
      resolvers: [
        AuthResolver,
        UserResolver,
        ThreadResolver,
        ThreadAdminResolver,
        PostResolver,
      ],
      validate: false,
    });

    const yoga = createYoga<GraphQLContext>({
      schema,
      graphqlEndpoint: '/graphql',
      context: ({ request }) => ({
        user: getUserFromRequest(request),
      }),
    });

    app.use(express.json());
    app.use('/graphql', yoga as any);

    // AI Browser Command Endpoint
    app.post('/api/ai-browser-command', async (req, res) => {
      try {
        const { command } = req.body;

        if (!command) {
          return res.json({ success: false, error: 'No command provided' });
        }

        console.log('[Ask Rev] Processing command:', command);

        // Use AI Intent Classifier to understand the command
        const intentResult = intentClassifier.classify(command);
        console.log('[Ask Rev] Intent classification:', intentResult.intent, 'confidence:', intentResult.confidence);

        let url = '';
        
        // Handle navigation intents
        if (intentResult.intent === AIIntentType.NAVIGATE_URL || 
            intentResult.classification === IntentClassification.DETERMINISTIC) {
          
          const lowerCommand = command.toLowerCase();
          
          // YouTube - handle various patterns like "search X on youtube", "youtube search X"
          if (lowerCommand.includes('youtube') || lowerCommand.includes('yt ')) {
            let query = '';
            // Try to extract query from various patterns
            const searchMatch = command.match(/(?:search|find|watch|look up|search for)[\s]+(.+?)(?:\s+on|\s+in|\s+at|\s+youtube|$)/i);
            const ytMatch = command.match(/(?:youtube|yt)[\s:,-]*(.+)/i);
            
            if (searchMatch && searchMatch[1]) {
              query = searchMatch[1].trim();
            } else if (ytMatch && ytMatch[1]) {
              query = ytMatch[1].replace(/^(go to|search|search for|find|to|and|then)[\s]*/gi, '').trim();
            }
            
            if (query) {
              url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
            } else {
              url = 'https://www.youtube.com';
            }
          }
          // Gmail/Email
          else if (lowerCommand.includes('gmail') || lowerCommand.includes('email') || lowerCommand.includes('mail.google')) {
            url = 'https://mail.google.com';
          }
          // Wikipedia
          else if (lowerCommand.includes('wiki')) {
            url = 'https://wikipedia.org';
          }
          // Reddit
          else if (lowerCommand.includes('reddit')) {
            let query = '';
            const match = command.match(/(?:search|find|look up|browse)[\s]+(.+?)(?:\s+on|\s+in|\s+at|\s+reddit|$)/i);
            if (match && match[1]) {
              query = match[1].trim();
            }
            if (query) {
              url = `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`;
            } else {
              url = 'https://reddit.com';
            }
          }
          // Generic search
          else if (lowerCommand.includes('search') || lowerCommand.includes('google')) {
            let query = command
              .replace(/^.*?(?:search|google)[:\s]*/gi, '')
              .replace(/^(?:go to|for|on|in|to|and|then)[\s]*/gi, '')
              .trim();
            if (!query) {
              const searchOnlyMatch = command.match(/(?:search|find|look up)[\s]+(.+)/i);
              if (searchOnlyMatch) query = searchOnlyMatch[1].trim();
            }
            url = `https://www.google.com/search?q=${encodeURIComponent(query || command)}`;
          }
          // Check for URL in entities
          else if (intentResult.entities && intentResult.entities.some(e => e.type === 'url')) {
            const urlEntity = intentResult.entities.find(e => e.type === 'url');
            url = urlEntity?.value || '';
          }
          // Default - extract topic and search
          else {
            // Try to extract what the user wants to find
            const topicMatch = command.match(/(?:search|find|look up|get|show)[\s]+(.+)/i);
            let query = topicMatch ? topicMatch[1].trim() : command;
            url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
          }
        } else {
          // For AI-powered tasks, we'll return a URL for browsing if needed
          // Default to Google search for now
          const query = encodeURIComponent(command);
          url = `https://www.google.com/search?q=${query}`;
        }

        console.log('[Ask Rev] Parsed URL:', url);
        
        res.json({ 
          success: true, 
          url, 
          command,
          intent: intentResult.intent,
          confidence: intentResult.confidence
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.json({ success: false, error: errorMessage });
      }
    });

    app.listen(PORT, () => {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log(`🧠 NEXUS core listening on http://localhost:${PORT}`);
        // eslint-disable-next-line no-console
        console.log(`🚀 GraphQL ready at http://localhost:${PORT}/graphql`);
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('DB init error:', error);
  }
}

startServer();
