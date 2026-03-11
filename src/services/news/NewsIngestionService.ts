import Parser from 'rss-parser';
import {
  NewsArticle,
  NewsType,
  NewsSourceType,
} from '../../entities/NewsArticle';
import { AppDataSource } from '../../data-source';

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: false }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: false }],
      ['yt:videoId', 'videoId'],
      ['yt:channelId', 'channelId'],
    ],
  },
});

export interface NewsSourceConfig {
  name: string;
  url: string;
  type: NewsSourceType;
  priority: number;
}

export const DEFAULT_NEWS_SOURCES: NewsSourceConfig[] = [
  // YouTube Channels via RSSHub (more reliable)
  {
    name: 'Secular Talk',
    url: 'https://rsshub.app/youtube/channel/UCuIgMr4Jedna6v2kgKBhVMg',
    type: NewsSourceType.YOUTUBE,
    priority: 1,
  },
  {
    name: 'Breaking Points',
    url: 'https://rsshub.app/youtube/channel/UCmR8hs2VmC0sKGwFzwG6kXw',
    type: NewsSourceType.YOUTUBE,
    priority: 2,
  },
  {
    name: 'The Young Turks',
    url: 'https://rsshub.app/youtube/channel/UCWpv_qA569-j-7K4L4Kk4gw',
    type: NewsSourceType.YOUTUBE,
    priority: 3,
  },
  {
    name: 'Sabby Sabs',
    url: 'https://rsshub.app/youtube/channel/UCnt-6E3SSqFzQYYNpRv6S0g',
    type: NewsSourceType.YOUTUBE,
    priority: 4,
  },
  {
    name: 'Bad Faith',
    url: 'https://rsshub.app/youtube/channel/UCEW1a6mTzf6x_C0Q7A3J4q_w',
    type: NewsSourceType.YOUTUBE,
    priority: 5,
  },
  {
    name: 'The Majority Report',
    url: 'https://rsshub.app/youtube/channel/UC-GxZ7rZ6K3uTmB3T6l2c2w',
    type: NewsSourceType.YOUTUBE,
    priority: 6,
  },
  {
    name: 'Marc Lamont Hill',
    url: 'https://rsshub.app/youtube/channel/UCjF8a8KSPD_4qUSfYIXV8g',
    type: NewsSourceType.YOUTUBE,
    priority: 7,
  },
  {
    name: 'Thom Hartman',
    url: 'https://rsshub.app/youtube/channel/UCMR9gNnpW2s9S0x4kS4tL_w',
    type: NewsSourceType.YOUTUBE,
    priority: 8,
  },
  // RSS News Sources
  {
    name: 'The Grayzone',
    url: 'https://thegrayzone.com/feed',
    type: NewsSourceType.RSS,
    priority: 11,
  },
  {
    name: 'The Intercept',
    url: 'https://theintercept.com/feed/rss',
    type: NewsSourceType.RSS,
    priority: 13,
  },
  {
    name: 'Democracy Now',
    url: 'https://www.democracynow.org/democracynow.rss',
    type: NewsSourceType.RSS,
    priority: 14,
  },
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    type: NewsSourceType.RSS,
    priority: 15,
  },
  {
    name: 'Drop Site News',
    url: 'https://www.dropsitenews.com/feed',
    type: NewsSourceType.RSS,
    priority: 10,
  },
];

export class NewsIngestionService {
  private newsRepo = AppDataSource.getRepository(NewsArticle);

  async fetchAndParseFeed(source: NewsSourceConfig): Promise<NewsArticle[]> {
    try {
      console.log(`[News] Fetching feed: ${source.name}`);
      const feed = await parser.parseURL(source.url);

      const articles: NewsArticle[] = [];

      for (const item of feed.items || []) {
        if (!item.link) continue;

        // Check for duplicate
        const existing = await this.newsRepo.findOne({
          where: { url: item.link },
        });
        if (existing) continue;

        const isVideo =
          source.type === NewsSourceType.YOUTUBE || !!item.videoId;

        let imageUrl =
          item.enclosure?.url ||
          item.mediaThumbnail?.url ||
          item.mediaContent?.url;

        // For YouTube, construct thumbnail URL
        if (isVideo && item.videoId) {
          imageUrl = `https://img.youtube.com/vi/${item.videoId}/maxresdefault.jpg`;
        }

        const article = this.newsRepo.create({
          title: item.title || 'Untitled',
          summary: item.contentSnippet || item.content || '',
          content: item.content || '',
          url: item.link,
          imageUrl: imageUrl || undefined,
          newsType: isVideo ? NewsType.VIDEO : NewsType.ARTICLE,
          sourceName: source.name,
          sourceType: source.type,
          author: (item as any).creator || (item as any).author,
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        });

        articles.push(article);
      }

      console.log(
        `[News] Found ${articles.length} new articles from ${source.name}`
      );
      return articles;
    } catch (error) {
      console.error(`[News] Error fetching ${source.name}:`, error);
      return [];
    }
  }

  async syncAllFeeds(): Promise<number> {
    let totalNew = 0;

    for (const source of DEFAULT_NEWS_SOURCES) {
      const articles = await this.fetchAndParseFeed(source);
      if (articles.length > 0) {
        await this.newsRepo.save(articles);
        totalNew += articles.length;
      }
    }

    console.log(`[News] Sync complete. Total new articles: ${totalNew}`);
    return totalNew;
  }

  async getNews(
    options: {
      source?: string;
      type?: NewsType;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<NewsArticle[]> {
    const { source, type, limit = 50, offset = 0 } = options;

    const where: any = {};
    if (source && source !== 'all') {
      where.sourceName = source;
    }
    if (type) {
      where.newsType = type;
    }

    return this.newsRepo.find({
      where,
      order: { publishedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async getSources(): Promise<string[]> {
    const result = await this.newsRepo
      .createQueryBuilder('news')
      .select('DISTINCT news.sourceName', 'sourceName')
      .getRawMany();
    return result.map((r) => r.sourceName);
  }

  async getArticleById(id: string): Promise<NewsArticle | null> {
    return this.newsRepo.findOne({ where: { id } });
  }
}
