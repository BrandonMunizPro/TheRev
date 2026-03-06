import { EventEmitter } from 'events';

export interface ServiceInstance {
  id: string;
  name: string;
  address: string;
  port: number;
  healthUrl: string;
  metadata: Record<string, any>;
  status: 'healthy' | 'unhealthy' | 'starting';
  lastHeartbeat: number;
  weight: number;
}

export interface ServiceDefinition {
  name: string;
  version: string;
  instances: Map<string, ServiceInstance>;
}

export class ServiceDiscovery extends EventEmitter {
  private services: Map<string, ServiceDefinition>;
  private heartbeatInterval: number;
  private readonly HEARTBEAT_TIMEOUT = 30000;

  constructor(heartbeatIntervalMs: number = 10000) {
    super();
    this.services = new Map();
    this.heartbeatInterval = heartbeatIntervalMs;
    this.startHealthMonitor();
  }

  registerService(instance: ServiceInstance): void {
    let serviceDef = this.services.get(instance.name);

    if (!serviceDef) {
      serviceDef = {
        name: instance.name,
        version: instance.metadata?.version || 'v1',
        instances: new Map(),
      };
      this.services.set(instance.name, serviceDef);
    }

    instance.status = 'healthy';
    instance.lastHeartbeat = Date.now();
    serviceDef.instances.set(instance.id, instance);

    console.log(
      `[ServiceDiscovery] Registered ${instance.name}:${instance.id} at ${instance.address}:${instance.port}`
    );
    this.emit('instance:registered', instance);
  }

  deregisterService(serviceName: string, instanceId: string): void {
    const serviceDef = this.services.get(serviceName);
    if (serviceDef) {
      const instance = serviceDef.instances.get(instanceId);
      serviceDef.instances.delete(instanceId);

      if (instance) {
        console.log(
          `[ServiceDiscovery] Deregistered ${serviceName}:${instanceId}`
        );
        this.emit('instance:deregistered', instance);
      }
    }
  }

  heartbeat(serviceName: string, instanceId: string): void {
    const serviceDef = this.services.get(serviceName);
    if (serviceDef) {
      const instance = serviceDef.instances.get(instanceId);
      if (instance) {
        instance.lastHeartbeat = Date.now();
        instance.status = 'healthy';
      }
    }
  }

  getHealthyInstances(serviceName: string): ServiceInstance[] {
    const serviceDef = this.services.get(serviceName);
    if (!serviceDef) return [];

    return Array.from(serviceDef.instances.values())
      .filter((inst) => inst.status === 'healthy')
      .sort((a, b) => b.weight - a.weight);
  }

  getInstanceById(
    serviceName: string,
    instanceId: string
  ): ServiceInstance | undefined {
    return this.services.get(serviceName)?.instances.get(instanceId);
  }

  getAllServices(): { name: string; version: string; instanceCount: number }[] {
    return Array.from(this.services.values()).map((s) => ({
      name: s.name,
      version: s.version,
      instanceCount: s.instances.size,
    }));
  }

  getServiceUrl(
    serviceName: string,
    strategy: 'random' | 'round-robin' | 'least-loaded' = 'random'
  ): string | null {
    const instances = this.getHealthyInstances(serviceName);
    if (instances.length === 0) return null;

    let selected: ServiceInstance;
    switch (strategy) {
      case 'random':
        selected = instances[Math.floor(Math.random() * instances.length)];
        break;
      case 'round-robin':
        selected = instances[0];
        break;
      case 'least-loaded':
        selected = instances.sort(
          (a, b) => (a.metadata?.load || 0) - (b.metadata?.load || 0)
        )[0];
        break;
      default:
        selected = instances[0];
    }

    return `http://${selected.address}:${selected.port}`;
  }

  private startHealthMonitor(): void {
    setInterval(() => {
      const now = Date.now();

      for (const [serviceName, serviceDef] of this.services) {
        for (const [instanceId, instance] of serviceDef.instances) {
          if (now - instance.lastHeartbeat > this.HEARTBEAT_TIMEOUT) {
            instance.status = 'unhealthy';
            console.warn(
              `[ServiceDiscovery] Instance ${serviceName}:${instanceId} marked unhealthy (no heartbeat)`
            );
            this.emit('instance:unhealthy', instance);
          }
        }
      }
    }, this.heartbeatInterval);
  }

  async healthCheck(instance: ServiceInstance): Promise<boolean> {
    try {
      const response = await fetch(instance.healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const serviceDiscovery = new ServiceDiscovery();
