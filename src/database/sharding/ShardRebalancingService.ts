/**
 * Shard Rebalancing Service
 * Analyzes shard distribution and generates rebalancing suggestions
 * Detects imbalances in load, storage, and hot users
 */

import { EventEmitter } from 'events';
import { ShardType, ShardEntityType } from './IShardRouter';
import { ShardHealthMonitor } from './ShardHealthMonitor';
import { ShardMetricsCollector } from './ShardMetricsCollector';
import { SmartShardRouter } from './SmartShardRouter';
import { ValidationError, ErrorCode } from '../../errors/AppError';

export interface RebalancingConfig {
  enableAutoRebalancing: boolean;
  loadImbalanceThreshold: number;
  storageImbalanceThreshold: number;
  hotUserImbalanceThreshold: number;
  minRebalancingIntervalMs: number;
  maxSuggestionsPerAnalysis: number;
  enableStorageMonitoring: boolean;
  enableHotUserTracking: boolean;
}

export interface ShardLoadInfo {
  shardId: number;
  shardType: ShardType;
  loadPercentage: number;
  queriesPerMinute: number;
  avgLatencyMs: number;
  errorRate: number;
  activeConnections: number;
}

export interface ShardStorageInfo {
  shardId: number;
  shardType: ShardType;
  usedBytes: number;
  totalBytes: number;
  utilizationPercentage: number;
  recordCount: number;
}

export interface HotUserDistribution {
  shardId: number;
  shardType: ShardType;
  hotUserCount: number;
  hotUserPercentage: number;
  topHotUsers: Array<{
    userId: string;
    activityScore: number;
    averageRequestsPerMinute: number;
  }>;
}

export interface RebalancingSuggestion {
  id: string;
  type:
    | 'move_hot_user'
    | 'add_shard'
    | 'remove_shard'
    | 'migrate_data'
    | 'split_shard'
    | 'merge_shards';
  priority: 'critical' | 'high' | 'medium' | 'low';
  sourceShard?: {
    shardId: number;
    shardType: ShardType;
  };
  targetShard?: {
    shardId: number;
    shardType: ShardType;
  };
  affectedEntities?: Array<{
    entityType: ShardEntityType;
    entityKey: string;
    reason: string;
  }>;
  estimatedImpact: {
    loadReduction: number;
    improvedBalance: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  reasoning: string;
  createdAt: Date;
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large';
}

export interface RebalancingAnalysis {
  id: string;
  timestamp: Date;
  shardType: ShardType;
  loadDistribution: ShardLoadInfo[];
  storageDistribution: ShardStorageInfo[];
  hotUserDistribution: HotUserDistribution[];
  overallBalanceScore: number;
  suggestions: RebalancingSuggestion[];
  summary: string;
}

export class ShardRebalancingService extends EventEmitter {
  private healthMonitor: ShardHealthMonitor;
  private metricsCollector: ShardMetricsCollector;
  private smartRouter?: SmartShardRouter;
  private config: RebalancingConfig;
  private lastAnalysis: Map<ShardType, RebalancingAnalysis> = new Map();
  private analysisInterval: NodeJS.Timeout | null = null;
  private analyzing: Map<ShardType, boolean> = new Map();
  private recentSuggestions: Map<
    string,
    { timestamp: number; suppressedUntil: number }
  > = new Map();
  private plannedSuggestionIds: Set<string> = new Set();

  constructor(
    healthMonitor: ShardHealthMonitor,
    metricsCollector: ShardMetricsCollector,
    smartRouter?: SmartShardRouter,
    config?: Partial<RebalancingConfig>
  ) {
    super();
    this.healthMonitor = healthMonitor;
    this.metricsCollector = metricsCollector;
    this.smartRouter = smartRouter;
    this.config = {
      enableAutoRebalancing: false,
      loadImbalanceThreshold: 0.3,
      storageImbalanceThreshold: 0.25,
      hotUserImbalanceThreshold: 0.2,
      minRebalancingIntervalMs: 300000,
      maxSuggestionsPerAnalysis: 10,
      enableStorageMonitoring: true,
      enableHotUserTracking: true,
      ...config,
    };
  }

