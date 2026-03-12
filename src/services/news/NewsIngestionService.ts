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
    ],
  },
});

const YOUTUBE_API_KEY =
  process.env.YOUTUBE_API_KEY || 'AIzaSyBD1tcn9mmG4vZJovB9PF74KHWIrmgBZOc';

export interface NewsSourceConfig {
  name: string;
  url: string;
  type: NewsSourceType;
  priority: number;
}

export const DEFAULT_NEWS_SOURCES: NewsSourceConfig[] = [
  {
    name: 'Drop Site News',
    url: 'https://www.dropsitenews.com/feed',
    type: NewsSourceType.RSS,
    priority: 1,
  },
  {
    name: 'The Grayzone',
    url: 'https://thegrayzone.com/feed',
    type: NewsSourceType.RSS,
    priority: 2,
  },
  {
    name: 'The Intercept',
    url: 'https://theintercept.com/feed/rss',
    type: NewsSourceType.RSS,
    priority: 3,
  },
  {
    name: 'Democracy Now',
    url: 'https://www.democracynow.org/democracynow.rss',
    type: NewsSourceType.RSS,
    priority: 4,
  },
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    type: NewsSourceType.RSS,
    priority: 5,
  },
];

const YOUTUBE_CHANNELS = [
  { name: 'Secular Talk', handle: '@SecularTalk' },
  { name: 'Breaking Points', handle: '@breakingpoints' },
  { name: 'The Young Turks', handle: '@TheYoungTurks' },
  { name: 'Sabby Sabs', handle: '@SabbySabs' },
  { name: 'Bad Faith', handle: '@BadFaithPod' },
  { name: 'The Majority Report', handle: '@TheMajorityReport' },
  { name: 'Marc Lamont Hill', handle: '@MarcLamontHill' },
  { name: 'Thom Hartman', handle: '@ThomHartman' },
];

const INVIDIOUS_INSTANCES = [
  'https://yewtu.be',
  'https://invidious.snopyta.org',
  'https://invidious.kavin.rocks',
];

export class NewsIngestionService {
  private newsRepo = AppDataSource.getRepository(NewsArticle);

