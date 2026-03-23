import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface OllamaHealthCheck {
  isRunning: boolean;
  version: string | null;
  availableModels: string[];
  gpuStatus: 'available' | 'unavailable' | 'error' | 'unknown' | 'working';
  gpuInfo: string | null;
  error: string | null;
}

export interface OllamaDiagnosticResult {
  healthy: boolean;
  issues: OllamaIssue[];
  canAutoFix: boolean[];
  recommendations: string[];
}

export interface OllamaIssue {
  type:
    | 'not_running'
    | 'gpu_error'
    | 'model_missing'
    | 'network_error'
    | 'unknown';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  details: string | null;
  autoFixAction: string | null;
}

export class OllamaServiceManager {
  private baseUrl = 'http://localhost:11434';
  private ollamaProcess: ReturnType<typeof spawn> | null = null;
  private isShuttingDown = false;

  async checkHealth(): Promise<OllamaHealthCheck> {
    const result: OllamaHealthCheck = {
      isRunning: false,
      version: null,
      availableModels: [],
      gpuStatus: 'unknown',
      gpuInfo: null,
      error: null,
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        result.isRunning = true;
        const data = (await response.json()) as {
          models?: Array<{ name: string }>;
        };
        result.availableModels = (data.models ?? []).map((m) => m.name);
        result.gpuStatus = 'working';
        result.gpuInfo = 'Running';
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return result;
  }

  async diagnose(): Promise<OllamaDiagnosticResult> {
    const health = await this.checkHealth();
    const issues: OllamaIssue[] = [];
    const canAutoFix: boolean[] = [];
    const recommendations: string[] = [];

    if (!health.isRunning) {
      issues.push({
        type: 'not_running',
        severity: 'critical',
        message: 'Ollama server is not running',
        details: health.error,
        autoFixAction: 'start_ollama',
      });
      canAutoFix.push(true);
      recommendations.push('Starting Ollama server...');
    } else if (health.availableModels.length === 0) {
      issues.push({
        type: 'model_missing',
        severity: 'warning',
        message: 'No AI models installed',
        details: null,
        autoFixAction: 'pull_default_model',
      });
      canAutoFix.push(true);
      recommendations.push(
        'Downloading default AI model (this may take a few minutes)...'
      );
    }

    const healthy = health.isRunning && health.availableModels.length > 0;

    return {
      healthy,
      issues,
      canAutoFix,
      recommendations,
    };
  }

  async startOllama(cpuOnly: boolean = false): Promise<boolean> {
    if (this.ollamaProcess) {
      console.log('[OllamaService] Already starting or running');
      return true;
    }

    // Check if Ollama is already running
    try {
      const checkResponse = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (checkResponse.ok) {
        console.log('[OllamaService] Ollama is already running');
        return true;
      }
    } catch {
      // Not running, will start it
    }

    // Try startup strategies in order: CUDA -> DirectML (Windows) -> CPU
    const strategies = this.getStartupStrategies(cpuOnly);
    
    for (const strategy of strategies) {
      console.log(`[OllamaService] Trying: ${strategy.name}`);
      const started = await this.tryStartWithStrategy(strategy);
      if (started) {
        return true;
      }
      // Clean up before trying next strategy
      this.cleanup();
      await this.delay(500);
    }

    console.error('[OllamaService] All startup strategies failed');
    return false;
  }

  private getStartupStrategies(cpuOnly: boolean) {
    const isWindows = os.platform() === 'win32';
    const strategies: Array<{ name: string; command: string; args: string[] }> = [];

    if (cpuOnly) {
      // CPU-only strategies
      if (isWindows) {
        strategies.push({
          name: 'CPU (Windows)',
          command: 'cmd.exe',
          args: ['/c', 'set OLLAMA_GPU_MODE=cpu&& ollama serve'],
        });
      } else {
        strategies.push({
          name: 'CPU (Unix)',
          command: 'bash',
          args: ['-c', 'OLLAMA_GPU_MODE=cpu ollama serve'],
        });
      }
    } else {
      // GPU strategies first
      if (isWindows) {
        // DirectML (Microsoft's GPU acceleration - works on most GPUs)
        strategies.push({
          name: 'DirectML (Windows GPU)',
          command: 'cmd.exe',
          args: ['/c', 'set OLLAMA_GPU_MODE=directml&& ollama serve'],
        });
        // CUDA as fallback
        strategies.push({
          name: 'CUDA (NVIDIA GPU)',
          command: 'ollama',
          args: ['serve'],
        });
        // CPU fallback
        strategies.push({
          name: 'CPU (Windows fallback)',
          command: 'cmd.exe',
          args: ['/c', 'set OLLAMA_GPU_MODE=cpu&& ollama serve'],
        });
      } else {
        // Unix: CUDA first, then CPU
        strategies.push({
          name: 'CUDA (Unix)',
          command: 'ollama',
          args: ['serve'],
        });
        strategies.push({
          name: 'CPU (Unix fallback)',
          command: 'bash',
          args: ['-c', 'CUDA_VISIBLE_DEVICES="" OLLAMA_GPU_MODE=cpu ollama serve'],
        });
      }
    }

    return strategies;
  }

  private async tryStartWithStrategy(strategy: { name: string; command: string; args: string[] }): Promise<boolean> {
    return new Promise((resolve) => {
      this.ollamaProcess = spawn(strategy.command, strategy.args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      let startupOutput = '';
      let started = false;
      let errored = false;

      const startupTimeout = setTimeout(() => {
        if (!started) {
          console.log(`[OllamaService] ${strategy.name}: Startup timeout`);
          errored = true;
          this.ollamaProcess?.kill();
        }
      }, 10000); // 10 second timeout per strategy

      this.ollamaProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        startupOutput += output;
        console.log('[Ollama] ' + output.trim());

        if (output.includes('listening') || output.includes('running')) {
          started = true;
          clearTimeout(startupTimeout);
          console.log(`[OllamaService] ${strategy.name}: Started successfully!`);
        }
      });

      this.ollamaProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        startupOutput += output;
        console.log('[Ollama] ' + output.trim());

        // Check for GPU errors
        if (output.includes('CUDA error') || 
            output.includes('GPU not available') ||
            output.includes('no GPU') ||
            output.includes('cudaError')) {
          console.log(`[OllamaService] ${strategy.name}: GPU error detected`);
          errored = true;
          this.ollamaProcess?.kill();
          clearTimeout(startupTimeout);
        }
      });

      this.ollamaProcess.on('error', (error) => {
        console.error(`[OllamaService] ${strategy.name} failed:`, error.message);
        errored = true;
        clearTimeout(startupTimeout);
      });

      this.ollamaProcess.on('exit', (code) => {
        clearTimeout(startupTimeout);
        if (code === 0 || started) {
          resolve(true);
        } else {
          console.log(`[OllamaService] ${strategy.name}: Exit code ${code}`);
          resolve(false);
        }
      });

      // Initial check
      setTimeout(() => {
        if (!started && !errored) {
          // Still starting, give it more time
        }
      }, 3000);
    });
  }

  private cleanup(): void {
    if (this.ollamaProcess) {
      try {
        this.ollamaProcess.kill();
      } catch {}
      this.ollamaProcess = null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stopOllama(): Promise<void> {
    this.isShuttingDown = true;

    if (this.ollamaProcess) {
      this.ollamaProcess.kill('SIGTERM');
      this.ollamaProcess = null;
    }

    // Also try to kill any running ollama processes
    await this.killOllamaProcesses();

    this.isShuttingDown = false;
  }

  private async killOllamaProcesses(): Promise<void> {
    return new Promise((resolve) => {
      const isWindows = os.platform() === 'win32';
      const cmd = isWindows
        ? 'taskkill /F /IM ollama.exe'
        : 'pkill -f "ollama serve"';

      exec(cmd, (error) => {
        if (
          error &&
          !error.message.includes('not found') &&
          !error.message.includes('No matching processes')
        ) {
          console.log('[OllamaService] Kill result:', error.message);
        }
        resolve();
      });
    });
  }

  async restartWithCPUMode(): Promise<boolean> {
    console.log('[OllamaService] Restarting Ollama...');
    await this.stopOllama();
    await this.delay(1000);
    return await this.startOllama(true);
  }

  async pullModel(modelName: string = 'mistral:latest'): Promise<boolean> {
    return new Promise((resolve) => {
      console.log(`[OllamaService] Pulling model: ${modelName}`);

      const proc = spawn('ollama', ['pull', modelName], {
        shell: true,
      });

      proc.stdout?.on('data', (data) => {
        console.log('[Ollama Pull] ' + data.toString().trim());
      });

      proc.stderr?.on('data', (data) => {
        console.log('[Ollama Pull] ' + data.toString().trim());
      });

      proc.on('error', (error) => {
        console.error('[OllamaService] Pull failed:', error.message);
        resolve(false);
      });

      proc.on('close', (code) => {
        console.log(`[OllamaService] Pull completed with code ${code}`);
        resolve(code === 0);
      });
    });
  }

  async autoFix(): Promise<{
    success: boolean;
    actions: string[];
    errors: string[];
  }> {
    const actions: string[] = [];
    const errors: string[] = [];

    // First, run diagnosis
    const diagnosis = await this.diagnose();

    if (diagnosis.issues.length === 0) {
      actions.push('Ollama is healthy - no fixes needed');
      return { success: true, actions, errors };
    }

    for (const issue of diagnosis.issues) {
      if (!issue.autoFixAction) continue;

      try {
        switch (issue.autoFixAction) {
          case 'start_ollama':
            console.log('[OllamaService] Fixing: Starting Ollama...');
            const started = await this.startOllama(false);
            if (started) {
              actions.push('Started Ollama server');
            } else {
              errors.push('Failed to start Ollama');
            }
            break;

          case 'restart_cpu_mode':
            console.log(
              '[OllamaService] Fixing: Restarting with CPU-only mode...'
            );
            const restarted = await this.restartWithCPUMode();
            if (restarted) {
              actions.push('Restarted Ollama in CPU-only mode');
            } else {
              errors.push('Failed to restart Ollama');
            }
            break;

          case 'pull_default_model':
            console.log('[OllamaService] Fixing: Pulling default model...');
            const pulled = await this.pullModel();
            if (pulled) {
              actions.push('Downloaded default AI model');
            } else {
              errors.push('Failed to download model');
            }
            break;

          case 'check_gpu':
            actions.push('GPU status will be checked on next request');
            break;
        }
      } catch (error) {
        errors.push(
          `Fix action failed: ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
    }

    // Verify fixes
    await this.delay(3000);
    const verifyHealth = await this.checkHealth();
    const isHealthy =
      verifyHealth.isRunning && verifyHealth.availableModels.length > 0;

    return {
      success: isHealthy && errors.length === 0,
      actions,
      errors,
    };
  }

  async ensureHealthy(): Promise<{
    healthy: boolean;
    fixAttempted: boolean;
    result: OllamaDiagnosticResult;
  }> {
    // Quick health check first
    const quickHealth = await this.checkHealth();

    if (quickHealth.isRunning && quickHealth.availableModels.length > 0) {
      return {
        healthy: true,
        fixAttempted: false,
        result: await this.diagnose(),
      };
    }

    // Need to fix
    console.log(
      '[OllamaService] Ollama needs attention, attempting auto-fix...'
    );
    const fixResult = await this.autoFix();

    if (fixResult.success) {
      console.log('[OllamaService] Auto-fix successful');
    } else {
      console.log('[OllamaService] Auto-fix issues:', fixResult.errors);
    }

    return {
      healthy: fixResult.success,
      fixAttempted: true,
      result: await this.diagnose(),
    };
  }

  // Install Ollama if not present
  async isOllamaInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('ollama --version', (error) => {
        resolve(!error);
      });
    });
  }

  async getInstallInstructions(): Promise<string> {
    const platform = os.platform();

    if (platform === 'win32') {
      return `To install Ollama:
1. Download from https://ollama.com/download
2. Run the installer
3. Restart your terminal
4. Run: ollama pull mistral:latest`;
    } else if (platform === 'darwin') {
      return `To install Ollama:
1. Run: brew install ollama
   OR download from https://ollama.com/download
2. Run: ollama pull mistral:latest`;
    } else {
      return `To install Ollama:
1. Run: curl -fsSL https://ollama.com/install.sh | sh
2. Run: ollama pull mistral:latest`;
    }
  }
}

// Singleton instance
export const ollamaService = new OllamaServiceManager();
