// TheRev Desktop App - Frontend JavaScript
class TheRevApp {
  constructor() {
    this.currentSection = 'threads';
    this.avatarData = {};
    this.init();
  }

  async init() {
    await this.loadAvatarData();
    await this.initAISettings();
    this.setupEventListeners();
    this.setupElectronListeners();
    this.loadInitialContent();
  }

  setupEventListeners() {
    // Navigation
    document
      .getElementById('threads-btn')
      .addEventListener('click', () => this.switchSection('threads'));
    document
      .getElementById('news-btn')
      .addEventListener('click', () => this.switchSection('news'));
    document
      .getElementById('ai-settings-btn')
      .addEventListener('click', () => this.switchSection('ai-settings'));
    document
      .getElementById('profile-btn')
      .addEventListener('click', () => this.switchSection('profile'));
    document
      .getElementById('browser-btn')
      .addEventListener('click', () => this.switchSection('browser'));

    // Avatar customizer
    document
      .getElementById('customize-avatar-btn')
      .addEventListener('click', () => this.openAvatarCustomizer());
    document
      .getElementById('save-avatar-btn')
      .addEventListener('click', () => this.saveAvatarCustomization());
    document
      .getElementById('cancel-avatar-btn')
      .addEventListener('click', () => this.closeAvatarCustomizer());
    document
      .querySelector('.close-btn')
      .addEventListener('click', () => this.closeAvatarCustomizer());

    // Browser controls
    document
      .getElementById('browser-navigate')
      .addEventListener('click', () => this.navigateBrowser());
    document
      .getElementById('browser-new-window')
      .addEventListener('click', () => this.openNewBrowserWindow());
    document.getElementById('browser-url').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.navigateBrowser();
    });

    // New thread button
    document
      .getElementById('new-thread-btn')
      .addEventListener('click', () => this.createNewThread());

    // News source filters
    document.querySelectorAll('.source-btn').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this.filterNewsBySource(e.target.dataset.source)
      );
    });

    // Avatar customization options
    document
      .getElementById('avatar-style')
      .addEventListener('change', () => this.updateAvatarPreview());
    document
      .getElementById('avatar-primary-color')
      .addEventListener('change', () => this.updateAvatarPreview());
    document
      .getElementById('avatar-accent-color')
      .addEventListener('change', () => this.updateAvatarPreview());
  }

  setupElectronListeners() {
    if (window.electronAPI) {
      window.electronAPI.onAvatarUpdated((data) => {
        this.avatarData = data;
        this.updateAvatarDisplay();
      });

      window.electronAPI.onOpenAvatarCustomizer(() => {
        this.openAvatarCustomizer();
      });

      window.electronAPI.onOpenSandboxBrowser(() => {
        this.switchSection('browser');
      });

      window.electronAPI.onRefreshNews(() => {
        this.refreshNewsFeed();
      });

      window.electronAPI.onOpenNewsSource((source) => {
        this.switchSection('news');
        this.filterNewsBySource(source);
      });

      window.electronAPI.onShowAbout(() => {
        this.showAboutDialog();
      });
    }
  }

  switchSection(section) {
    // Update navigation
    document
      .querySelectorAll('.nav-btn')
      .forEach((btn) => btn.classList.remove('active'));
    document.getElementById(`${section}-btn`).classList.add('active');

    // Update content sections
    document
      .querySelectorAll('.content-section')
      .forEach((sec) => sec.classList.remove('active'));
    document.getElementById(`${section}-section`).classList.add('active');

    this.currentSection = section;
  }

  async loadAvatarData() {
    if (window.electronAPI) {
      this.avatarData = await window.electronAPI.getAvatarData();
      this.updateAvatarDisplay();
    }
  }

  updateAvatarDisplay() {
    const avatarElements = document.querySelectorAll('.rev-avatar');
    avatarElements.forEach((avatar) => {
      if (this.avatarData.style) {
        avatar.style.filter = `hue-rotate(${this.avatarData.hueRotation || 0}deg)`;
      }
    });
  }

  openAvatarCustomizer() {
    document.getElementById('avatar-customizer').classList.add('active');
    this.updateAvatarPreview();
  }

  closeAvatarCustomizer() {
    document.getElementById('avatar-customizer').classList.remove('active');
  }

  updateAvatarPreview() {
    const preview = document.getElementById('avatar-preview-img');
    const style = document.getElementById('avatar-style').value;
    const primaryColor = document.getElementById('avatar-primary-color').value;
    const accentColor = document.getElementById('avatar-accent-color').value;

    preview.style.border = `3px solid ${primaryColor}`;
    preview.style.boxShadow = `0 0 10px ${accentColor}`;
  }

  async saveAvatarCustomization() {
    const avatarData = {
      style: document.getElementById('avatar-style').value,
      primaryColor: document.getElementById('avatar-primary-color').value,
      accentColor: document.getElementById('avatar-accent-color').value,
    };

    if (window.electronAPI) {
      await window.electronAPI.saveAvatarCustomization(avatarData);
      this.avatarData = avatarData;
      this.updateAvatarDisplay();
    }

    this.closeAvatarCustomizer();
  }

  async navigateBrowser() {
    const urlInput = document.getElementById('browser-url');
    const url = urlInput.value.trim();
    const frame = document.getElementById('browser-frame');

    if (!url) return;

    // Check if it's a command
    if (
      url.startsWith('open ') ||
      url.startsWith('send ') ||
      url.includes('email')
    ) {
      if (window.electronAPI) {
        try {
          const result = await window.electronAPI.executeCommand(url);
          console.log('Command result:', result);
        } catch (error) {
          console.error('Command error:', error);
        }
      }
    } else {
      // Treat as URL
      let finalUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        finalUrl = `https://${url}`;
      }
      frame.src = finalUrl;
    }
  }

  openNewBrowserWindow() {
    if (window.electronAPI) {
      window.electronAPI.executeCommand('open-new-browser-window');
    }
  }

  createNewThread() {
    // Implementation for creating new thread
    const title = prompt('Enter thread title:');
    if (title) {
      console.log('Creating thread:', title);
      // Would connect to backend GraphQL API
    }
  }

  filterNewsBySource(source) {
    document
      .querySelectorAll('.source-btn')
      .forEach((btn) => btn.classList.remove('active'));
    document.querySelector(`[data-source="${source}"]`).classList.add('active');

    // Filter news cards
    console.log('Filtering news by source:', source);
    // Would fetch filtered news from backend
  }

  refreshNewsFeed() {
    console.log('Refreshing news feed...');
    // Would re-fetch news from backend
  }

  showAboutDialog() {
    alert(
      'TheRev - Revolution in Journalism\n\nA desktop application for political discussions and real journalism.\n\nVersion 1.0.0'
    );
  }

  loadInitialContent() {
    // Connect to localhost GraphQL backend
    console.log('Loading initial content from localhost:4000...');
    this.fetchGraphQLData();
  }

  async fetchGraphQLData() {
    try {
      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
                        query {
                            threads {
                                id
                                title
                                content
                                author {
                                    username
                                }
                                createdAt
                            }
                        }
                    `,
        }),
      });

      const data = await response.json();
      console.log('GraphQL data:', data);
      // Populate UI with data
    } catch (error) {
      console.error('Error fetching from GraphQL:', error);
    }
  }

  // AI Settings Methods
  async initAISettings() {
    this.aiAccounts = {
      chatgpt: { connected: false, apiKey: '', model: 'gpt-4o' },
      claude: { connected: false, apiKey: '', model: 'claude-sonnet-4-20250514' },
      ollama: { connected: false, url: 'http://localhost:11434', model: 'llama3' }
    };
    
    this.loadAIAccountsFromStorage();
    this.setupAIEventListeners();
    await this.checkAIProvidersHealth();
  }

  setupAIEventListeners() {
    // Connect buttons
    document.querySelectorAll('.connect-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.connectAIProvider(e.target.dataset.provider));
    });

    // Toggle switches
    document.getElementById('chatgpt-enabled')?.addEventListener('change', (e) => {
      this.updateProviderEnabled('chatgpt', e.target.checked);
    });
    document.getElementById('claude-enabled')?.addEventListener('change', (e) => {
      this.updateProviderEnabled('claude', e.target.checked);
    });
    document.getElementById('ollama-enabled')?.addEventListener('change', (e) => {
      this.updateProviderEnabled('ollama', e.target.checked);
    });

    // Preference changes
    document.getElementById('default-provider')?.addEventListener('change', (e) => {
      this.savePreference('defaultProvider', e.target.value);
    });
    document.getElementById('free-tier-only')?.addEventListener('change', (e) => {
      this.savePreference('freeTierOnly', e.target.checked);
    });
    document.getElementById('browser-automation')?.addEventListener('change', (e) => {
      this.savePreference('browserAutomation', e.target.checked);
    });
  }

  async connectAIProvider(provider) {
    const btn = document.querySelector(`.connect-btn[data-provider="${provider}"]`);
    btn.textContent = 'Connecting...';
    btn.disabled = true;

    try {
      if (provider === 'ollama') {
        const url = document.getElementById('ollama-url')?.value || 'http://localhost:11434';
        const model = document.getElementById('ollama-model')?.value || 'llama3';
        
        const response = await fetch(`${url}/api/tags`, { method: 'GET' });
        if (response.ok) {
          this.aiAccounts.ollama = { connected: true, url, model };
          this.updateProviderUI('ollama', true);
          this.updateAIStatus('ollama', 'connected');
        } else {
          throw new Error('Connection failed');
        }
      } else {
        const apiKey = document.getElementById(`${provider}-api-key`)?.value;
        if (!apiKey) {
          throw new Error('API key required');
        }
        
        this.aiAccounts[provider] = { 
          connected: true, 
          apiKey, 
          model: document.getElementById(`${provider}-model`)?.value 
        };
        this.updateProviderUI(provider, true);
      }
      
      this.saveAIAccountsToStorage();
      btn.textContent = 'Connected';
      btn.classList.add('connected');
    } catch (error) {
      console.error(`Error connecting to ${provider}:`, error);
      btn.textContent = 'Connect';
      alert(`Failed to connect to ${provider}: ${error.message}`);
    } finally {
      btn.disabled = false;
    }
  }

  updateProviderUI(provider, connected) {
    const card = document.querySelector(`.ai-account-card[data-provider="${provider}"]`);
    const status = card?.querySelector('.provider-status');
    const btn = card?.querySelector('.connect-btn');
    
    if (connected) {
      card?.classList.add('connected');
      if (status) {
        status.textContent = 'Connected';
        status.classList.remove('disconnected');
        status.classList.add('connected');
      }
    } else {
      card?.classList.remove('connected');
      if (status) {
        status.textContent = provider === 'ollama' ? 'Not Running' : 'Not Connected';
        status.classList.add('disconnected');
        status.classList.remove('connected');
      }
      if (btn) {
        btn.textContent = 'Connect';
        btn.classList.remove('connected');
      }
    }
  }

  updateProviderEnabled(provider, enabled) {
    if (this.aiAccounts[provider]) {
      this.aiAccounts[provider].enabled = enabled;
      this.saveAIAccountsToStorage();
    }
  }

  async checkAIProvidersHealth() {
    // Check Ollama first (local)
    try {
      const ollama = this.aiAccounts.ollama;
      if (ollama?.connected) {
        const response = await fetch(`${ollama.url}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(3000) });
        if (response.ok) {
          this.updateAIStatus('ollama', 'connected');
        } else {
          this.updateAIStatus('ollama', 'error');
        }
      }
    } catch {
      this.updateAIStatus('ollama', 'error');
    }
    
    this.updateAIStatus('overall', 'ready');
  }

  updateAIStatus(provider, status) {
    const statusEl = document.getElementById('ai-status');
    const dot = statusEl?.querySelector('.status-dot');
    const text = statusEl?.querySelector('.status-text');
    
    if (dot && text) {
      dot.className = 'status-dot';
      if (status === 'connected') {
        dot.classList.add('connected');
        text.textContent = 'AI Ready';
      } else if (status === 'error') {
        dot.classList.add('error');
        text.textContent = 'Check Settings';
      } else {
        text.textContent = 'Ready';
      }
    }
  }

  loadAIAccountsFromStorage() {
    try {
      const stored = localStorage.getItem('therev_ai_accounts');
      if (stored) {
        this.aiAccounts = JSON.parse(stored);
        
        // Update UI for connected accounts
        Object.keys(this.aiAccounts).forEach(provider => {
          if (this.aiAccounts[provider].connected) {
            this.updateProviderUI(provider, true);
          }
        });
      }
      
      // Load preferences
      const prefs = localStorage.getItem('therev_ai_preferences');
      if (prefs) {
        const preferences = JSON.parse(prefs);
        if (document.getElementById('default-provider')) {
          document.getElementById('default-provider').value = preferences.defaultProvider || 'auto';
        }
        if (document.getElementById('free-tier-only')) {
          document.getElementById('free-tier-only').checked = preferences.freeTierOnly || false;
        }
        if (document.getElementById('browser-automation')) {
          document.getElementById('browser-automation').checked = preferences.browserAutomation !== false;
        }
      }
    } catch (e) {
      console.error('Error loading AI accounts:', e);
    }
  }

  saveAIAccountsToStorage() {
    try {
      localStorage.setItem('therev_ai_accounts', JSON.stringify(this.aiAccounts));
    } catch (e) {
      console.error('Error saving AI accounts:', e);
    }
  }

  savePreference(key, value) {
    try {
      const prefs = JSON.parse(localStorage.getItem('therev_ai_preferences') || '{}');
      prefs[key] = value;
      localStorage.setItem('therev_ai_preferences', JSON.stringify(prefs));
    } catch (e) {
      console.error('Error saving preference:', e);
    }
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new TheRevApp();
});