  async fetchYouTubeVideos(): Promise<NewsArticle[]> {
    const allVideos: NewsArticle[] = [];

    for (const channel of YOUTUBE_CHANNELS) {
      let success = false;

      for (const instance of INVIDIOUS_INSTANCES) {
        if (success) break;

        try {
          console.log(
            `[YouTube] Trying ${instance} for channel: ${channel.name}`
          );

          // Invidious uses @handle format
          const feedUrl = `${instance}/feed/@${channel.handle.replace('@', '')}/videos`;
          const response = await fetch(feedUrl);

          if (!response.ok) {
            console.log(`[YouTube] ${instance} failed: ${response.status}`);
            continue;
          }

          const feedText = await response.text();
          const feed = await parser.parseString(feedText);

          if (!feed.items || feed.items.length === 0) {
            console.log(
              `[YouTube] No items from ${instance} for ${channel.name}`
            );
            continue;
          }

          for (const item of feed.items.slice(0, 5)) {
            if (!item.link) continue;

            const videoUrl = item.link;

            const existing = await this.newsRepo.findOne({
              where: { url: videoUrl },
            });
            if (existing) continue;

            const videoIdMatch = videoUrl.match(
              /(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
            );
            const videoId = videoIdMatch ? videoIdMatch[1] : null;

            const article = this.newsRepo.create({
              title: item.title || 'Untitled',
              summary: item.contentSnippet || item.content || '',
              url: videoUrl,
              imageUrl: videoId
                ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
                : undefined,
              newsType: NewsType.VIDEO,
              sourceName: channel.name,
              sourceType: NewsSourceType.YOUTUBE,
              author: channel.name,
              publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            });

            allVideos.push(article);
          }

          console.log(
            `[YouTube] Got videos from ${instance} for ${channel.name}`
          );
          success = true;
        } catch (error) {
          console.log(
            `[YouTube] Error from ${instance}:`,
            (error as Error).message
          );
        }
      }

      if (!success) {
        console.log(
          `[YouTube] All instances failed for ${channel.name}, trying API key...`
        );

        // Fallback to YouTube Data API - first get channel's uploads playlist, then fetch videos
        try {
          // Use forHandle parameter to get channel by @handle
          const channelUrl = `https://www.googleapis.com/youtube/v3/channels?key=${YOUTUBE_API_KEY}&forHandle=${channel.handle}&part=contentDetails`;
          const channelResponse = await fetch(channelUrl);
          const channelData = (await channelResponse.json()) as any;

          console.log(
            `[YouTube] Channel API Response for ${channel.handle}:`,
            JSON.stringify(channelData).substring(0, 300)
          );

          let uploadsPlaylistId = null;
          if (
            channelData.items &&
            channelData.items[0]?.contentDetails?.relatedPlaylists?.uploads
          ) {
            uploadsPlaylistId =
              channelData.items[0].contentDetails.relatedPlaylists.uploads;
            console.log(
              `[YouTube] Found uploads playlist: ${uploadsPlaylistId}`
            );
          }

          if (!uploadsPlaylistId) {
            console.log(
              `[YouTube] No uploads playlist found for ${channel.name}, skipping`
            );
            continue;
          }

          const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?key=${YOUTUBE_API_KEY}&playlistId=${uploadsPlaylistId}&part=snippet&maxResults=10`;
          console.log(`[YouTube] Using playlist API for ${channel.name}`);
          const response = await fetch(playlistUrl);
          const data = (await response.json()) as any;

          console.log(
            `[YouTube] Playlist API Response status: ${response.status}`
          );

          if (data.error) {
            console.error(`[YouTube] Playlist API Error:`, data.error);
          } else if (data.items && data.items.length > 0) {
            for (const item of data.items) {
              const videoId = item.snippet?.resourceId?.videoId;
              if (!videoId) continue;

              const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

              const existing = await this.newsRepo.findOne({
                where: { url: videoUrl },
              });
              if (existing) continue;

              const article = this.newsRepo.create({
                title: item.snippet.title || 'Untitled',
                summary: item.snippet.description || '',
                url: videoUrl,
                imageUrl:
                  item.snippet.thumbnails?.high?.url ||
                  item.snippet.thumbnails?.medium?.url,
                newsType: NewsType.VIDEO,
                sourceName: channel.name,
                sourceType: NewsSourceType.YOUTUBE,
                author: channel.name,
                publishedAt: item.snippet.publishedAt
                  ? new Date(item.snippet.publishedAt)
                  : new Date(),
              });

              allVideos.push(article);
            }
            console.log(
              `[YouTube] Got ${data.items.length} videos via playlist API for ${channel.name}`
            );
          }
        } catch (apiError) {
          console.log(
            `[YouTube] API also failed for ${channel.name}:`,
            (apiError as Error).message
          );
        }
      }
    }

    return allVideos;
  }

  async syncYouTubeVideos(): Promise<number> {
    const videos = await this.fetchYouTubeVideos();
    if (videos.length > 0) {
      await this.newsRepo.save(videos);
    }
    console.log(`[YouTube] Sync complete. Total new videos: ${videos.length}`);
    return videos.length;
  }

  async fetchAndParseFeed(source: NewsSourceConfig): Promise<NewsArticle[]> {
    try {
      console.log(`[News] Fetching feed: ${source.name}`);
      const feed = await parser.parseURL(source.url);

      const articles: NewsArticle[] = [];

      for (const item of feed.items || []) {
        if (!item.link) continue;

        const existing = await this.newsRepo.findOne({
          where: { url: item.link },
        });
        if (existing) continue;

        let imageUrl =
          item.enclosure?.url ||
          item.mediaThumbnail?.url ||
          item.mediaContent?.url;

        const article = this.newsRepo.create({
          title: item.title || 'Untitled',
          summary: item.contentSnippet || item.content || '',
          content: item.content || '',
          url: item.link,
          imageUrl: imageUrl || undefined,
          newsType: NewsType.ARTICLE,
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

    const videoCount = await this.syncYouTubeVideos();
    totalNew += videoCount;

    console.log(`[News] Sync complete. Total new articles: ${totalNew}`);
    return totalNew;
  }

  async getNews(
    options: {
      source?: string;
      typeValue?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<NewsArticle[]> {
    const { source, typeValue, limit = 50, offset = 0 } = options;

    const where: any = {};
    if (source && source !== 'all') {
      where.sourceName = source;
    }
    if (typeValue) {
      where.newsType = typeValue;
    }

    return this.newsRepo.find({
      where,
      order: { publishedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async getSources(type?: string): Promise<string[]> {
    const qb = this.newsRepo
      .createQueryBuilder('news')
      .select('DISTINCT news.sourceName', 'sourceName');

    if (type) {
      qb.where('news.sourceType = :type', { type });
    }

    const result = await qb.getRawMany();
    return result.map((r) => r.sourceName);
  }

  async getArticleById(id: string): Promise<NewsArticle | null> {
    return this.newsRepo.findOne({ where: { id } });
  }
}
