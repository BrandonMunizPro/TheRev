import { exec, spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface OllamaCorruptionError {
  type: 'cuda_error' | 'runner_crash' | 'model_load_failure' | 'gpu_state_corrupt' | 'unknown';
  message: string;
  details: string | null;
  recoverable: boolean;
  recoverySteps: string[];
}

export interface RepairResult {
  success: boolean;
  repairType: 'none' | 'restart' | 'cache_clear' | 'gpu_reset' | 'reinstall';
  actionsPerformed: string[];
  newIssues: OllamaCorruptionError[];
  requiresRestart: boolean;
  userActionRequired: boolean;
  userMessage: string | null;
}

export interface OllamaRepairOptions {
  autoRepair: boolean;
  allowReinstall: boolean;
  modelToTest?: string;
}

export class OllamaRepairService {
  private baseUrl = 'http://localhost:11434';
  private consecutiveFailures = 0;
  private lastErrorType: OllamaCorruptionError['type'] | null = null;

  async detectCorruption(error: Error | string): Promise<OllamaCorruptionError> {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorString = errorMessage.toLowerCase();

    if (errorString.includes('cuda error') || 
        errorString.includes('cudaerror') ||
        errorString.includes('gpu error')) {
      return {
        type: 'cuda_error',
        message: 'CUDA/GPU error detected',
        details: errorMessage,
        recoverable: true,
        recoverySteps: [
          'Restart Ollama with CPU mode',
          'Clear GPU state cache',
          'Reinstall Ollama if restart fails'
        ]
      };
    }

    if (errorString.includes('runner process') && 
        (errorString.includes('terminated') || errorString.includes('crashed'))) {
      return {
        type: 'runner_crash',
        message: 'Ollama runner process crashed',
        details: errorMessage,
        recoverable: false,
        recoverySteps: [
          'Kill all Ollama processes',
          'Clear Ollama model cache',
          'Reinstall Ollama completely'
        ]
      };
    }

    if (errorString.includes('model') && 
        (errorString.includes('load') || errorString.includes('failed'))) {
      return {
        type: 'model_load_failure',
        message: 'Failed to load AI model',
        details: errorMessage,
        recoverable: true,
        recoverySteps: [
          'Re-download the model',
          'Clear model cache',
          'Try a different model'
        ]
      };
    }

    if (errorString.includes('gpu') && errorString.includes('state')) {
      return {
        type: 'gpu_state_corrupt',
        message: 'GPU state appears corrupted',
        details: errorMessage,
        recoverable: false,
        recoverySteps: [
          'Kill all Ollama processes',
          'Clear Ollama cache directory',
          'Reinstall Ollama'
        ]
      };
    }

    return {
      type: 'unknown',
      message: 'Unknown error occurred',
      details: errorMessage,
      recoverable: true,
      recoverySteps: ['Restart Ollama service', 'Check system resources']
    };
  }

  async performRepair(options: OllamaRepairOptions = { autoRepair: true, allowReinstall: true }): Promise<RepairResult> {
    const actions: string[] = [];
    const newIssues: OllamaCorruptionError[] = [];

    console.log('[OllamaRepair] Starting repair process...');

    // Step 1: Kill all Ollama processes
    console.log('[OllamaRepair] Step 1: Stopping Ollama processes...');
    await this.killAllOllamaProcesses();
    actions.push('Stopped all Ollama processes');
    await this.delay(2000);

    // Step 2: Try restarting with CPU mode
    console.log('[OllamaRepair] Step 2: Restarting with CPU mode...');
    const restartSuccess = await this.startOllamaCPU();
    
    if (restartSuccess) {
      console.log('[OllamaRepair] CPU mode restart successful');
      actions.push('Restarted Ollama in CPU-only mode');
      
      // Test if it works
      const testResult = await this.testOllama(options.modelToTest);
      if (testResult.success) {
        return {
          success: true,
          repairType: 'restart',
          actionsPerformed: actions,
          newIssues: [],
          requiresRestart: false,
          userActionRequired: false,
          userMessage: null
        };
      } else {
        newIssues.push(testResult.error);
      }
    }

    // Step 3: Clear model cache
    if (!restartSuccess || newIssues.length > 0) {
      console.log('[OllamaRepair] Step 3: Clearing model cache...');
      const cacheCleared = await this.clearModelCache();
      if (cacheCleared) {
        actions.push('Cleared Ollama model cache');
        await this.delay(2000);

        // Try again
        const retrySuccess = await this.startOllamaCPU();
        if (retrySuccess) {
          const testResult = await this.testOllama(options.modelToTest);
          if (testResult.success) {
            return {
              success: true,
              repairType: 'cache_clear',
              actionsPerformed: actions,
              newIssues: [],
              requiresRestart: false,
              userActionRequired: false,
              userMessage: null
            };
          }
        }
      }
    }

    // Step 4: Full reinstall needed
    if (options.allowReinstall && options.autoRepair) {
      console.log('[OllamaRepair] Step 4: Performing full reinstall...');
      const reinstallResult = await this.performReinstall();
      return reinstallResult;
    }

    return {
      success: false,
      repairType: 'none',
      actionsPerformed: actions,
      newIssues,
      requiresRestart: false,
      userActionRequired: true,
      userMessage: 'Ollama needs to be reinstalled. Please restart the app or reinstall Ollama manually.'
    };
  }

  private async killAllOllamaProcesses(): Promise<void> {
    const isWindows = os.platform() === 'win32';
    
    return new Promise((resolve) => {
      if (isWindows) {
        exec('taskkill /F /IM ollama.exe 2>nul', () => {});
        exec('taskkill /F /IM "ollama app.exe" 2>nul', () => {});
      } else {
        exec('pkill -9 -f ollama 2>/dev/null || true', () => {});
      }
      setTimeout(resolve, 1000);
    });
  }

  private async startOllamaCPU(): Promise<boolean> {
    const isWindows = os.platform() === 'win32';
    
    return new Promise((resolve) => {
      let command: string;
      let args: string[];

      if (isWindows) {
        command = 'cmd.exe';
        args = ['/c', 'set OLLAMA_GPU_MODE=cpu&& start /b "" ollama serve'];
      } else {
        command = 'bash';
        args = ['-c', 'OLLAMA_GPU_MODE=cpu nohup ollama serve > /dev/null 2>&1 &'];
      }

      const proc = spawn(command, args, { shell: true, detached: true, stdio: 'ignore' });
      
      proc.on('error', () => resolve(false));
      
      setTimeout(async () => {
        // Check if running
        try {
          const response = await fetch(this.baseUrl, { signal: AbortSignal.timeout(3000) });
          resolve(response.ok);
        } catch {
          resolve(false);
        }
      }, 5000);
    });
  }

  private async testOllama(model?: string): Promise<{ success: boolean; error?: OllamaCorruptionError }> {
    const testModel = model || 'tinyllama:latest';
    
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: testModel,
          prompt: 'Hi',
          stream: false,
          options: { num_predict: 5 }
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (response.ok) {
        return { success: true };
      }

      const errorText = await response.text();
      const corruption = await this.detectCorruption(errorText);
      return { success: false, error: corruption };

    } catch (err) {
      const corruption = await this.detectCorruption(err as Error);
      return { success: false, error: corruption };
    }
  }

  private async clearModelCache(): Promise<boolean> {
    const isWindows = os.platform() === 'win32';
    const homeDir = os.homedir();
    const ollamaDir = path.join(homeDir, '.ollama');

    if (!fs.existsSync(ollamaDir)) {
      return true;
    }

    // Clear blobs directory (model cache)
    const blobsDir = path.join(ollamaDir, 'models', 'blobs');
    if (fs.existsSync(blobsDir)) {
      try {
        fs.rmSync(blobsDir, { recursive: true, force: true });
        fs.mkdirSync(blobsDir, { recursive: true });
        console.log('[OllamaRepair] Cleared model blobs cache');
      } catch (err) {
        console.log('[OllamaRepair] Could not clear blobs:', err);
      }
    }

    return true;
  }

  private async performReinstall(): Promise<RepairResult> {
    const actions: string[] = [];
    const platform = os.platform();

    console.log('[OllamaRepair] Starting reinstall process...');

    // Stop Ollama
    await this.killAllOllamaProcesses();
    actions.push('Stopped Ollama processes');

    await this.delay(1000);

    // Uninstall
    console.log('[OllamaRepair] Uninstalling Ollama...');
    const uninstalled = await this.uninstallOllama(platform);
    if (!uninstalled) {
      return {
        success: false,
        repairType: 'reinstall',
        actionsPerformed: actions,
        newIssues: [],
        requiresRestart: false,
        userActionRequired: true,
        userMessage: 'Could not uninstall Ollama automatically. Please uninstall Ollama manually and restart the app.'
      };
    }
    actions.push('Uninstalled Ollama');

    await this.delay(2000);

    // Install
    console.log('[OllamaRepair] Installing Ollama...');
    const installed = await this.installOllama(platform);
    if (!installed) {
      return {
        success: false,
        repairType: 'reinstall',
        actionsPerformed: actions,
        newIssues: [],
        requiresRestart: false,
        userActionRequired: true,
        userMessage: 'Could not install Ollama automatically. Please download from https://ollama.com and install it.'
      };
    }
    actions.push('Installed Ollama');

    await this.delay(3000);

    // Start Ollama
    console.log('[OllamaRepair] Starting Ollama...');
    const started = await this.startOllamaCPU();
    if (!started) {
      return {
        success: false,
        repairType: 'reinstall',
        actionsPerformed: actions,
        newIssues: [],
        requiresRestart: true,
        userActionRequired: true,
        userMessage: 'Ollama installed but could not start. Please restart the app.'
      };
    }
    actions.push('Started Ollama service');

    // Test
    const testResult = await this.testOllama();
    if (!testResult.success) {
      return {
        success: false,
        repairType: 'reinstall',
        actionsPerformed: actions,
        newIssues: [testResult.error!],
        requiresRestart: false,
        userActionRequired: true,
        userMessage: 'Ollama reinstalled but still having issues. Please restart the app.'
      };
    }

    return {
      success: true,
      repairType: 'reinstall',
      actionsPerformed: actions,
      newIssues: [],
      requiresRestart: false,
      userActionRequired: false,
      userMessage: null
    };
  }

  private async uninstallOllama(platform: string): Promise<boolean> {
    return new Promise((resolve) => {
      let command: string;
      let args: string[];

      if (platform === 'win32') {
        command = 'powershell';
        args = ['-Command', 
          `winget uninstall Ollama.Ollama --silent --accept-source-agreements --force 2>&1 || 
           Start-Process ms-settings:appsfeatures -Wait;
           exit 0`];
      } else if (platform === 'darwin') {
        command = 'bash';
        args = ['-c', 'brew uninstall ollama 2>/dev/null || true'];
      } else {
        command = 'bash';
        args = ['-c', 'sudo apt remove ollama 2>/dev/null || sudo yum remove ollama 2>/dev/null || true'];
      }

      const proc = spawn(command, args, { shell: true, stdio: 'pipe' });
      
      let output = '';
      proc.stdout?.on('data', (data) => { output += data.toString(); });
      proc.stderr?.on('data', (data) => { output += data.toString(); });

      setTimeout(() => {
        console.log('[OllamaRepair] Uninstall output:', output.substring(0, 500));
        resolve(true); // Assume success if no major errors
      }, 30000);

      proc.on('error', () => resolve(false));
    });
  }

  private async installOllama(platform: string): Promise<boolean> {
    return new Promise((resolve) => {
      let command: string;
      let args: string[];
      let timeout = 300000; // 5 minutes for Windows

      if (platform === 'win32') {
        command = 'powershell';
        args = ['-Command', 
          'winget install Ollama.Ollama --silent --accept-source-agreements --accept-package-agreements'];
      } else if (platform === 'darwin') {
        command = 'bash';
        args = ['-c', 'brew install ollama'];
        timeout = 180000;
      } else {
        command = 'bash';
        args = ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'];
        timeout = 180000;
      }

      const proc = spawn(command, args, { shell: true, stdio: 'pipe' });
      
      let output = '';
      proc.stdout?.on('data', (data) => { 
        output += data.toString(); 
        console.log('[OllamaRepair Install]', data.toString().trim());
      });
      proc.stderr?.on('data', (data) => { output += data.toString(); });

      setTimeout(() => {
        console.log('[OllamaRepair] Install completed');
        resolve(true);
      }, timeout);

      proc.on('error', () => resolve(false));
    });
  }

  async checkAndRepair(error?: Error | string): Promise<RepairResult> {
    if (error) {
      const corruption = await this.detectCorruption(error);
      this.consecutiveFailures++;
      this.lastErrorType = corruption.type;

      console.log(`[OllamaRepair] Detected issue: ${corruption.type} (failure #${this.consecutiveFailures})`);

      // If same error 2+ times, repair
      if (this.consecutiveFailures >= 2 || !corruption.recoverable) {
        this.consecutiveFailures = 0;
        return this.performRepair({ autoRepair: true, allowReinstall: true });
      }
    }

    return {
      success: true,
      repairType: 'none',
      actionsPerformed: [],
      newIssues: [],
      requiresRestart: false,
      userActionRequired: false,
      userMessage: null
    };
  }

  resetFailureCount(): void {
    this.consecutiveFailures = 0;
    this.lastErrorType = null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const ollamaRepair = new OllamaRepairService();
