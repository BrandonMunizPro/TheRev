// TheRev Desktop App - Frontend JavaScript
class TheRevApp {
  constructor() {
    this.currentSection = 'threads';
    this.avatarData = {};
    this.init();
  }

  async init() {
    await this.loadAvatarData();
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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new TheRevApp();
});