  startAutoAnalysis(intervalMs: number = 3600000): void {
    if (this.analysisInterval) {
      return;
    }

    this.analysisInterval = setInterval(() => {
      this.analyzeAllShardTypes();
    }, intervalMs);

    this.analysisInterval.unref();
    console.log('Shard rebalancing auto-analysis started');
    this.emit('autoAnalysis:started', { intervalMs });
  }

  stopAutoAnalysis(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    console.log('Shard rebalancing auto-analysis stopped');
  }

  async analyzeShardType(shardType: ShardType): Promise<RebalancingAnalysis> {
    const lastAnalysis = this.lastAnalysis.get(shardType);
    const now = Date.now();
    if (
      lastAnalysis &&
      now - lastAnalysis.timestamp.getTime() <
        this.config.minRebalancingIntervalMs
    ) {
      return lastAnalysis;
    }

    const isCurrentlyAnalyzing = this.analyzing.get(shardType) ?? false;
    if (isCurrentlyAnalyzing) {
      return lastAnalysis || this.createEmptyAnalysis(shardType);
    }

    this.analyzing.set(shardType, true);

    try {
      const loadDistribution = await this.analyzeLoadDistribution(shardType);
      const storageDistribution =
        await this.analyzeStorageDistribution(shardType);
      const hotUserDistribution =
        await this.analyzeHotUserDistribution(shardType);

      const overallBalanceScore = this.calculateBalanceScore(
        loadDistribution,
        storageDistribution,
        hotUserDistribution
      );

      const suggestions = this.generateSuggestions(
        loadDistribution,
        storageDistribution,
        hotUserDistribution,
        shardType
      );

      const analysis: RebalancingAnalysis = {
        id: `analysis_${shardType}_${Date.now()}`,
        timestamp: new Date(),
        shardType,
        loadDistribution,
        storageDistribution,
        hotUserDistribution,
        overallBalanceScore,
        suggestions,
        summary: this.generateSummary(overallBalanceScore, suggestions),
      };

      this.lastAnalysis.set(shardType, analysis);
      this.emit('analysis:completed', analysis);

      if (suggestions.some((s) => s.priority === 'critical')) {
        this.emit('alert:criticalImbalance', analysis);
      }

      return analysis;
    } finally {
      this.analyzing.set(shardType, false);
    }
  }

  private createEmptyAnalysis(shardType: ShardType): RebalancingAnalysis {
    return {
      id: `empty_${shardType}_${Date.now()}`,
      timestamp: new Date(),
      shardType,
      loadDistribution: [],
      storageDistribution: [],
      hotUserDistribution: [],
      overallBalanceScore: 100,
      suggestions: [],
      summary: 'Analysis in progress, please retry',
    };
  }

  async analyzeAllShardTypes(): Promise<RebalancingAnalysis[]> {
    const analyses = await Promise.all([
      this.analyzeShardType(ShardType.USERS),
      this.analyzeShardType(ShardType.CONTENT),
      this.analyzeShardType(ShardType.AI_TASKS),
    ]);

    this.emit('analysis:allCompleted', analyses);
    return analyses;
  }

  private async analyzeLoadDistribution(
    shardType: ShardType
  ): Promise<ShardLoadInfo[]> {
    const allMetrics = await this.metricsCollector.collectMetrics();
    const filteredMetrics = allMetrics.filter((m) => m.shardType === shardType);

    const totalQueries = filteredMetrics.reduce(
      (sum, m) => sum + m.throughput.queriesPerMinute,
      0
    );

    return filteredMetrics.map((metrics) => ({
      shardId: metrics.shardId,
      shardType: metrics.shardType,
      loadPercentage:
        totalQueries > 0
          ? (metrics.throughput.queriesPerMinute / totalQueries) * 100
          : 0,
      queriesPerMinute: metrics.throughput.queriesPerMinute,
      avgLatencyMs: metrics.performance.avgLatencyMs,
      errorRate: metrics.health.errorRate,
      activeConnections: metrics.resources.activeConnections,
    }));
  }

