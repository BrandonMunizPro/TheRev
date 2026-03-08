import { EntityManager, Repository, Entity } from 'typeorm';
import {
  EnterpriseAuditEvent,
  EnterpriseAuditFilter,
  AuditAggregation,
  AuditCategory,
  EnterpriseAuditEventType,
  DataAccessRecord,
  ConsentRecord,
} from './EnterpriseAuditTypes';
import { IEnterpriseAuditRepository } from './EnterpriseAuditService';

@Entity('enterprise_audit_log')
export class EnterpriseAuditEntity {
  id: string;
  category: AuditCategory;
  eventType: string;
  timestamp: Date;
  userId?: string;
  targetUserId?: string;
  resourceType?: string;
  resourceId?: string;
  action: string;
  outcome: string;
  ipAddress?: string;
  userAgent?: string;
  provider?: string;
  metadata: Record<string, unknown>;
  severity: string;
  complianceFlags?: string[];
  retentionDays?: number;
}

export class TypeORMEnterpriseAuditRepository implements IEnterpriseAuditRepository {
  private em: EntityManager;
  private repo: Repository<EnterpriseAuditEntity>;

  constructor(em: EntityManager) {
    this.em = em;
    this.repo = em.getRepository(EnterpriseAuditEntity);
  }

  async save(event: EnterpriseAuditEvent): Promise<void> {
    const entity = this.toEntity(event);
    await this.repo.save(entity);
  }

  async saveBatch(events: EnterpriseAuditEvent[]): Promise<void> {
    if (events.length === 0) return;
    
    const entities = events.map(e => this.toEntity(e));
    await this.repo.save(entities);
  }

  private toEntity(event: EnterpriseAuditEvent): EnterpriseAuditEntity {
    return {
      id: event.id,
      category: event.category,
      eventType: event.eventType as string,
      timestamp: event.timestamp,
      userId: event.userId,
      targetUserId: event.targetUserId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      action: event.action,
      outcome: event.outcome,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      provider: event.provider,
      metadata: event.metadata,
      severity: event.severity,
      complianceFlags: event.complianceFlags,
      retentionDays: event.retentionDays,
    };
  }

  async findByFilter(filter: EnterpriseAuditFilter): Promise<EnterpriseAuditEvent[]> {
    const qb = this.repo.createQueryBuilder('audit');

    if (filter.categories?.length) {
      qb.andWhere('audit.category IN (:...categories)', { categories: filter.categories });
    }
    if (filter.eventTypes?.length) {
      qb.andWhere('audit.eventType IN (:...eventTypes)', { eventTypes: filter.eventTypes });
    }
    if (filter.userId) {
      qb.andWhere('audit.userId = :userId', { userId: filter.userId });
    }
    if (filter.targetUserId) {
      qb.andWhere('audit.targetUserId = :targetUserId', { targetUserId: filter.targetUserId });
    }
    if (filter.resourceType) {
      qb.andWhere('audit.resourceType = :resourceType', { resourceType: filter.resourceType });
    }
    if (filter.resourceId) {
      qb.andWhere('audit.resourceId = :resourceId', { resourceId: filter.resourceId });
    }
    if (filter.action) {
      qb.andWhere('audit.action = :action', { action: filter.action });
    }
    if (filter.outcome) {
      qb.andWhere('audit.outcome = :outcome', { outcome: filter.outcome });
    }
    if (filter.startDate) {
      qb.andWhere('audit.timestamp >= :startDate', { startDate: filter.startDate });
    }
    if (filter.endDate) {
      qb.andWhere('audit.timestamp <= :endDate', { endDate: filter.endDate });
    }
    if (filter.severity) {
      qb.andWhere('audit.severity = :severity', { severity: filter.severity });
    }

    qb.orderBy('audit.timestamp', 'DESC');

    if (filter.limit) {
      qb.take(filter.limit);
    }
    if (filter.offset) {
      qb.skip(filter.offset);
    }

    const entities = await qb.getMany();
    return entities.map(this.toEvent);
  }

  private toEvent(entity: EnterpriseAuditEntity): EnterpriseAuditEvent {
    return {
      id: entity.id,
      category: entity.category,
      eventType: entity.eventType as EnterpriseAuditEventType,
      timestamp: entity.timestamp,
      userId: entity.userId,
      targetUserId: entity.targetUserId,
      resourceType: entity.resourceType,
      resourceId: entity.resourceId,
      action: entity.action as any,
      outcome: entity.outcome as any,
      ipAddress: entity.ipAddress,
      userAgent: entity.userAgent,
      provider: entity.provider,
      metadata: entity.metadata,
      severity: entity.severity as any,
      complianceFlags: entity.complianceFlags,
      retentionDays: entity.retentionDays,
    };
  }

