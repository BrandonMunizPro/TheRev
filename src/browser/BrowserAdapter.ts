import { EventEmitter } from 'events';
import { BrowserSandbox, SandboxConfig } from './BrowserSandbox';
import { BrowserManager } from './BrowserManager';

export enum BrowserEngine {
  PUPPETEER = 'puppeteer',
  PLAYWRIGHT = 'playwright',
}

export interface BrowserAdapterConfig {
  engine: BrowserEngine;
  headless?: boolean;
  sandbox?: boolean;
  userDataDir?: string;
  args?: string[];
  viewport?: { width: number; height: number };
  userAgent?: string;
  proxy?: string;
  timeout?: number;
}

export interface PuppeteerBrowserAdapter {
  new (config: BrowserAdapterConfig): PuppeteerBrowserAdapter;
  launch(): Promise<any>;
  close(): Promise<void>;
  newPage(): Promise<any>;
}

export interface PlaywrightBrowserAdapter {
  new (config: BrowserAdapterConfig): PlaywrightBrowserAdapter;
  launch(): Promise<any>;
  close(): Promise<void>;
  newPage(): Promise<any>;
}

export class BrowserAdapter extends EventEmitter {
  private engine: BrowserEngine;
  private config: BrowserAdapterConfig;
  private browser: any = null;
  private pages: Map<string, any> = new Map();
  private isConnected = false;

  constructor(config: BrowserAdapterConfig) {
    super();
    this.engine = config.engine;
    this.config = {
      headless: true,
      sandbox: true,
      ...config,
    };
  }

  async launch(): Promise<void> {
    try {
      if (this.engine === BrowserEngine.PUPPETEER) {
        await this.launchPuppeteer();
      } else {
        await this.launchPlaywright();
      }
      this.isConnected = true;
      this.emit('launched');
      console.log(`Browser launched with ${this.engine}`);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private async launchPuppeteer(): Promise<void> {
    try {
      const puppeteer = require('puppeteer');

      const launchOptions: any = {
        headless: this.config.headless,
        args: this.getBrowserArgs(),
      };

      if (this.config.userDataDir) {
        launchOptions.userDataDir = this.config.userDataDir;
      }

      if (this.config.proxy) {
        launchOptions.args.push(`--proxy-server=${this.config.proxy}`);
      }

      this.browser = await puppeteer.launch(launchOptions);

      this.browser.on('disconnected', () => {
        this.isConnected = false;
        this.emit('disconnected');
      });
    } catch (error) {
      console.error('Failed to launch Puppeteer:', error);
      throw error;
    }
  }

  private async launchPlaywright(): Promise<void> {
    try {
      const playwright = require('playwright');
      const { chromium } = playwright;

      const launchOptions: any = {
        headless: this.config.headless,
        args: this.getBrowserArgs(),
      };

      if (this.config.proxy) {
        launchOptions.proxy = { server: this.config.proxy };
      }

      this.browser = await chromium.launch(launchOptions);

      this.browser.on('disconnected', () => {
        this.isConnected = false;
        this.emit('disconnected');
      });
    } catch (error) {
      console.error('Failed to launch Playwright:', error);
      throw error;
    }
  }

  private getBrowserArgs(): string[] {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ];

    if (!this.config.sandbox) {
      args.push('--no-sandbox');
    }

    if (this.config.args) {
      args.push(...this.config.args);
    }

    return args;
  }

  async newPage(pageId: string): Promise<any> {
    if (!this.browser) {
      throw new Error('Browser not launched');
    }

    let page: any;

    if (this.engine === BrowserEngine.PUPPETEER) {
      page = await this.browser.newPage();
    } else {
      page = await this.browser.newPage();
    }

    if (this.config.viewport) {
      await page.setViewport(this.config.viewport);
    }

    if (this.config.userAgent) {
      await page.setUserAgent(this.config.userAgent);
    }

    this.pages.set(pageId, page);
    this.emit('page:created', pageId);

    return page;
  }

  async closePage(pageId: string): Promise<void> {
    const page = this.pages.get(pageId);
    if (page) {
      await page.close();
      this.pages.delete(pageId);
      this.emit('page:closed', pageId);
    }
  }

  getPage(pageId: string): any {
    return this.pages.get(pageId);
  }

  async close(): Promise<void> {
    const closePromises = Array.from(this.pages.keys()).map((id) =>
      this.closePage(id)
    );
    await Promise.all(closePromises);

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isConnected = false;
      this.emit('closed');
    }
  }

  isBrowserConnected(): boolean {
    return this.isConnected;
  }

  getEngine(): BrowserEngine {
    return this.engine;
  }

  getPageCount(): number {
    return this.pages.size;
  }
}

export interface PuppeteerServiceConfig {
  maxConcurrentBrowsers: number;
  defaultViewport: { width: number; height: number };
  defaultTimeout: number;
  retryAttempts: number;
}

const DEFAULT_SERVICE_CONFIG: PuppeteerServiceConfig = {
  maxConcurrentBrowsers: 5,
  defaultViewport: { width: 1920, height: 1080 },
  defaultTimeout: 30000,
  retryAttempts: 3,
};

export class PuppeteerService extends EventEmitter {
  private adapters: Map<string, BrowserAdapter> = new Map();
  private config: PuppeteerServiceConfig;
  private activeAdapters = 0;

  constructor(config: Partial<PuppeteerServiceConfig> = {}) {
    super();
    this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
  }

  async acquireAdapter(
    adapterId: string,
    browserConfig?: BrowserAdapterConfig
  ): Promise<BrowserAdapter> {
    const existing = this.adapters.get(adapterId);
    if (existing && existing.isBrowserConnected()) {
      return existing;
    }

    if (this.activeAdapters >= this.config.maxConcurrentBrowsers) {
      await this.waitForAvailableSlot();
    }

    const adapter = new BrowserAdapter({
      engine: browserConfig?.engine || BrowserEngine.PUPPETEER,
      headless: browserConfig?.headless ?? true,
      viewport: browserConfig?.viewport || this.config.defaultViewport,
      timeout: browserConfig?.timeout || this.config.defaultTimeout,
    });

    await adapter.launch();
    this.adapters.set(adapterId, adapter);
    this.activeAdapters++;

    adapter.on('disconnected', () => {
      this.activeAdapters = Math.max(0, this.activeAdapters - 1);
      this.emit('adapter:disconnected', adapterId);
    });

    this.emit('adapter:acquired', adapterId);
    return adapter;
  }

  async releaseAdapter(adapterId: string): Promise<void> {
    const adapter = this.adapters.get(adapterId);
    if (adapter) {
      await adapter.close();
      this.adapters.delete(adapterId);
      this.activeAdapters = Math.max(0, this.activeAdapters - 1);
      this.emit('adapter:released', adapterId);
    }
  }

  getAdapter(adapterId: string): BrowserAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  private async waitForAvailableSlot(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.activeAdapters < this.config.maxConcurrentBrowsers) {
          resolve();
        } else {
          setTimeout(check, 1000);
        }
      };
      check();
    });
  }

  async shutdown(): Promise<void> {
    const closePromises = Array.from(this.adapters.keys()).map((id) =>
      this.releaseAdapter(id)
    );
    await Promise.all(closePromises);
    console.log('Puppeteer service shutdown complete');
  }

  getStats(): {
    activeAdapters: number;
    maxConcurrent: number;
    available: number;
  } {
    return {
      activeAdapters: this.activeAdapters,
      maxConcurrent: this.config.maxConcurrentBrowsers,
      available: this.config.maxConcurrentBrowsers - this.activeAdapters,
    };
  }
}