  private async analyzeStorageDistribution(
    shardType: ShardType
  ): Promise<ShardStorageInfo[]> {
    const simulatedStorage: ShardStorageInfo[] = [];
    const shardConfigs = this.getShardCountForType(shardType);

    for (let i = 0; i < shardConfigs; i++) {
      const usedBytes =
        Math.floor(Math.random() * 80 * 1024 * 1024 * 1024) +
        10 * 1024 * 1024 * 1024;
      const totalBytes = 100 * 1024 * 1024 * 1024;

      simulatedStorage.push({
        shardId: i,
        shardType,
        usedBytes,
        totalBytes,
        utilizationPercentage: (usedBytes / totalBytes) * 100,
        recordCount: Math.floor(usedBytes / 1000),
      });
    }

    return simulatedStorage;
  }

  private async analyzeHotUserDistribution(
    shardType: ShardType
  ): Promise<HotUserDistribution[]> {
    if (!this.smartRouter || !this.config.enableHotUserTracking) {
      return [];
    }

    const hotUsers = this.smartRouter.getHotUsers();
    const allActivityMetrics = this.smartRouter.getAllActivityMetrics();

    if (hotUsers.length === 0) {
      return [];
    }

    const distribution: Map<number, HotUserDistribution> = new Map();
    const shardCount = this.getShardCountForType(shardType);

    for (let i = 0; i < shardCount; i++) {
      distribution.set(i, {
        shardId: i,
        shardType,
        hotUserCount: 0,
        hotUserPercentage: 0,
        topHotUsers: [],
      });
    }

    for (const userId of hotUsers) {
      try {
        const shardId = await this.smartRouter.getShardForUser(userId);
        const shardIndex =
          typeof shardId === 'string' ? parseInt(shardId, 10) : shardId;

        const existing = distribution.get(shardIndex);
        if (existing) {
          existing.hotUserCount++;
        }
      } catch {
        // Skip users that can't be routed
      }
    }

    const totalHotUsers = hotUsers.length;
    const result: HotUserDistribution[] = [];

    for (const [shardId, dist] of distribution) {
      const topHotUsers = allActivityMetrics
        .filter((m) => {
          const routeShard = this.getUserShardSync(m.userId);
          return routeShard === shardId;
        })
        .sort((a, b) => b.activityScore - a.activityScore)
        .slice(0, 5)
        .map((m) => ({
          userId: m.userId,
          activityScore: m.activityScore,
          averageRequestsPerMinute: m.averageRequestsPerMinute,
        }));

      result.push({
        ...dist,
        hotUserPercentage:
          totalHotUsers > 0 ? (dist.hotUserCount / totalHotUsers) * 100 : 0,
        topHotUsers,
      });
    }

    return result;
  }

  private getUserShardSync(userId: string): number {
    const hash = this.generateSimpleHash(userId);
    const shardCount = 4;
    return hash % shardCount;
  }

  private generateSimpleHash(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash);
  }

