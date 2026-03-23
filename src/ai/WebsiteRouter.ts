export interface WebsiteConfig {
  domains: string[];
  searchPatterns: RegExp[];
  baseUrl: string;
  searchUrl: string;
  searchParam: string;
}

export class WebsiteRouter {
  private websites: Map<string, WebsiteConfig> = new Map();

  constructor() {
    this.initializeWebsites();
  }

  private initializeWebsites() {
    const configs: WebsiteConfig[] = [
      {
        domains: ['youtube', 'ytube', 'yt '],
        searchPatterns: [
          /^(?:watch|play|view|find|search\s+for|search\s+youtube)(?:\s+for\s+)?(.+)/i,
          /^youtube\s+(.+)/i,
          /youtube(?:\s+for|\s+search|\s+:)\s*(.+)/i,
        ],
        baseUrl: 'https://www.youtube.com',
        searchUrl: 'https://www.youtube.com/results?search_query=',
        searchParam: 'search_query',
      },
      {
        domains: ['gmail', 'google mail', 'email', 'my email', 'check email'],
        searchPatterns: [
          /^(?:check|open|go\s+to|view|read)\s+(?:my\s+)?email/i,
          /^(?:check|open|go\s+to)\s+gmail/i,
        ],
        baseUrl: 'https://mail.google.com',
        searchUrl: 'https://mail.google.com/mail/u/0/#search/',
        searchParam: 'q',
      },
      {
        domains: ['google', 'google.com', 'goog'],
        searchPatterns: [
          /^(?:search|find|look\s+up|google\s+for)(?:\s+for\s+)?(.+)/i,
          /^google\s+(.+)/i,
          /^(?:just\s+)?(.+)\s+on\s+google$/i,
        ],
        baseUrl: 'https://www.google.com',
        searchUrl: 'https://www.google.com/search?q=',
        searchParam: 'q',
      },
      {
        domains: ['facebook', 'fb', 'facebook.com'],
        searchPatterns: [
          /^(?:check|open|go\s+to|view|post\s+on)\s+(?:my\s+)?facebook/i,
          /^facebook\s+(.+)/i,
        ],
        baseUrl: 'https://www.facebook.com',
        searchUrl: 'https://www.facebook.com/search?q=',
        searchParam: 'q',
      },
      {
        domains: ['twitter', 'x.com', 'tweet'],
        searchPatterns: [
          /^(?:check|open|go\s+to|view|post\s+on)\s+twitter/i,
          /^twitter\s+(.+)/i,
          /^(?:check|open|go\s+to)\s+x(?:\s|$)/i,
        ],
        baseUrl: 'https://twitter.com',
        searchUrl: 'https://twitter.com/search?q=',
        searchParam: 'q',
      },
      {
        domains: ['reddit', 'redd.it'],
        searchPatterns: [
          /^(?:check|open|go\s+to|view|browse)\s+reddit/i,
          /^reddit\s+(.+)/i,
          /^(?:search|find|look\s+up)\s+reddit\s+(?:for\s+)?(.+)/i,
        ],
        baseUrl: 'https://www.reddit.com',
        searchUrl: 'https://www.reddit.com/search/?q=',
        searchParam: 'q',
      },
      {
        domains: ['amazon', 'amazon.com', 'shop'],
        searchPatterns: [
          /^(?:search|find|look\s+up|buy|shop\s+for)(?:\s+for\s+)?(.+)\s+(?:on\s+)?amazon/i,
          /^amazon\s+(.+)/i,
          /^(?:check|open|go\s+to)\s+amazon/i,
        ],
        baseUrl: 'https://www.amazon.com',
        searchUrl: 'https://www.amazon.com/s?k=',
        searchParam: 'k',
      },
      {
        domains: ['wikipedia', 'wiki', 'wikipedia.org'],
        searchPatterns: [
          /^(?:search|find|look\s+up|read)\s+(?:on\s+)?(?:wikipedia|wiki)(?:\s+for\s+)?(.+)/i,
          /^wikipedia\s+(.+)/i,
          /^wiki\s+(.+)/i,
        ],
        baseUrl: 'https://en.wikipedia.org',
        searchUrl: 'https://en.wikipedia.org/wiki/',
        searchParam: '',
      },
      {
        domains: ['github', 'gitlab'],
        searchPatterns: [
          /^(?:search|find|look\s+up|check)\s+(?:on\s+)?github(?:\s+for\s+)?(.+)/i,
          /^github\s+(.+)/i,
          /^(?:check|open|go\s+to)\s+github/i,
        ],
        baseUrl: 'https://github.com',
        searchUrl: 'https://github.com/search?q=',
        searchParam: 'q',
      },
      {
        domains: ['linkedin', 'linked in'],
        searchPatterns: [
          /^(?:check|open|go\s+to)\s+linkedin/i,
          /^linkedin\s+(.+)/i,
        ],
        baseUrl: 'https://www.linkedin.com',
        searchUrl: 'https://www.linkedin.com/search/results/all/?keywords=',
        searchParam: 'keywords',
      },
      {
        domains: ['instagram', 'insta'],
        searchPatterns: [
          /^(?:check|open|go\s+to|view)\s+instagram/i,
          /^instagram\s+(.+)/i,
        ],
        baseUrl: 'https://www.instagram.com',
        searchUrl: 'https://www.instagram.com/explore/search/result/?q=',
        searchParam: 'q',
      },
      {
        domains: ['netflix', 'hulu', 'disney+', 'disney plus', 'prime video', 'amazon prime'],
        searchPatterns: [
          /^(?:watch|find|search|look\s+for)(?:\s+for\s+)?(.+)\s+on\s+netflix/i,
          /^netflix\s+(.+)/i,
        ],
        baseUrl: 'https://www.netflix.com',
        searchUrl: 'https://www.netflix.com/search?q=',
        searchParam: 'q',
      },
      {
        domains: ['spotify'],
        searchPatterns: [
          /^(?:play|search|find|look\s+for)(?:\s+for\s+)?(.+)\s+on\s+spotify/i,
          /^spotify\s+(.+)/i,
        ],
        baseUrl: 'https://open.spotify.com',
        searchUrl: 'https://open.spotify.com/search/',
        searchParam: '',
      },
      {
        domains: ['maps', 'google maps', 'map'],
        searchPatterns: [
          /^(?:search|find|look\s+up|get\s+directions\s+to)(?:\s+for\s+)?(.+)\s+on\s+(?:google\s+)?maps/i,
          /^(?:find|search|look\s+up)\s+(?:a\s+)?(?:place|restaurant|store|hotel)(?:\s+called\s+)?(.+)/i,
        ],
        baseUrl: 'https://www.google.com/maps',
        searchUrl: 'https://www.google.com/maps/search/',
        searchParam: '',
      },
      {
        domains: ['weather'],
        searchPatterns: [
          /^(?:what'?s?\s+)?(?:the\s+)?weather(?:\s+in|\s+for|\s+at)\s+(.+)/i,
          /^weather\s+(.+)/i,
        ],
        baseUrl: 'https://weather.com',
        searchUrl: 'https://weather.com/search?q=',
        searchParam: 'q',
      },
      {
        domains: ['news', 'cnn', 'bbc', 'msnbc', 'fox news'],
        searchPatterns: [
          /^(?:check|read|find|search|look\s+up)\s+(?:the\s+)?news(?:\s+about\s+)?(.+)/i,
          /^news\s+(.+)/i,
        ],
        baseUrl: 'https://news.google.com',
        searchUrl: 'https://news.google.com/search?q=',
        searchParam: 'q',
      },
      {
        domains: ['tiktok'],
        searchPatterns: [
          /^(?:search|find|look\s+for|watch)(?:\s+for\s+)?(.+)\s+on\s+tiktok/i,
          /^tiktok\s+(.+)/i,
        ],
        baseUrl: 'https://www.tiktok.com',
        searchUrl: 'https://www.tiktok.com/tag/',
        searchParam: '',
      },
      {
        domains: ['ebay'],
        searchPatterns: [
          /^(?:search|find|look\s+for|buy)(?:\s+for\s+)?(.+)\s+on\s+ebay/i,
          /^ebay\s+(.+)/i,
        ],
        baseUrl: 'https://www.ebay.com',
        searchUrl: 'https://www.ebay.com/sch/i.html?_nkw=',
        searchParam: '_nkw',
      },
      {
        domains: ['walmart'],
        searchPatterns: [
          /^(?:search|find|look\s+for|buy)(?:\s+for\s+)?(.+)\s+at\s+walmart/i,
          /^walmart\s+(.+)/i,
        ],
        baseUrl: 'https://www.walmart.com',
        searchUrl: 'https://www.walmart.com/search/?query=',
        searchParam: 'query',
      },
      {
        domains: ['yahoo', 'yahoo.com'],
        searchPatterns: [
          /^(?:check|open|go\s+to)\s+yahoo/i,
          /^yahoo\s+(.+)/i,
        ],
        baseUrl: 'https://www.yahoo.com',
        searchUrl: 'https://search.yahoo.com/search?p=',
        searchParam: 'p',
      },
      {
        domains: ['bing'],
        searchPatterns: [
          /^(?:search|find|look\s+up)(?:\s+on\s+)?bing(?:\s+for\s+)?(.+)/i,
          /^bing\s+(.+)/i,
        ],
        baseUrl: 'https://www.bing.com',
        searchUrl: 'https://www.bing.com/search?q=',
        searchParam: 'q',
      },
      {
        domains: ['stack overflow', 'stackoverflow'],
        searchPatterns: [
          /^(?:search|find|look\s+up)(?:\s+on\s+)?stack\s*overflow(?:\s+for\s+)?(.+)/i,
          /^stackoverflow\s+(.+)/i,
        ],
        baseUrl: 'https://stackoverflow.com',
        searchUrl: 'https://stackoverflow.com/search?q=',
        searchParam: 'q',
      },
      {
        domains: ['imdb'],
        searchPatterns: [
          /^(?:search|find|look\s+up)(?:\s+for\s+)?(.+)\s+on\s+imdb/i,
          /^imdb\s+(.+)/i,
        ],
        baseUrl: 'https://www.imdb.com',
        searchUrl: 'https://www.imdb.com/find?q=',
        searchParam: 'q',
      },
      {
        domains: ['twitch'],
        searchPatterns: [
          /^(?:watch|find|search|look\s+for)(?:\s+for\s+)?(.+)\s+on\s+twitch/i,
          /^twitch\s+(.+)/i,
        ],
        baseUrl: 'https://www.twitch.tv',
        searchUrl: 'https://www.twitch.tv/search?term=',
        searchParam: 'term',
      },
      {
        domains: ['discord'],
        searchPatterns: [
          /^(?:check|open|go\s+to)\s+discord/i,
        ],
        baseUrl: 'https://discord.com',
        searchUrl: 'https://discord.com/search?query=',
        searchParam: 'query',
      },
      {
        domains: ['zoom'],
        searchPatterns: [
          /^(?:start|join|create)\s+(?:a\s+)?zoom/i,
        ],
        baseUrl: 'https://zoom.us',
        searchUrl: 'https://zoom.us/search?q=',
        searchParam: 'q',
      },
      {
        domains: ['dropbox'],
        searchPatterns: [
          /^(?:check|open|go\s+to|upload\s+to)\s+dropbox/i,
        ],
        baseUrl: 'https://www.dropbox.com',
        searchUrl: 'https://www.dropbox.com/search?query=',
        searchParam: 'query',
      },
      {
        domains: ['drive', 'google drive', 'docs', 'google docs'],
        searchPatterns: [
          /^(?:check|open|go\s+to)\s+(?:my\s+)?(?:google\s+)?drive/i,
          /^(?:check|open|go\s+to)\s+docs/i,
        ],
        baseUrl: 'https://drive.google.com',
        searchUrl: 'https://drive.google.com/drive/search?q=',
        searchParam: 'q',
      },
      {
        domains: ['sheets', 'google sheets', 'excel', 'spreadsheet'],
        searchPatterns: [
          /^(?:check|open|go\s+to)\s+(?:my\s+)?(?:google\s+)?sheets/i,
          /^(?:open|create)\s+(?:a\s+)?spreadsheet/i,
        ],
        baseUrl: 'https://docs.google.com/spreadsheets',
        searchUrl: 'https://docs.google.com/spreadsheets/search?q=',
        searchParam: 'q',
      },
    ];

    for (const config of configs) {
      for (const domain of config.domains) {
        this.websites.set(domain, config);
      }
    }
  }

  route(command: string): { url: string; website: string; query: string | null } {
    const lowerCommand = command.toLowerCase();

    // Check for direct URL first
    const urlMatch = command.match(/(https?:\/\/[^\s]+)|(www\.[^\s]+)/i);
    if (urlMatch) {
      const url = urlMatch[0];
      return {
        url: url.startsWith('http') ? url : 'https://' + url,
        website: 'direct',
        query: null,
      };
    }

    // Try to match against all known patterns
    for (const [domain, config] of this.websites) {
      // Check if the domain is mentioned in the command
      if (!lowerCommand.includes(domain)) {
        continue;
      }

      // Try each search pattern
      for (const pattern of config.searchPatterns) {
        const match = command.match(pattern);
        if (match && match[1]) {
          const query = match[1].trim();
          
          // Special handling for Wikipedia - use underscores
          if (domain === 'wikipedia' || domain === 'wiki') {
            return {
              url: `${config.searchUrl}${encodeURIComponent(query.replace(/\s+/g, '_'))}`,
              website: domain,
              query,
            };
          }

          return {
            url: `${config.searchUrl}${encodeURIComponent(query)}`,
            website: domain,
            query,
          };
        }
      }

      // Domain is mentioned but no specific query - just go to the site
      if (this.mentionsOnlySite(lowerCommand, domain)) {
        return {
          url: config.baseUrl,
          website: domain,
          query: null,
        };
      }
    }

    // If the command looks like a domain (has a dot and no spaces)
    if (command.includes('.') && !command.includes(' ')) {
      return {
        url: 'https://' + command,
        website: 'direct',
        query: null,
      };
    }

    // Default: treat the whole command as a search query on Google
    return {
      url: `https://www.google.com/search?q=${encodeURIComponent(command)}`,
      website: 'google',
      query: command,
    };
  }

  private mentionsOnlySite(command: string, domain: string): boolean {
    // Remove the domain from the command and see if anything meaningful remains
    const withoutDomain = command.replace(new RegExp(domain, 'gi'), '').trim();
    
    // Common filler words that don't constitute a search query
    const fillers = [
      'go to', 'open', 'check', 'visit', 'browse', 'navigate to',
      'the', 'my', 'a', 'an', 'to', 'at', 'in', 'on', 'for', 'and'
    ];
    
    const meaningful = withoutDomain
      .split(/\s+/)
      .filter(word => !fillers.includes(word) && word.length > 0);
    
    return meaningful.length === 0;
  }

  getSupportedWebsites(): string[] {
    return Array.from(this.websites.keys());
  }
}

export const websiteRouter = new WebsiteRouter();