  async aggregate(filter: EnterpriseAuditFilter): Promise<AuditAggregation> {
    const qb = this.repo.createQueryBuilder('audit');

    if (filter.categories?.length) {
      qb.andWhere('audit.category IN (:...categories)', { categories: filter.categories });
    }
    if (filter.userId) {
      qb.andWhere('audit.userId = :userId', { userId: filter.userId });
    }
    if (filter.startDate) {
      qb.andWhere('audit.timestamp >= :startDate', { startDate: filter.startDate });
    }
    if (filter.endDate) {
      qb.andWhere('audit.timestamp <= :endDate', { endDate: filter.endDate });
    }

    const totalEvents = await qb.getCount();

    const byCategory = await qb
      .clone()
      .select('audit.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.category')
      .getRawMany();

    const byEventType = await qb
      .clone()
      .select('audit.eventType', 'eventType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.eventType')
      .getRawMany();

    const byOutcome = await qb
      .clone()
      .select('audit.outcome', 'outcome')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.outcome')
      .getRawMany();

    const bySeverity = await qb
      .clone()
      .select('audit.severity', 'severity')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.severity')
      .getRawMany();

    const timeSeries = await qb
      .clone()
      .select("DATE_TRUNC('day', audit.timestamp)", 'date')
      .addSelect('COUNT(*)', 'count')
      .addSelect('audit.category', 'category')
      .groupBy("DATE_TRUNC('day', audit.timestamp)")
      .addGroupBy('audit.category')
      .orderBy('date', 'ASC')
      .getRawMany();

    const topUsers = await qb
      .clone()
      .select('audit.userId', 'userId')
      .addSelect('COUNT(*)', 'count')
      .where('audit.userId IS NOT NULL')
      .groupBy('audit.userId')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    const topResources = await qb
      .clone()
      .select('audit.resourceType', 'resourceType')
      .addSelect('COUNT(*)', 'count')
      .where('audit.resourceType IS NOT NULL')
      .groupBy('audit.resourceType')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      totalEvents,
      byCategory: Object.fromEntries(byCategory.map((r: any) => [r.category, parseInt(r.count)])),
      byEventType: Object.fromEntries(byEventType.map((r: any) => [r.eventType, parseInt(r.count)])),
      byOutcome: Object.fromEntries(byOutcome.map((r: any) => [r.outcome, parseInt(r.count)])),
      bySeverity: Object.fromEntries(bySeverity.map((r: any) => [r.severity, parseInt(r.count)])),
      timeSeries: timeSeries.map((r: any) => ({ date: r.date, count: parseInt(r.count), category: r.category })),
      topUsers: topUsers.map((r: any) => ({ userId: r.userId, count: parseInt(r.count) })),
      topResources: topResources.map((r: any) => ({ resourceType: r.resourceType, count: parseInt(r.count) })),
    };
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('timestamp < :date', { date })
      .execute();
    return result.affected || 0;
  }

  async getDataAccessRecords(userId: string, startDate: Date, endDate: Date): Promise<DataAccessRecord[]> {
    const records = await this.repo
      .createQueryBuilder('audit')
      .select('audit.userId', 'userId')
      .addSelect('audit.resourceType', 'resourceType')
      .addSelect('audit.resourceId', 'resourceId')
      .addSelect('audit.action', 'accessType')
      .addSelect('audit.timestamp', 'timestamp')
      .addSelect('audit.ipAddress', 'ipAddress')
      .where('audit.userId = :userId', { userId })
      .andWhere('audit.timestamp >= :startDate', { startDate })
      .andWhere('audit.timestamp <= :endDate', { endDate })
      .andWhere('audit.category = :category', { category: AuditCategory.DATA_ACCESS })
      .orderBy('audit.timestamp', 'DESC')
      .getRawMany();

    return records;
  }

  async getConsentRecords(userId: string): Promise<ConsentRecord[]> {
    const records = await this.repo
      .createQueryBuilder('audit')
      .select('audit.userId', 'userId')
      .addSelect('audit.metadata', 'metadata')
      .addSelect('audit.timestamp', 'grantedAt')
      .where('audit.userId = :userId', { userId })
      .andWhere('audit.eventType LIKE :eventType', { eventType: '%CONSENT%' })
      .orderBy('audit.timestamp', 'DESC')
      .getRawMany();

    return records.map((r: any) => ({
      userId: r.userId,
      consentType: 'explicit',
      categories: [],
      grantedAt: r.grantedAt,
      purpose: r.metadata?.purpose || '',
    }));
  }
}
