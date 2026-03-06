import express, { Express, Request, Response, NextFunction } from 'express';
import { createYoga, YogaInitialContext } from 'graphql-yoga';
import { createHash } from 'crypto';
import { GraphQLSchema } from 'graphql';

export interface GatewayConfig {
  port: number;
  backendInstances: BackendInstance[];
  cacheEnabled?: boolean;
  cacheTTL?: number;
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  loadBalancingStrategy?: 'round-robin' | 'weighted' | 'least-connections';
}

export interface BackendInstance {
  id: string;
  url: string;
  healthCheckUrl: string;
  weight: number;
  isHealthy: boolean;
  lastHealthCheck: number;
  currentRequests: number;
}

export interface IRegistry {
  instances: Map<string, BackendInstance>;
  addInstance(instance: BackendInstance): void;
  removeInstance(id: string): void;
  getHealthyInstances(): BackendInstance[];
  getInstanceById(id: string): BackendInstance | undefined;
  updateHealth(id: string, isHealthy: boolean): void;
}

export interface CacheEntry {
  key: string;
  value: any;
  expiresAt: number;
}

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class GraphQLGateway {
  private app: Express;
  private config: GatewayConfig;
  private registry: InstanceRegistry;
  private cache: Map<string, CacheEntry>;
  private rateLimits: Map<string, RateLimitEntry>;
  private rrIndex: number = 0;

  constructor(config: GatewayConfig) {
    this.app = express();
    this.config = config;
    this.registry = new InstanceRegistry(config.backendInstances);
    this.cache = new Map();
    this.rateLimits = new Map();

    this.setupMiddleware();
    this.setupRoutes();
    this.startHealthChecks();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(
          `[Gateway] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`
        );
      });
      next();
    });

    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (!this.checkRateLimit(req)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }
      next();
    });
  }

  private setupRoutes(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        instances: this.registry.getHealthyInstances().length,
        total: this.registry.instances.size,
        cacheSize: this.cache.size,
      });
    });

    this.app.get('/gateway/status', (req: Request, res: Response) => {
      res.json({
        instances: Array.from(this.registry.instances.values()).map((i) => ({
          id: i.id,
          url: i.url,
          isHealthy: i.isHealthy,
          weight: i.weight,
          currentRequests: i.currentRequests,
        })),
        cache: {
          entries: this.cache.size,
          ttl: this.config.cacheTTL,
        },
      });
    });

    this.app.post('/gateway/register', (req: Request, res: Response) => {
      const { id, url, healthCheckUrl, weight } = req.body;
      if (!id || !url) {
        res.status(400).json({ error: 'Missing id or url' });
        return;
      }
      this.registry.addInstance({
        id,
        url,
        healthCheckUrl: healthCheckUrl || `${url}/health`,
        weight: weight || 1,
        isHealthy: true,
        lastHealthCheck: Date.now(),
        currentRequests: 0,
      });
      res.json({ success: true });
    });

    this.app.post('/graphql', async (req: Request, res: Response) => {
      try {
        const { query, variables, operationName } = req.body;

        const cacheKey = this.getCacheKey(query, variables);

        if (this.config.cacheEnabled) {
          const cached = this.getFromCache(cacheKey);
          if (cached) {
            res.json(cached);
            return;
          }
        }

        const instance = this.selectBackend(query, variables);

        if (!instance) {
          res
            .status(503)
            .json({ error: 'No healthy backend instances available' });
          return;
        }

        instance.currentRequests++;

        try {
          const response = await fetch(`${instance.url}/graphql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Gateway-Request-Id': this.generateRequestId(),
            },
            body: JSON.stringify({ query, variables, operationName }),
          });

          const result = await response.json();

          if (this.config.cacheEnabled && !this.isMutation(query)) {
            this.setCache(cacheKey, result);
          }

          res.json(result);
        } finally {
          instance.currentRequests--;
        }
      } catch (error) {
        console.error('[Gateway] Proxy error:', error);
        res.status(502).json({ error: 'Backend error' });
      }
    });

    this.app.get('/graphql', (req: Request, res: Response) => {
      res.redirect('/gateway/status');
    });
  }

  private selectBackend(
    query: string,
    variables?: any
  ): BackendInstance | null {
    const instances = this.registry.getHealthyInstances();
    if (instances.length === 0) return null;

    const strategy = this.config.loadBalancingStrategy || 'least-connections';
    const isQuery = query.trim().startsWith('query');
    const isMutation = query.trim().startsWith('mutation');

    if (isMutation || strategy === 'weighted') {
      return this.selectByWeight(instances);
    }

    if (strategy === 'round-robin') {
      const selected = instances[this.rrIndex % instances.length];
      this.rrIndex++;
      return selected;
    }

    if (isQuery || strategy === 'least-connections') {
      const leastLoaded = instances.reduce((min, inst) =>
        inst.currentRequests < min.currentRequests ? inst : min
      );
      return leastLoaded;
    }

    return instances[0];
  }

  private selectByWeight(instances: BackendInstance[]): BackendInstance {
    const totalWeight = instances.reduce((sum, inst) => sum + inst.weight, 0);
    let random = Math.random() * totalWeight;

    for (const instance of instances) {
      random -= instance.weight;
      if (random <= 0) return instance;
    }

    return instances[0];
  }

  private getCacheKey(query: string, variables?: any): string {
    const data = JSON.stringify({ query, variables });
    return createHash('sha256').update(data).digest('hex');
  }

  private getFromCache(key: string): any | null {
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      console.log('[Gateway] Cache hit:', key.substring(0, 8));
      return entry.value;
    }
    if (entry) {
      this.cache.delete(key);
    }
    return null;
  }

  private setCache(key: string, value: any): void {
    const ttl = this.config.cacheTTL || 5000;
    this.cache.set(key, {
      key,
      value,
      expiresAt: Date.now() + ttl,
    });

    if (this.cache.size > 1000) {
      const oldest = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].expiresAt - b[1].expiresAt
      )[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
  }

  private isMutation(query: string): boolean {
    return query.trim().toLowerCase().startsWith('mutation');
  }

  private checkRateLimit(req: Request): boolean {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const window = this.config.rateLimitWindowMs || 60000;
    const max = this.config.rateLimitMaxRequests || 100;

    let entry = this.rateLimits.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + window };
      this.rateLimits.set(key, entry);
    }

    entry.count++;
    return entry.count <= max;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private startHealthChecks(): void {
    setInterval(async () => {
      for (const [id, instance] of this.registry.instances) {
        try {
          const response = await fetch(instance.healthCheckUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
          });
          const isHealthy = response.ok;
          this.registry.updateHealth(id, isHealthy);
        } catch {
          this.registry.updateHealth(id, false);
        }
      }
    }, 10000);
  }

  start(): void {
    this.app.listen(this.config.port, () => {
      console.log(
        `[Gateway] GraphQL Gateway running on port ${this.config.port}`
      );
    });
  }
}

class InstanceRegistry {
  instances: Map<string, BackendInstance>;

  constructor(initialInstances: BackendInstance[]) {
    this.instances = new Map();
    initialInstances.forEach((inst) => this.instances.set(inst.id, inst));
  }

  addInstance(instance: BackendInstance): void {
    this.instances.set(instance.id, instance);
    console.log(
      `[Gateway] Registered instance: ${instance.id} at ${instance.url}`
    );
  }

  removeInstance(id: string): void {
    this.instances.delete(id);
    console.log(`[Gateway] Removed instance: ${id}`);
  }

  getHealthyInstances(): BackendInstance[] {
    return Array.from(this.instances.values()).filter((inst) => inst.isHealthy);
  }

  getInstanceById(id: string): BackendInstance | undefined {
    return this.instances.get(id);
  }

  updateHealth(id: string, isHealthy: boolean): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.isHealthy = isHealthy;
      instance.lastHealthCheck = Date.now();
    }
  }
}

export function createGateway(config: GatewayConfig): GraphQLGateway {
  return new GraphQLGateway(config);
}
