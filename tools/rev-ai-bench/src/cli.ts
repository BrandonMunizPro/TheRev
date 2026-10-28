#!/usr/bin/env node
import { BenchmarkRunner } from './runner.js';
import { BenchmarkConfig } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);

function parseArgs() {
  const config: Partial<BenchmarkConfig> = {
    ollamaBaseUrl: 'http://localhost:11434',
    numTrials: 1,
    warmup: true,
    outputDir: './results'
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--models' && args[i+1]) {
      config.models = args[i+1].split(',');
    } else if (args[i] === '--url' && args[i+1]) {
      config.ollamaBaseUrl = args[i+1];
    } else if (args[i] === '--trials' && args[i+1]) {
      config.numTrials = parseInt(args[i+1]);
    } else if (args[i] === '--output' && args[i+1]) {
      config.outputDir = args[i+1];
    }
  }
  
  return config;
}

async function main() {
  const config = parseArgs();
  
  if (!config.models || config.models.length === 0) {
    console.log('Usage: rev-ai-bench --models model1,model2 [options]');
    console.log('Options:');
    console.log('  --url <url>      Ollama base URL (default: http://localhost:11434)');
    console.log('  --trials <n>     Number of trials per test (default: 1)');
    console.log('  --output <dir>   Output directory (default: ./results)');
    console.log('\nNote: This is an isolated benchmark tool. No production code is modified.');
    process.exit(1);
  }
  
  const fullConfig: BenchmarkConfig = {
    models: config.models,
    ollamaBaseUrl: config.ollamaBaseUrl!,
    numTrials: config.numTrials!,
    warmup: config.warmup!,
    outputDir: config.outputDir!
  };
  
  // Create output dir
  if (!fs.existsSync(fullConfig.outputDir)) {
    fs.mkdirSync(fullConfig.outputDir, { recursive: true });
  }
  
  const runner = new BenchmarkRunner(fullConfig);
  const report = await runner.run();
  
  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(fullConfig.outputDir, `benchmark-${timestamp}.json`);
  const mdPath = path.join(fullConfig.outputDir, `benchmark-${timestamp}.md`);
  
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  
  // Generate markdown report
  let md = `# Rev AI Benchmark Report\n\n`;
  md += `**Date:** ${report.metadata.timestamp}\n`;
  md += `**Hardware:** ${report.metadata.hardware}\n\n`;
  
  md += `## Summary\n\n`;
  md += `| Model | Tests | Passed | Avg Score | Avg Latency (ms) | Avg Tokens/s |\n`;
  md += `|-------|-------|--------|-----------|------------------|--------------|\n`;
  
  for (const [model, summary] of Object.entries(report.summary.models)) {
    md += `| ${model} | ${summary.totalTests} | ${summary.passed} | ${summary.avgScore.toFixed(1)} | ${summary.avgLatency.toFixed(0)} | ${summary.avgTokensPerSec.toFixed(1)} |\n`;
  }
  
  md += `\n## Results\n\n`;
  for (const result of report.results) {
    md += `### ${result.model} - ${result.testCaseId} (trial ${result.trial})\n`;
    md += `- Score: ${result.score}/100 | Valid: ${result.valid} | Latency: ${result.latency.total}ms\n`;
    if (result.tokensPerSecond) md += `- Tokens/s: ${result.tokensPerSecond.toFixed(1)}\n`;
    if (result.errors.length > 0) md += `- Errors: ${result.errors.join(', ')}\n`;
    md += `\n`;
  }
  
  fs.writeFileSync(mdPath, md);
  
  console.log(`\nResults saved to:`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);
}

main().catch(console.error);
