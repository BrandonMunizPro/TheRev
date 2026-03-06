export interface QueryMetrics {
  query: string;
  depth: number;
  selections: number;
  complexity: number;
  estimatedCost: number;
  directives: string[];
  variables: number;
}

export interface OptimizationSuggestion {
  type: 'batching' | 'caching' | 'query-split' | 'directive';
  original: string;
  suggestion: string;
  reason: string;
  estimatedImprovement: number;
}

export class QueryOptimizer {
  private complexityWeights: Record<string, number> = {
    Object: 1,
    List: 2,
    Connection: 3,
    Mutation: 5,
    Subscription: 4,
  };

  analyzeQuery(query: string): QueryMetrics {
    const depth = this.calculateDepth(query);
    const selections = this.countSelections(query);
    const complexity = this.calculateComplexity(query);
    const directives = this.extractDirectives(query);
    const variables = this.countVariables(query);
    const estimatedCost = this.estimateCost(complexity, depth, selections);

    return {
      query: query.substring(0, 100),
      depth,
      selections,
      complexity,
      estimatedCost,
      directives,
      variables,
    };
  }

  optimize(
    query: string,
    variables?: Record<string, any>
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    const metrics = this.analyzeQuery(query);

    if (metrics.depth > 5) {
      suggestions.push({
        type: 'query-split',
        original: query,
        suggestion: 'Consider splitting this query into smaller fragments',
        reason: `Query depth of ${metrics.depth} may cause performance issues`,
        estimatedImprovement: 30,
      });
    }

    if (!query.includes('@cache') && !query.includes('@live')) {
      suggestions.push({
        type: 'caching',
        original: query,
        suggestion: 'Add @cache directive for frequently queried data',
        reason: 'Caching can reduce database load for repeated queries',
        estimatedImprovement: 50,
      });
    }

    if (this.hasNPlusOneRisk(query)) {
      suggestions.push({
        type: 'batching',
        original: query,
        suggestion: 'Use DataLoader for batch loading to avoid N+1 queries',
        reason: 'Multiple sequential field resolutions detected',
        estimatedImprovement: 70,
      });
    }

    return suggestions;
  }

  private calculateDepth(query: string): number {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of query) {
      if (char === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}') {
        currentDepth--;
      }
    }

    return maxDepth;
  }

  private countSelections(query: string): number {
    const selectionRegex = /^\s*\w+\s*(?:\(|$)/gm;
    const matches = query.match(selectionRegex);
    return matches ? matches.length : 0;
  }

  private calculateComplexity(query: string): number {
    let complexity = 1;

    for (const [type, weight] of Object.entries(this.complexityWeights)) {
      const regex = new RegExp(`\\b${type}\\b`, 'gi');
      const count = (query.match(regex) || []).length;
      complexity += count * weight;
    }

    return complexity;
  }

  private estimateCost(
    complexity: number,
    depth: number,
    selections: number
  ): number {
    return Math.round(complexity * depth * Math.sqrt(selections));
  }

  private extractDirectives(query: string): string[] {
    const directiveRegex = /@(\w+)(?:\([^)]*\))?/g;
    const directives: string[] = [];
    let match;

    while ((match = directiveRegex.exec(query)) !== null) {
      directives.push(match[1]);
    }

    return directives;
  }

  private countVariables(query: string): number {
    const variableRegex = /\$\w+/g;
    const matches = query.match(variableRegex);
    return matches ? new Set(matches).size : 0;
  }

  private hasNPlusOneRisk(query: string): boolean {
    const listFields = query.match(/\w+\s*:\s*\[/g) || [];
    const resolvedFields = query.match(/\{[^}]*\{/g) || [];

    return listFields.length > 0 && resolvedFields.length > listFields.length;
  }

  shouldCache(query: string): boolean {
    const metrics = this.analyzeQuery(query);
    return (
      metrics.estimatedCost > 10 &&
      !query.toLowerCase().includes('mutation') &&
      !query.toLowerCase().includes('subscription') &&
      metrics.variables < 3
    );
  }

  getCacheKey(query: string, variables?: Record<string, any>): string {
    const normalized = query.replace(/\s+/g, ' ').trim();
    const varHash = variables ? JSON.stringify(variables) : '';
    return Buffer.from(normalized + varHash).toString('base64');
  }
}

export const queryOptimizer = new QueryOptimizer();
