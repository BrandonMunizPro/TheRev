import { BenchmarkConfig, BenchmarkResult, TestCase, BenchmarkReport, ModelSummary } from './types.js';
import { ALL_TESTS } from './tests.js';

export class BenchmarkRunner {
  private config: BenchmarkConfig;
  
  constructor(config: BenchmarkConfig) {
    this.config = config;
  }
  
  async run(): Promise<BenchmarkReport> {
    const results: BenchmarkResult[] = [];
    
    console.log('Starting benchmark...');
    console.log(`Models: ${this.config.models.join(', ')}`);
    console.log(`Tests: ${ALL_TESTS.length}`);
    console.log(`Trials: ${this.config.numTrials}`);
    
    for (const model of this.config.models) {
      console.log(`\nTesting model: ${model}`);
      
      for (const test of ALL_TESTS) {
        for (let trial = 1; trial <= this.config.numTrials; trial++) {
          console.log(`  ${test.name} (trial ${trial})...`);
          
          const result = await this.runTest(model, test, trial);
          results.push(result);
        }
      }
    }
    
    const report = this.generateReport(results);
    return report;
  }
  
  private async runTest(model: string, test: TestCase, trial: number): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    
    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: test.systemPrompt ? `${test.systemPrompt}\n\n${test.prompt}` : test.prompt,
          stream: false,
          options: {
            temperature: this.config.temperature ?? 0.7,
            top_p: this.config.topP ?? 0.9,
            num_predict: 512
          }
        })
      });
      
      if (!response.ok) {
        errors.push(`HTTP ${response.status}`);
        return {
          model,
          testCaseId: test.id,
          trial,
          response: '',
          latency: { total: Date.now() - startTime },
          valid: false,
          score: 0,
          errors,
          timestamp: new Date().toISOString()
        };
      }
      
      const data = await response.json();
      const responseText = data.response || '';
      const totalLatency = Date.now() - startTime;
      
      const { valid, score } = this.scoreResponse(responseText, test);
      
      return {
        model,
        testCaseId: test.id,
        trial,
        response: responseText,
        latency: { total: totalLatency },
        tokensPerSecond: data.eval_count && data.eval_duration ? 
          (data.eval_count / (data.eval_duration / 1e9)) : undefined,
        tokensUsed: data.eval_count,
        valid,
        score,
        errors,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        model,
        testCaseId: test.id,
        trial,
        response: '',
        latency: { total: Date.now() - startTime },
        valid: false,
        score: 0,
        errors,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  private scoreResponse(response: string, test: TestCase): { valid: boolean; score: number } {
    let score = 0;
    const criteria = test.scoringCriteria;
    
    if (criteria.validJson) {
      try {
        JSON.parse(response);
        score += 30;
      } catch {
        // Try to extract JSON
        const match = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (match) {
          try {
            JSON.parse(match[0]);
            score += 20;
          } catch {}
        }
      }
    }
    
    if (criteria.mustHave) {
      for (const required of criteria.mustHave) {
        if (response.toLowerCase().includes(required.toLowerCase())) {
          score += 20;
        }
      }
    }
    
    if (criteria.objectiveCheck) {
      if (criteria.objectiveCheck(response)) {
        score += 50;
      }
    }
    
    const valid = score >= 50;
    return { valid, score: Math.min(score, 100) };
  }
  
  private generateReport(results: BenchmarkResult[]): BenchmarkReport {
    const modelSummaries: Record<string, ModelSummary> = {};
    
    for (const model of this.config.models) {
      const modelResults = results.filter(r => r.model === model);
      const passed = modelResults.filter(r => r.valid).length;
      const avgScore = modelResults.reduce((sum, r) => sum + r.score, 0) / modelResults.length;
      const avgLatency = modelResults.reduce((sum, r) => sum + r.latency.total, 0) / modelResults.length;
      const avgTokensPerSec = modelResults.filter(r => r.tokensPerSecond).reduce((sum, r) => sum + (r.tokensPerSecond || 0), 0) / 
        modelResults.filter(r => r.tokensPerSecond).length || 0;
      
      modelSummaries[model] = {
        model,
        totalTests: modelResults.length,
        passed,
        avgScore,
        avgLatency,
        avgTokensPerSec
      };
    }
    
    return {
      config: this.config,
      results,
      summary: { models: modelSummaries },
      metadata: {
        timestamp: new Date().toISOString(),
        hardware: 'RTX 3060 Laptop / 16GB RAM (Windows)',
      }
    };
  }
}