  private calculateBalanceScore(
    loadDistribution: ShardLoadInfo[],
    storageDistribution: ShardStorageInfo[],
    hotUserDistribution: HotUserDistribution[]
  ): number {
    if (loadDistribution.length === 0) {
      return 100;
    }

    const loadScore = this.calculateDistributionScore(
      loadDistribution.map((l) => l.loadPercentage),
      100 / loadDistribution.length
    );

    const storageScore =
      storageDistribution.length > 0
        ? this.calculateDistributionScore(
            storageDistribution.map((s) => s.utilizationPercentage),
            100 / storageDistribution.length
          )
        : 100;

    let hotUserScore = 100;
    if (hotUserDistribution.length > 0) {
      hotUserScore = this.calculateDistributionScore(
        hotUserDistribution.map((h) => h.hotUserPercentage),
        100 / hotUserDistribution.length
      );
    }

    const weightedScore =
      loadScore * 0.5 + storageScore * 0.3 + hotUserScore * 0.2;
    return Math.round(weightedScore * 100) / 100;
  }

  private calculateDistributionScore(
    values: number[],
    idealValue: number
  ): number {
    if (values.length === 0) return 100;

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (avg === 0) return 100;

    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - idealValue, 2), 0) /
      values.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avg;

    const score = Math.max(0, 100 - coefficientOfVariation * 100);
    return Math.round(score * 100) / 100;
  }

  private generateSuggestions(
    loadDistribution: ShardLoadInfo[],
    storageDistribution: ShardStorageInfo[],
    hotUserDistribution: HotUserDistribution[],
    shardType: ShardType
  ): RebalancingSuggestion[] {
    const suggestions: RebalancingSuggestion[] = [];

    const loadImbalance = this.detectLoadImbalance(loadDistribution);
    if (loadImbalance) {
      suggestions.push(...loadImbalance);
    }

    const storageImbalance = this.detectStorageImbalance(storageDistribution);
    if (storageImbalance) {
      suggestions.push(...storageImbalance);
    }

    const hotUserImbalance = this.detectHotUserImbalance(hotUserDistribution);
    if (hotUserImbalance) {
      suggestions.push(...hotUserImbalance);
    }

    if (loadDistribution.length > 0 && loadDistribution.length < 2) {
      suggestions.push(this.createAddShardSuggestion(shardType, 'load'));
    }

    const deduplicated = this.deduplicateSuggestions(suggestions);

    return deduplicated
      .sort(
        (a, b) =>
          this.priorityValue(b.priority) - this.priorityValue(a.priority)
      )
      .slice(0, this.config.maxSuggestionsPerAnalysis);
  }

  private deduplicateSuggestions(
    suggestions: RebalancingSuggestion[]
  ): RebalancingSuggestion[] {
    const now = Date.now();
    const suppressionWindowMs = this.config.minRebalancingIntervalMs;
    const result: RebalancingSuggestion[] = [];

    for (const suggestion of suggestions) {
      const signature = this.getSuggestionSignature(suggestion);
      const existing = this.recentSuggestions.get(signature);

      if (existing && existing.suppressedUntil > now) {
        continue;
      }

      if (existing && existing.suppressedUntil <= now) {
        this.recentSuggestions.set(signature, {
          timestamp: now,
          suppressedUntil: now + suppressionWindowMs,
        });
      }

      if (this.plannedSuggestionIds.has(suggestion.id)) {
        continue;
      }

      result.push(suggestion);
      this.recentSuggestions.set(signature, {
        timestamp: now,
        suppressedUntil: now + suppressionWindowMs,
      });
    }

    return result;
  }

  private getSuggestionSignature(suggestion: RebalancingSuggestion): string {
    return `${suggestion.type}:${suggestion.sourceShard?.shardId ?? 'none'}:${suggestion.targetShard?.shardId ?? 'none'}`;
  }

  markSuggestionAsPlanned(suggestionId: string): void {
    this.plannedSuggestionIds.add(suggestionId);
  }

  clearPlannedSuggestion(suggestionId: string): void {
    this.plannedSuggestionIds.delete(suggestionId);
  }

  private detectLoadImbalance(
    loadDistribution: ShardLoadInfo[]
  ): RebalancingSuggestion[] | null {
    if (loadDistribution.length < 2) return null;

    const loads = loadDistribution.map((l) => l.loadPercentage);
    const maxLoad = Math.max(...loads);
    const minLoad = Math.min(...loads);
    const imbalance = (maxLoad - minLoad) / 100;

    if (imbalance > this.config.loadImbalanceThreshold) {
      const overloadedShard = loadDistribution.find(
        (l) => l.loadPercentage === maxLoad
      );
      const underloadedShard = loadDistribution.find(
        (l) => l.loadPercentage === minLoad
      );

      if (overloadedShard && underloadedShard) {
        return [
          {
            id: `suggestion_load_${Date.now()}`,
            type: 'migrate_data',
            priority:
              imbalance > 0.5
                ? 'critical'
                : imbalance > 0.35
                  ? 'high'
                  : 'medium',
            sourceShard: {
              shardId: overloadedShard.shardId,
              shardType: overloadedShard.shardType,
            },
            targetShard: {
              shardId: underloadedShard.shardId,
              shardType: underloadedShard.shardType,
            },
            estimatedImpact: {
              loadReduction: maxLoad - (maxLoad + minLoad) / 2,
              improvedBalance: imbalance * 100,
              riskLevel: 'medium',
            },
            reasoning: `Load imbalance detected: ${maxLoad.toFixed(1)}% vs ${minLoad.toFixed(1)}%. Moving traffic from shard ${overloadedShard.shardId} to ${underloadedShard.shardId} would improve balance.`,
            createdAt: new Date(),
            estimatedEffort: 'medium',
          },
        ];
      }
    }

    return null;
  }

  private detectStorageImbalance(
    storageDistribution: ShardStorageInfo[]
  ): RebalancingSuggestion[] | null {
    if (storageDistribution.length < 2) return null;

    const utilizations = storageDistribution.map(
      (s) => s.utilizationPercentage
    );
    const maxUtil = Math.max(...utilizations);
    const minUtil = Math.min(...utilizations);
    const imbalance = (maxUtil - minUtil) / 100;

    if (imbalance > this.config.storageImbalanceThreshold) {
      const overloadedShard = storageDistribution.find(
        (s) => s.utilizationPercentage === maxUtil
      );

      if (overloadedShard) {
        if (maxUtil > 90) {
          return [
            {
              id: `suggestion_storage_${Date.now()}`,
              type: 'split_shard',
              priority: 'critical',
              sourceShard: {
                shardId: overloadedShard.shardId,
                shardType: overloadedShard.shardType,
              },
              estimatedImpact: {
                loadReduction: 0,
                improvedBalance: imbalance * 100,
                riskLevel: 'high',
              },
              reasoning: `Storage utilization critical: ${maxUtil.toFixed(1)}% on shard ${overloadedShard.shardId}. Split into multiple shards to prevent capacity issues.`,
              createdAt: new Date(),
              estimatedEffort: 'large',
            },
          ];
        }

        return [
          {
            id: `suggestion_storage_${Date.now()}`,
            type: 'migrate_data',
            priority: imbalance > 0.4 ? 'high' : 'medium',
            sourceShard: {
              shardId: overloadedShard.shardId,
              shardType: overloadedShard.shardType,
            },
            estimatedImpact: {
              loadReduction: 0,
              improvedBalance: imbalance * 100,
              riskLevel: 'medium',
            },
            reasoning: `Storage imbalance detected: ${maxUtil.toFixed(1)}% vs ${minUtil.toFixed(1)}%. Consider migrating data to balance storage utilization.`,
            createdAt: new Date(),
            estimatedEffort: 'medium',
          },
        ];
      }
    }

    return null;
  }

  private detectHotUserImbalance(
    hotUserDistribution: HotUserDistribution[]
  ): RebalancingSuggestion[] | null {
    if (hotUserDistribution.length < 2 || hotUserDistribution.length === 0)
      return null;

    const hotCounts = hotUserDistribution.map((h) => h.hotUserPercentage);
    const maxHot = Math.max(...hotCounts);
    const minHot = Math.min(...hotCounts);
    const imbalance = (maxHot - minHot) / 100;

    if (imbalance > this.config.hotUserImbalanceThreshold) {
      const overloadedShard = hotUserDistribution.find(
        (h) => h.hotUserPercentage === maxHot
      );

      if (overloadedShard && overloadedShard.topHotUsers.length > 0) {
        const affectedEntities = overloadedShard.topHotUsers
          .slice(0, 3)
          .map((user) => ({
            entityType: ShardEntityType.USER,
            entityKey: user.userId,
            reason: `Hot user with activity score ${user.activityScore.toFixed(1)}`,
          }));

        return [
          {
            id: `suggestion_hotuser_${Date.now()}`,
            type: 'move_hot_user',
            priority: imbalance > 0.4 ? 'high' : 'medium',
            sourceShard: {
              shardId: overloadedShard.shardId,
              shardType: overloadedShard.shardType,
            },
            affectedEntities,
            estimatedImpact: {
              loadReduction: maxHot - (maxHot + minHot) / 2,
              improvedBalance: imbalance * 100,
              riskLevel: 'low',
            },
            reasoning: `Hot user concentration imbalance: ${maxHot.toFixed(1)}% on shard ${overloadedShard.shardId}. Moving top hot users would distribute load more evenly.`,
            createdAt: new Date(),
            estimatedEffort: 'small',
          },
        ];
      }
    }

    return null;
  }

  private createAddShardSuggestion(
    shardType: ShardType,
    reason: 'load' | 'storage' | 'capacity'
  ): RebalancingSuggestion {
    void reason;
    return {
      id: `suggestion_add_${Date.now()}`,
      type: 'add_shard',
      priority: 'medium',
      estimatedImpact: {
        loadReduction: 50,
        improvedBalance: 30,
        riskLevel: 'low',
      },
      reasoning: `Single ${shardType} shard detected. Adding a second shard would improve redundancy and allow for better load distribution as traffic grows.`,
      createdAt: new Date(),
      estimatedEffort: 'medium',
    };
  }

  private generateSummary(
    balanceScore: number,
    suggestions: RebalancingSuggestion[]
  ): string {
    if (balanceScore >= 90) {
      return 'Shards are well-balanced. No immediate action required.';
    }

    if (balanceScore >= 70) {
      const criticalCount = suggestions.filter(
        (s) => s.priority === 'critical'
      ).length;
      if (criticalCount > 0) {
        return `Minor imbalance detected with ${criticalCount} critical issues requiring attention.`;
      }
      return 'Minor imbalance detected. Consider addressing during next maintenance window.';
    }

    if (balanceScore >= 50) {
      return `Significant imbalance detected (score: ${balanceScore}). ${suggestions.length} rebalancing suggestions generated.`;
    }

    return `Critical imbalance detected (score: ${balanceScore}). Immediate action recommended.`;
  }

  private priorityValue(priority: string): number {
    switch (priority) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'medium':
        return 2;
      case 'low':
        return 1;
      default:
        return 0;
    }
  }

  private getShardCountForType(shardType: ShardType): number {
    switch (shardType) {
      case ShardType.USERS:
        return 1;
      case ShardType.CONTENT:
        return 3;
      case ShardType.AI_TASKS:
        return 4;
      default:
        return 1;
    }
  }

  getLastAnalysis(shardType: ShardType): RebalancingAnalysis | null {
    return this.lastAnalysis.get(shardType) || null;
  }

  getAllLastAnalyses(): RebalancingAnalysis[] {
    return Array.from(this.lastAnalysis.values());
  }

  getConfig(): RebalancingConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<RebalancingConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('Rebalancing config updated:', this.config);
  }

  async generateRebalancingPlan(
    analysisId: string,
    selectedSuggestions: string[]
  ): Promise<{
    planId: string;
    analysisId: string;
    steps: Array<{
      order: number;
      suggestion: RebalancingSuggestion;
      estimatedDuration: string;
      prerequisites: string[];
    }>;
    totalEstimatedDuration: string;
    riskAssessment: string;
  }> {
    const allAnalyses = this.getAllLastAnalyses();
    const analysis = allAnalyses.find((a) => a.id === analysisId);

    if (!analysis) {
      throw new ValidationError(`Analysis not found: ${analysisId}`, {
        field: 'analysisId',
        value: analysisId,
        errorCode: ErrorCode.INVALID_SHARD_CONFIGURATION.toString(),
      });
    }

    const selected = analysis.suggestions.filter((s) =>
      selectedSuggestions.includes(s.id)
    );

    const steps = selected.map((suggestion, index) => ({
      order: index + 1,
      suggestion,
      estimatedDuration: this.getEstimatedDuration(suggestion.estimatedEffort),
      prerequisites: this.getPrerequisites(suggestion, selected),
    }));

    return {
      planId: `plan_${Date.now()}`,
      analysisId,
      steps,
      totalEstimatedDuration: this.calculateTotalDuration(steps),
      riskAssessment: this.assessPlanRisk(selected),
    };
  }

  private getEstimatedDuration(effort: string): string {
    switch (effort) {
      case 'trivial':
        return '5 minutes';
      case 'small':
        return '30 minutes';
      case 'medium':
        return '2 hours';
      case 'large':
        return '8 hours';
      default:
        return 'Unknown';
    }
  }

  private getPrerequisites(
    suggestion: RebalancingSuggestion,
    allSuggestions: RebalancingSuggestion[]
  ): string[] {
    const prereqs: string[] = [];

    if (suggestion.type === 'add_shard') {
      prereqs.push('Provision new database infrastructure');
      prereqs.push('Update connection pool configuration');
    }

    if (suggestion.type === 'migrate_data') {
      const hasAddShard = allSuggestions.some(
        (s) =>
          s.type === 'add_shard' &&
          s.targetShard?.shardId === suggestion.targetShard?.shardId
      );
      if (!hasAddShard) {
        prereqs.push('Ensure target shard has sufficient capacity');
      }
    }

    if (suggestion.type === 'split_shard') {
      prereqs.push('Create target shards');
      prereqs.push('Set up replication to new shards');
    }

    return prereqs;
  }

  private calculateTotalDuration(
    steps: Array<{ estimatedDuration: string }>
  ): string {
    const durations: Record<string, number> = {
      '5 minutes': 5,
      '30 minutes': 30,
      '2 hours': 120,
      '8 hours': 480,
    };

    const totalMinutes = steps.reduce((sum, step) => {
      return sum + (durations[step.estimatedDuration] || 0);
    }, 0);

    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours} hours ${mins} minutes` : `${hours} hours`;
  }

  private assessPlanRisk(suggestions: RebalancingSuggestion[]): string {
    const riskCounts = { low: 0, medium: 0, high: 0 };

    suggestions.forEach((s) => {
      riskCounts[s.estimatedImpact.riskLevel]++;
    });

    if (riskCounts.high > 0) {
      return `HIGH RISK: ${riskCounts.high} high-risk operations planned. Consider splitting into multiple maintenance windows.`;
    }

    if (riskCounts.medium > 2) {
      return `MEDIUM RISK: Multiple medium-risk operations. Ensure backups are current before proceeding.`;
    }

    return `LOW RISK: Plan consists primarily of low-risk operations. Safe to proceed with standard monitoring.`;
  }
}

export function createShardRebalancingService(
  healthMonitor: ShardHealthMonitor,
  metricsCollector: ShardMetricsCollector,
  smartRouter?: SmartShardRouter,
  config?: Partial<RebalancingConfig>
): ShardRebalancingService {
  return new ShardRebalancingService(
    healthMonitor,
    metricsCollector,
    smartRouter,
    config
  );
}
