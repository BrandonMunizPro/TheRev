// TheRev Desktop App - Frontend JavaScript
class TheRevApp {
  constructor() {
    this.currentSection = 'threads';
    this.avatarData = {};
    this.currentApprovalRequest = null;
    this.currentUser = null;
    this.jwtToken = null;
    this.protectedSections = [
      'tasks',
      'analytics',
      'audit',
      'shards',
      'ai-settings',
    ];
    this.adminSections = ['audit', 'shards'];
    this.init();
  }

  async init() {
    // Check for existing auth session
    this.loadAuthSession();

    // Show startup notification
    this.showStartupNotification();

    await this.loadAvatarData();
    await this.initAISettings();
    this.setupEventListeners();
    this.setupElectronListeners();
    this.loadInitialContent();
    this.setupWebviewListeners();

    // Handle deep links from Electron
    this.handleDeepLinks();

    // Set initial UI based on auth state
    this.updateAuthUI();
  }

  handleDeepLinks() {
    // Listen for deep links from main process
    if (window.electronAPI) {
      window.electronAPI.onDeepLink((url) => {
        console.log('[DeepLink] Received:', url);
        this.processDeepLink(url);
      });
    }

    // Also check URL parameters on page load
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('resetToken');
    if (token) {
      this.showResetPasswordModal(token);
    }

    // Check hash for token (therev://reset_password?token=xxx)
    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const hashToken = hashParams.get('resetToken');
      if (hashToken) {
        this.showResetPasswordModal(hashToken);
      }
    }
  }

  processDeepLink(url) {
    try {
      const urlObj = new URL(url);
      if (
        urlObj.pathname.includes('reset_password') ||
        urlObj.pathname.includes('reset-password')
      ) {
        const token =
          urlObj.searchParams.get('resetToken') ||
          urlObj.searchParams.get('token');
        if (token) {
          this.showResetPasswordModal(token);
        }
      }
    } catch (e) {
      console.error('[DeepLink] Error parsing URL:', e);
    }
  }

  // Auth Methods
  loadAuthSession() {
    try {
      const stored = localStorage.getItem('therev_auth');
      if (stored) {
        const auth = JSON.parse(stored);
        if (auth.jwt && auth.user) {
          this.jwtToken = auth.jwt;
          this.currentUser = auth.user;
          this.updateAuthUI();
        }
      }
    } catch (e) {
      console.error('Error loading auth session:', e);
    }
  }

  saveAuthSession(user, jwt) {
    this.currentUser = user;
    this.jwtToken = jwt;
    localStorage.setItem('therev_auth', JSON.stringify({ user, jwt }));
    this.updateAuthUI();
  }

  clearAuthSession() {
    this.currentUser = null;
    this.jwtToken = null;
    localStorage.removeItem('therev_auth');
    this.updateAuthUI();
  }

  updateAuthUI() {
    const loginPage = document.getElementById('login-page');
    const appDiv = document.getElementById('app');

    if (this.currentUser) {
      // User is logged in - show main app, hide login page
      if (loginPage) loginPage.classList.add('hidden');
      if (appDiv) appDiv.style.display = 'block';

      // Update header avatar area
      const userRev = document.getElementById('user-rev-container');
      if (userRev) {
        userRev.innerHTML = `
          <div class="avatar-container" style="display:flex;align-items:center;gap:10px;">
            <img id="user-avatar" src="assets/default-avatar.png" alt="User Rev" class="rev-avatar" style="width:36px;height:36px;border-radius:50%;" />
            <span class="username" style="color:var(--text-primary);font-weight:500;">${this.currentUser.userName || this.currentUser.email}</span>
            ${this.currentUser.role !== 'STANDARD' ? `<span class="role-badge">${this.currentUser.role}</span>` : ''}
            <button class="logout-btn" onclick="theRevApp.logout()">Sign Out</button>
          </div>
        `;
      }
    } else {
      // User is not logged in - show login page, hide main app
      if (loginPage) loginPage.classList.remove('hidden');
      if (appDiv) appDiv.style.display = 'none';
    }

    // Update protected sections visibility
    this.updateProtectedSections();
  }

  updateProtectedSections() {
    this.protectedSections.forEach((sectionId) => {
      const section = document.getElementById(`${sectionId}-section`);
      if (section) {
        if (this.currentUser) {
          section.classList.remove('protected');
        } else {
          section.classList.add('protected');
        }
      }
    });

    // Update nav button visibility for admin sections
    this.adminSections.forEach((sectionId) => {
      const btn = document.getElementById(`${sectionId}-btn`);
      if (btn) {
        btn.style.display =
          this.currentUser && this.currentUser.role === 'ADMIN' ? '' : 'none';
      }
    });
  }

  showLoginModal() {
    const loginPage = document.getElementById('login-page');
    const appDiv = document.getElementById('app');
    if (loginPage) loginPage.classList.remove('hidden');
    if (appDiv) appDiv.style.display = 'none';
  }

  closeLoginModal() {
    // Not used in full page login - keeping for compatibility
  }

  showRegisterModal() {
    console.log('[showRegisterModal] called');
    const modal = document.getElementById('register-modal');
    console.log('[showRegisterModal] modal element:', modal);
    console.log(
      '[showRegisterModal] modal classList before:',
      modal?.classList
    );
    this.closeLoginModal();
    modal.classList.add('active');
    console.log('[showRegisterModal] modal classList after:', modal?.classList);
  }

  closeRegisterModal() {
    document.getElementById('register-modal').classList.remove('active');
    document.getElementById('register-error').style.display = 'none';
    document.getElementById('register-form').reset();
  }

  showForgotPasswordModal() {
    console.log('[showForgotPasswordModal] called');
    const modal = document.getElementById('forgot-password-modal');
    console.log('[showForgotPasswordModal] modal element:', modal);
    console.log(
      '[showForgotPasswordModal] modal classList before:',
      modal?.classList
    );
    modal.classList.add('active');
    console.log(
      '[showForgotPasswordModal] modal classList after:',
      modal?.classList
    );
    document.getElementById('forgot-password-error').style.display = 'none';
    document.getElementById('forgot-password-success').style.display = 'none';
  }

  closeForgotPasswordModal() {
    document.getElementById('forgot-password-modal').classList.remove('active');
    document.getElementById('forgot-password-error').style.display = 'none';
    document.getElementById('forgot-password-success').style.display = 'none';
    document.getElementById('forgot-password-form').reset();
  }

  showResetPasswordModal(token) {
    document.getElementById('rp-token').value = token;
    document.getElementById('reset-password-modal').classList.add('active');
    document.getElementById('reset-password-error').style.display = 'none';
    document.getElementById('reset-password-success').style.display = 'none';
  }

  closeResetPasswordModal() {
    document.getElementById('reset-password-modal').classList.remove('active');
    document.getElementById('reset-password-error').style.display = 'none';
    document.getElementById('reset-password-success').style.display = 'none';
    document.getElementById('reset-password-form').reset();
  }

  async resetPassword(userName, token, newPassword) {
    try {
      const errorEl = document.getElementById('reset-password-error');
      const successEl = document.getElementById('reset-password-success');

      errorEl.style.display = 'none';
      successEl.style.display = 'none';

      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation ResetPassword($userName: String!, $resetToken: String!, $newPassword: String!) {
              resetPassword(userName: $userName, resetToken: $resetToken, newPassword: $newPassword)
            }
          `,
          variables: { userName, resetToken: token, newPassword },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      if (result.data?.resetPassword) {
        successEl.textContent =
          'Password reset successfully! You can now login with your new password.';
        successEl.style.display = 'block';
        setTimeout(() => {
          this.closeResetPasswordModal();
          this.showLoginModal();
        }, 2000);
      }
    } catch (error) {
      const errorEl = document.getElementById('reset-password-error');
      errorEl.textContent = error.message || 'Failed to reset password';
      errorEl.style.display = 'block';
    }
  }

  async forgotPassword(userName) {
    try {
      const errorEl = document.getElementById('forgot-password-error');
      const successEl = document.getElementById('forgot-password-success');

      errorEl.style.display = 'none';
      successEl.style.display = 'none';

      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation ForgotPassword($userName: String!) {
              forgotPassword(userName: $userName)
            }
          `,
          variables: { userName },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      if (result.data?.forgotPassword) {
        successEl.textContent = 'Password reset link sent to your email!';
        successEl.style.display = 'block';
      }
    } catch (error) {
      const errorEl = document.getElementById('forgot-password-error');
      errorEl.textContent = error.message || 'Failed to send reset link';
      errorEl.style.display = 'block';
    }
  }

  async login(identifier, password) {
    try {
      // Determine if identifier is email or username
      const isEmail = identifier.includes('@');
      const identifierField = isEmail
        ? { email: identifier }
        : { userName: identifier };

      console.log('[Login] Attempting login with:', identifierField);

      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation Login($identifier: UserIdentifierInput!, $password: String!) {
              verifyUser(identifier: $identifier, password: $password) {
                user {
                  id
                  userName
                  firstName
                  lastName
                  email
                  role
                  ideology
                }
                jwt
              }
            }
          `,
          variables: { identifier: identifierField, password },
        }),
      });

      const result = await response.json();
      console.log('[Login] Response:', result);

      if (result.errors) {
        console.error(
          '[Login] GraphQL errors:',
          JSON.stringify(result.errors, null, 2)
        );
        const errorMsg = result.errors[0]?.message || 'Unknown error';
        const extensions = result.errors[0]?.extensions;
        console.error('[Login] Error details:', extensions);
        throw new Error(errorMsg);
      }

      if (result.data?.verifyUser) {
        const { user, jwt } = result.data.verifyUser;
        console.log('[Login] Success! User:', user);
        this.saveAuthSession(user, jwt);
        return { success: true };
      } else {
        console.log('[Login] No data returned');
        throw new Error('Invalid email or password');
      }
    } catch (error) {
      console.error('[Login] Error:', error);
      const errorEl = document.getElementById('login-error');
      if (errorEl) {
        errorEl.textContent = error.message || 'Login failed';
        errorEl.style.display = 'block';
      }
      return { success: false, error: error.message };
    }
  }

  async register(userData) {
    try {
      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation Register($input: CreateUserInput!) {
              createUser(data: $input) {
                id
                userName
                email
              }
            }
          `,
          variables: { input: userData },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Auto-login after registration
      return await this.login(userData.email, userData.password);
    } catch (error) {
      console.error('Registration error:', error);
      const errorEl = document.getElementById('register-error');
      errorEl.textContent = error.message || 'Registration failed';
      errorEl.style.display = 'block';
      return { success: false, error: error.message };
    }
  }

  logout() {
    this.clearAuthSession();
    // updateAuthUI will show login page since currentUser is now null
  }

  isAuthenticated() {
    return !!this.currentUser && !!this.jwtToken;
  }

  hasRole(role) {
    return this.currentUser?.role === role;
  }

  canAccessSection(section) {
    if (!this.isAuthenticated()) return false;
    if (section === 'audit' || section === 'shards') {
      return this.hasRole('ADMIN');
    }
    return true;
  }

  showStartupNotification() {
    // Create startup toast notification
    const toast = document.createElement('div');
    toast.id = 'startup-toast';
    toast.className = 'startup-toast';
    toast.innerHTML = `
      <div class="startup-content">
        <span class="startup-icon">🔥</span>
        <span class="startup-text">Revving up your engine...</span>
      </div>
    `;
    document.body.appendChild(toast);

    // Listen for Ollama ready
    if (window.electronAPI?.onOllamaReady) {
      window.electronAPI.onOllamaReady((data) => {
        const toast = document.getElementById('startup-toast');
        if (toast) {
          toast.innerHTML = `
            <div class="startup-content success">
              <span class="startup-icon">✅</span>
              <span class="startup-text">Rev is ready! ${data.model ? '(' + data.model + ')' : ''}</span>
            </div>
          `;
          setTimeout(() => toast.remove(), 4000);
        }
      });
    }

    // Auto-remove after 10 seconds if no response
    setTimeout(() => {
      const toast = document.getElementById('startup-toast');
      if (toast) {
        toast.innerHTML = `
          <div class="startup-content warning">
            <span class="startup-icon">⚠️</span>
            <span class="startup-text">Using fallback mode</span>
          </div>
        `;
        setTimeout(() => toast.remove(), 3000);
      }
    }, 10000);
  }

  setupWebviewListeners() {
    const webview = document.getElementById('browser-frame');
    if (!webview || webview.tagName !== 'WEBVIEW') return;

    webview.addEventListener('did-start-loading', () => {
      const statusEl = document.getElementById('browser-status');
      const statusText = statusEl?.querySelector('.status-text');
      if (statusText) statusText.textContent = 'Loading...';
    });

    webview.addEventListener('did-stop-loading', () => {
      const statusEl = document.getElementById('browser-status');
      const statusText = statusEl?.querySelector('.status-text');
      try {
        const url = webview.getURL();
        const title = webview.getTitle();
        if (statusText) statusText.textContent = title || url;
      } catch (e) {
        if (statusText) statusText.textContent = 'Page loaded';
      }
    });

    webview.addEventListener('did-fail-load', (event) => {
      const statusEl = document.getElementById('browser-status');
      const statusText = statusEl?.querySelector('.status-text');
      if (statusText)
        statusText.textContent = 'Failed to load: ' + event.errorDescription;
    });
  }

  setupEventListeners() {
    // Use event delegation - attach to document for dynamically created elements

    // Navigation
    document
      .getElementById('threads-btn')
      ?.addEventListener('click', () => this.switchSection('threads'));
    document
      .getElementById('news-btn')
      ?.addEventListener('click', () => this.switchSection('news'));
    document
      .getElementById('news-refresh-btn')
      ?.addEventListener('click', () => this.refreshNewsFeed());

    document
      .getElementById('ai-settings-btn')
      ?.addEventListener('click', () => this.switchSection('ai-settings'));
    document
      .getElementById('tasks-btn')
      ?.addEventListener('click', () => this.switchSection('tasks'));
    document
      .getElementById('analytics-btn')
      ?.addEventListener('click', () => this.switchSection('analytics'));
    document
      .getElementById('audit-btn')
      ?.addEventListener('click', () => this.switchSection('audit'));
    document
      .getElementById('shards-btn')
      ?.addEventListener('click', () => this.switchSection('shards'));
    document
      .getElementById('profile-btn')
      ?.addEventListener('click', () => this.switchSection('profile'));
    document
      .getElementById('browser-btn')
      ?.addEventListener('click', () => this.switchSection('browser'));

    // Use delegation for browser section elements (they may not exist yet)
    document.addEventListener('click', (e) => {
      const target = e.target;

      // Ask Rev button
      if (target.id === 'ai-command-btn' || target.closest('#ai-command-btn')) {
        this.executeAICommand();
      }

      // New Window button
      if (
        target.id === 'browser-new-window' ||
        target.closest('#browser-new-window')
      ) {
        this.openNewBrowserWindow();
      }
    });

    document.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && e.target.id === 'ai-command-input') {
        this.executeAICommand();
      }
    });

    // Browser mode switch
    const browserModeSelect = document.getElementById('browser-input-mode');
    if (browserModeSelect) {
      browserModeSelect.addEventListener('change', (e) => {
        const isAiMode = e.target.value === 'ai';
        const input = document.getElementById('ai-command-input');
        const btn = document.getElementById('ai-command-btn');
        if (input) {
          input.placeholder = isAiMode
            ? 'Ask Rev: "Go to Gmail and find emails about meeting"'
            : 'Type a website: youtube.com, gmail.com';
        }
        if (btn) {
          btn.textContent = isAiMode ? '🤖 Ask Rev' : 'Go';
        }
      });
    }

    // AI approval buttons
    document.getElementById('ai-approve-btn')?.addEventListener('click', () => {
      this.respondToApproval(true);
    });
    document.getElementById('ai-deny-btn')?.addEventListener('click', () => {
      this.respondToApproval(false);
    });

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
      ?.addEventListener('click', () => this.navigateBrowser());
    document
      .getElementById('browser-new-window')
      ?.addEventListener('click', () => this.openNewBrowserWindow());
    document
      .getElementById('browser-url')
      ?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.navigateBrowser();
      });

    // Quick site buttons - also use delegation
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.quick-site-btn');
      if (btn) {
        const url = btn.dataset.url;
        const frame = document.getElementById('browser-frame');
        if (frame && url) frame.src = url;
      }
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

    // Login form
    console.log('[setupEventListeners] Setting up login-form listener');
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        console.log('[setupEventListeners] login-form submitted');
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        console.log('[setupEventListeners] Login attempt with:', email);
        await this.login(email, password);
      });
    } else {
      console.log('[setupEventListeners] login-form not found');
    }

    // Register form
    document
      .getElementById('register-form')
      ?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userData = {
          userName: document.getElementById('reg-username').value,
          email: document.getElementById('reg-email').value,
          firstName: document.getElementById('reg-firstName').value,
          lastName: document.getElementById('reg-lastName').value,
          password: document.getElementById('reg-password').value,
          ideology: document.getElementById('reg-ideology').value || undefined,
        };
        const result = await this.register(userData);
        if (result.success) {
          this.closeRegisterModal();
        }
      });

    // Show register link
    console.log('[setupEventListeners] Setting up show-register listener');
    const showRegisterBtn = document.getElementById('show-register');
    if (showRegisterBtn) {
      showRegisterBtn.addEventListener('click', (e) => {
        console.log('[setupEventListeners] show-register clicked');
        e.preventDefault();
        this.showRegisterModal();
      });
    } else {
      console.log('[setupEventListeners] show-register not found');
    }

    // Forgot password link
    console.log('[setupEventListeners] Setting up forgot-password listener');
    const forgotPasswordBtn = document.getElementById('forgot-password');
    if (forgotPasswordBtn) {
      forgotPasswordBtn.addEventListener('click', (e) => {
        console.log('[setupEventListeners] forgot-password clicked');
        e.preventDefault();
        this.showForgotPasswordModal();
      });
    } else {
      console.log('[setupEventListeners] forgot-password not found');
    }

    // Forgot password form submission
    document
      .getElementById('forgot-password-form')
      ?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userName = document.getElementById('fp-username').value;
        await this.forgotPassword(userName);
      });

    // Reset password form submission
    document
      .getElementById('reset-password-form')
      ?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = document.getElementById('rp-token').value;
        const password = document.getElementById('rp-password').value;
        const confirmPassword = document.getElementById(
          'rp-confirm-password'
        ).value;

        if (password !== confirmPassword) {
          const errorEl = document.getElementById('reset-password-error');
          errorEl.textContent = 'Passwords do not match';
          errorEl.style.display = 'block';
          return;
        }

        if (password.length < 8) {
          const errorEl = document.getElementById('reset-password-error');
          errorEl.textContent = 'Password must be at least 8 characters';
          errorEl.style.display = 'block';
          return;
        }

        // Extract username from token (we need to decode it)
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          await this.resetPassword(payload.userName, token, password);
        } catch (err) {
          const errorEl = document.getElementById('reset-password-error');
          errorEl.textContent = 'Invalid reset token';
          errorEl.style.display = 'block';
        }
      });

    // Close reset password modal on background click
    document
      .getElementById('reset-password-modal')
      ?.addEventListener('click', (e) => {
        if (e.target.id === 'reset-password-modal')
          this.closeResetPasswordModal();
      });

    // Login button in header
    document
      .querySelector('.login-btn')
      ?.addEventListener('click', () => this.showLoginModal());

    // Close modals on background click
    document.getElementById('login-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'login-modal') this.closeLoginModal();
    });

    // AI approval buttons
    document.getElementById('ai-approve-btn')?.addEventListener('click', () => {
      this.handleApproval(true);
    });
    document.getElementById('ai-deny-btn')?.addEventListener('click', () => {
      this.handleApproval(false);
    });

    // Register modal
    document
      .getElementById('register-modal')
      ?.addEventListener('click', (e) => {
        if (e.target.id === 'register-modal') this.closeRegisterModal();
      });

    // Forgot password modal background click
    document
      .getElementById('forgot-password-modal')
      ?.addEventListener('click', (e) => {
        if (e.target.id === 'forgot-password-modal')
          this.closeForgotPasswordModal();
      });

    // Browser controls - check if elements exist first
    const browserNav = document.getElementById('browser-navigate');
    if (browserNav) {
      browserNav.addEventListener('click', () => this.navigateBrowser());
    }
    const browserNewWin = document.getElementById('browser-new-window');
    if (browserNewWin) {
      browserNewWin.addEventListener('click', () =>
        this.openNewBrowserWindow()
      );
    }
    const browserUrl = document.getElementById('browser-url');
    if (browserUrl) {
      browserUrl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.navigateBrowser();
      });
    }
    document
      .getElementById('register-modal')
      ?.addEventListener('click', (e) => {
        if (e.target.id === 'register-modal') this.closeRegisterModal();
      });

    // Forgot password modal background click
    document
      .getElementById('forgot-password-modal')
      ?.addEventListener('click', (e) => {
        if (e.target.id === 'forgot-password-modal')
          this.closeForgotPasswordModal();
      });
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

    // Load section-specific data
    switch (section) {
      case 'tasks':
        this.loadTasks();
        break;
      case 'analytics':
        this.loadAnalytics();
        break;
      case 'audit':
        this.loadAuditLog();
        break;
      case 'shards':
        this.loadShardHealth();
        break;
      case 'news':
        this.loadNews();
        break;
    }
  }

  async loadTasks() {
    if (window.electronAPI) {
      const tasks = await window.electronAPI.getTasks();
      this.renderTasks(tasks);
      this.updateTaskStats(tasks);
    }
  }

  renderTasks(tasks) {
    const container = document.getElementById('task-list');
    if (!container) return;

    if (tasks.length === 0) {
      container.innerHTML = '<div class="empty-state">No tasks found</div>';
      return;
    }

    container.innerHTML = tasks
      .map(
        (task) => `
      <div class="task-card ${task.status}" data-task-id="${task.id}">
        <div class="task-header">
          <span class="task-type">${task.type}</span>
          <span class="task-status status-${task.status}">${task.status}</span>
        </div>
        <div class="task-content">${task.intent || task.description || 'AI Task'}</div>
        <div class="task-meta">
          <span class="task-provider">${task.provider}</span>
          <span class="task-time">${this.formatTime(task.createdAt)}</span>
        </div>
        ${task.status === 'failed' ? `<div class="task-error">${task.error || 'Task failed'}</div>` : ''}
      </div>
    `
      )
      .join('');
  }

  updateTaskStats(tasks) {
    const stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
    tasks.forEach((task) => {
      if (stats[task.status] !== undefined) stats[task.status]++;
    });
    document.getElementById('stat-pending').textContent = stats.pending;
    document.getElementById('stat-processing').textContent = stats.processing;
    document.getElementById('stat-completed').textContent = stats.completed;
    document.getElementById('stat-failed').textContent = stats.failed;
  }

  async loadAnalytics() {
    if (window.electronAPI) {
      const analytics = await window.electronAPI.getAnalytics();
      this.renderAnalytics(analytics);
    }
  }

  renderAnalytics(data) {
    document.getElementById('total-tokens').textContent = this.formatNumber(
      data.totalTokens || 0
    );
    document.getElementById('total-tasks').textContent = this.formatNumber(
      data.totalTasks || 0
    );
    document.getElementById('total-cost').textContent =
      `$${(data.totalCost || 0).toFixed(2)}`;
    document.getElementById('avg-response').textContent =
      `${data.avgResponseTime || 0}ms`;

    // Render provider chart
    const providerChart = document.getElementById('provider-chart');
    if (providerChart && data.byProvider) {
      const providers = Object.entries(data.byProvider);
      providerChart.innerHTML = providers
        .map(
          ([provider, count]) => `
        <div class="provider-row">
          <span class="provider-name">${provider}</span>
          <div class="provider-bar">
            <div class="provider-fill" style="width: ${(count / data.totalTasks) * 100}%"></div>
          </div>
          <span class="provider-count">${count}</span>
        </div>
      `
        )
        .join('');
    }
  }

  async loadAuditLog() {
    if (window.electronAPI) {
      const filter = {
        category:
          document.getElementById('audit-category-filter')?.value || 'all',
        startDate: document.getElementById('audit-date-from')?.value,
        endDate: document.getElementById('audit-date-to')?.value,
      };
      const logs = await window.electronAPI.getAuditLog(filter);
      this.renderAuditLog(logs);
    }
  }

  renderAuditLog(logs) {
    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;

    if (logs.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="empty-state">No audit entries found</td></tr>';
      return;
    }

    let warnings = 0,
      critical = 0;
    logs.forEach((log) => {
      if (log.severity === 'warning') warnings++;
      if (log.severity === 'critical') critical++;
    });

    document.getElementById('audit-total').textContent = logs.length;
    document.getElementById('audit-warnings').textContent = warnings;
    document.getElementById('audit-critical').textContent = critical;

    tbody.innerHTML = logs
      .map(
        (log) => `
      <tr class="severity-${log.severity}">
        <td>${this.formatTime(log.timestamp)}</td>
        <td>${log.category}</td>
        <td>${log.eventType}</td>
        <td>${log.userId || '-'}</td>
        <td><span class="outcome-badge ${log.outcome}">${log.outcome}</span></td>
        <td><span class="severity-badge ${log.severity}">${log.severity}</span></td>
      </tr>
    `
      )
      .join('');
  }

  async loadShardHealth() {
    if (window.electronAPI) {
      const shards = await window.electronAPI.getShardHealth();
      this.renderShardHealth(shards);
    }
  }

  renderShardHealth(shards) {
    const grid = document.getElementById('shards-grid');
    if (!grid) return;

    const stats = { total: shards.length, healthy: 0, degraded: 0, offline: 0 };
    shards.forEach((shard) => {
      if (shard.isHealthy) stats.healthy++;
      else if (shard.isQuarantined) stats.offline++;
      else stats.degraded++;
    });

    document.getElementById('shards-total').textContent = stats.total;
    document.getElementById('shards-healthy').textContent = stats.healthy;
    document.getElementById('shards-degraded').textContent = stats.degraded;
    document.getElementById('shards-offline').textContent = stats.offline;

    grid.innerHTML = shards
      .map(
        (shard) => `
      <div class="shard-card ${shard.isHealthy ? 'healthy' : shard.isQuarantined ? 'offline' : 'degraded'}">
        <div class="shard-header">
          <span class="shard-id">${shard.shardId}</span>
          <span class="shard-type">${shard.shardType}</span>
        </div>
        <div class="shard-status">
          <span class="status-indicator ${shard.isHealthy ? 'online' : 'offline'}"></span>
          ${shard.isQuarantined ? 'Quarantined' : shard.isHealthy ? 'Healthy' : 'Degraded'}
        </div>
        <div class="shard-metrics">
          <div class="metric">
            <span class="metric-label">Load</span>
            <span class="metric-value">${(shard.currentLoad * 100).toFixed(1)}%</span>
          </div>
          <div class="metric">
            <span class="metric-label">Connections</span>
            <span class="metric-value">${shard.activeConnections}</span>
          </div>
        </div>
        ${shard.quarantineReason ? `<div class="shard-alert">${shard.quarantineReason}</div>` : ''}
      </div>
    `
      )
      .join('');
  }

  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  formatTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString();
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

  async executeAICommand() {
    const input = document.getElementById('ai-command-input');
    const modeSelect = document.getElementById('browser-input-mode');
    const command = input.value.trim();
    if (!command) return;

    const isAiMode = modeSelect?.value === 'ai';
    const statusEl = document.getElementById('browser-status');
    const statusText = statusEl?.querySelector('.status-text');
    const aiResponseArea = document.getElementById('ai-response-area');
    const aiResponseText = document.getElementById('ai-response-text');
    const aiApprovalSection = document.getElementById('ai-approval-section');

    // URL Mode - use webview to load actual sites
    if (!isAiMode) {
      let finalUrl = command;
      if (!command.startsWith('http://') && !command.startsWith('https://')) {
        finalUrl = `https://${command}`;
      }

      if (statusText) statusText.textContent = 'Loading: ' + finalUrl;

      const frame = document.getElementById('browser-frame');
      if (frame && frame.tagName === 'WEBVIEW') {
        // Use webview's loadURL for actual site rendering
        frame
          .loadURL(finalUrl)
          .then(() => {
            if (statusText) statusText.textContent = 'Loaded: ' + finalUrl;
          })
          .catch((err) => {
            if (statusText) statusText.textContent = 'Error: ' + err.message;
          });
      } else if (frame) {
        // Fallback for iframe
        frame.src = finalUrl;
        if (statusText) statusText.textContent = 'Opening: ' + finalUrl;
      }
      return;
    }

    // AI Mode
    if (statusText) statusText.textContent = '🤖 Rev is thinking...';
    if (aiResponseArea) aiResponseArea.style.display = 'none';

    try {
      if (window.electronAPI?.['ai-brain:execute']) {
        const result = await window.electronAPI['ai-brain:execute']({
          task: command,
          userId: 'local-user',
        });

        console.log('AI Brain result:', result);

        if (result.success) {
          if (result.approvalRequest) {
            if (aiResponseText) {
              aiResponseText.textContent = result.approvalRequest.actions
                .map((a) => `${a.type}: ${a.reason}`)
                .join(' | ');
            }
            if (aiApprovalSection) aiApprovalSection.style.display = 'flex';
            if (aiResponseArea) aiResponseArea.style.display = 'block';
            if (statusText) statusText.textContent = '⚠️ Approval needed';
            this.currentApprovalRequest = {
              ...result.approvalRequest,
              originalCommand: command,
            };
          } else if (result.actions) {
            if (aiResponseText)
              aiResponseText.textContent = `Executed: ${result.actions.map((a) => a.type).join(', ')}`;
            if (aiApprovalSection) aiApprovalSection.style.display = 'none';
            if (aiResponseArea) aiResponseArea.style.display = 'block';
            if (statusText) statusText.textContent = '✅ Done';
            input.value = '';
          }
        } else {
          if (aiResponseText)
            aiResponseText.textContent = 'Error: ' + (result.error || 'Failed');
          if (aiResponseArea) aiResponseArea.style.display = 'block';
          if (statusText)
            statusText.textContent = 'Error: ' + (result.error || 'Failed');
        }
      }
    } catch (error) {
      if (statusText) statusText.textContent = 'Error: ' + error.message;
    }
  }

  showApprovalDialog(approvalRequest) {
    const approved = confirm(
      `🤖 Rev wants to perform:\n\n${approvalRequest.actions.map((a) => `• ${a.type}: ${a.reason}`).join('\n')}\n\nAllow?`
    );

    if (window.electronAPI?.['ai-brain:approve']) {
      window.electronAPI['ai-brain:approve']({
        taskId: approvalRequest.id,
        approved,
      }).then((result) => {
        const statusText = document.querySelector(
          '#browser-status .status-text'
        );
        if (statusText) {
          statusText.textContent = approved ? '✅ Approved!' : '❌ Denied';
        }
      });
    }
  }

  async respondToApproval(approved) {
    if (!this.currentApprovalRequest) return;

    const statusText = document.querySelector('#browser-status .status-text');
    const aiApprovalSection = document.getElementById('ai-approval-section');
    const aiResponseText = document.getElementById('ai-response-text');
    const command = this.currentApprovalRequest.originalCommand;

    if (!approved) {
      if (statusText) statusText.textContent = '❌ Denied';
      if (aiResponseText) aiResponseText.textContent = 'Action denied';
      if (aiApprovalSection) aiApprovalSection.style.display = 'none';
      this.currentApprovalRequest = null;
      return;
    }

    // Approved - open AI browser window
    if (statusText) statusText.textContent = '✅ Opening AI Browser...';

    try {
      // Use IPC to open the AI browser window
      if (window.electronAPI?.openAIBrowser) {
        await window.electronAPI.openAIBrowser();
        if (statusText) statusText.textContent = '✅ AI Browser opened!';
        if (aiResponseText)
          aiResponseText.textContent =
            'AI Browser opened - you can now chat with Rev there!';
      } else {
        // Fallback - open directly
        window.open('ai-browser.html', '_blank', 'width=1200,height=800');
        if (statusText) statusText.textContent = '✅ AI Browser opened!';
      }
    } catch (error) {
      if (statusText) statusText.textContent = 'Error: ' + error.message;
    }

    if (aiApprovalSection) aiApprovalSection.style.display = 'none';
    this.currentApprovalRequest = null;
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

  async refreshNewsFeed() {
    console.log('Refreshing news feed...');
    try {
      const syncResponse = await fetch('http://localhost:4000/api/news/sync', {
        method: 'POST',
      });
      const syncResult = await syncResponse.json();
      console.log('News sync result:', syncResult);
      await this.loadNews();
    } catch (error) {
      console.error('Error refreshing news:', error);
    }
  }

  async loadNews() {
    const container = document.querySelector('.news-container');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading news...</div>';

    try {
      // Check if we have any news, if not auto-sync
      const checkUrl = new URL('http://localhost:4000/api/news');
      const checkResponse = await fetch(checkUrl.toString());
      const existingNews = await checkResponse.json();

      // If no news, auto-sync feeds
      if (!existingNews || existingNews.length === 0) {
        console.log('No news found, auto-syncing feeds...');
        try {
          await fetch('http://localhost:4000/api/news/sync', {
            method: 'POST',
          });
        } catch (e) {
          console.log('Auto-sync failed:', e);
        }
      }

      // Fetch all news
      const response = await fetch('http://localhost:4000/api/news');
      const news = await response.json();

      if (!news || news.length === 0) {
        container.innerHTML =
          '<div class="empty-state">No news available. Click refresh to fetch latest news.</div>';
        return;
      }

      this.renderNews(news);
    } catch (error) {
      console.error('Error loading news:', error);
      container.innerHTML = '<div class="error">Failed to load news</div>';
    }
  }

  renderNews(news) {
    const container = document.querySelector('.news-container');
    if (!container) {
      console.error('News container not found');
      return;
    }

    console.log('Rendering news, count:', news?.length || 0);

    if (!news || !Array.isArray(news) || news.length === 0) {
      container.innerHTML =
        '<div class="empty-state">No news available. Click refresh to fetch latest news.</div>';
      return;
    }

    const sourceColors = {
      'The Grayzone': { bg: '#cc0000', letter: 'GZ' },
      'The Intercept': { bg: '#1a1a1a', letter: 'INT' },
      'Democracy Now': { bg: '#2e7d32', letter: 'DN' },
      'Al Jazeera': { bg: '#c62828', letter: 'AJ' },
      'Drop Site News': { bg: '#e65100', letter: 'DS' },
    };

    const getSourceColor = (name) => {
      for (const key of Object.keys(sourceColors)) {
        if (name.toLowerCase().includes(key.toLowerCase())) {
          return sourceColors[key];
        }
      }
      return { bg: '#555555', letter: name.substring(0, 2).toUpperCase() };
    };

    const renderCard = (item, index) => {
      if (!item) {
        return '<div class="news-card"><div class="news-content">Invalid item</div></div>';
      }

      const title = item.title || 'Untitled';
      const url = item.url || '#';
      const sourceName = item.sourceName || 'Unknown Source';
      const newsType = item.newsType || 'article';
      const publishedAt = item.publishedAt
        ? this.formatTimestamp(item.publishedAt)
        : '';
      const summary = item.summary
        ? item.summary.substring(0, 150) + '...'
        : '';
      const imageUrl = item.imageUrl || '';
      const sourceColor = getSourceColor(sourceName);
      const articleId = item.id || '';

      return `
        <div class="news-card" data-url="${url}" data-type="${newsType}" data-id="${articleId}" data-title="${encodeURIComponent(title)}">
          ${
            imageUrl
              ? `<img src="${imageUrl}" alt="${title}" class="news-image" onerror="this.style.display='none'">`
              : `<div class="news-image-placeholder" style="background: ${sourceColor.bg}; color: white; font-size: 28px; font-weight: bold;">${sourceColor.letter}</div>`
          }
          <div class="news-content">
            <h3>${title}</h3>
            <div class="news-meta">
              <span class="source">${sourceName}</span>
              <span class="timestamp">${publishedAt}</span>
              ${newsType === 'video' ? '<span class="type-badge">VIDEO</span>' : ''}
            </div>
            ${summary ? `<p class="news-preview">${summary}</p>` : ''}
          </div>
        </div>
      `;
    };

    container.innerHTML = news.map(renderCard).join('');

    // Add click handlers
    container.querySelectorAll('.news-card').forEach((card) => {
      card.addEventListener('click', () => {
        const url = card.dataset.url;
        const articleId = card.dataset.id;
        const title = decodeURIComponent(card.dataset.title || '');
        this.showOpenModeModal(url, articleId, title);
      });
    });
  }

  showOpenModeModal(url, articleId = '', title = '') {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Open in...</h3>
        <button class="modal-btn ai-mode">
          <span class="icon">🤖</span>
          <span>AI Browser (with Rev)</span>
        </button>
        <button class="modal-btn normal-mode">
          <span class="icon">🌐</span>
          <span>Normal Browser</span>
        </button>
        <button class="modal-btn cancel">Cancel</button>
      </div>
    `;

    modal.querySelector('.ai-mode').addEventListener('click', () => {
      modal.remove();
      this.openInAIBrowser(url, articleId, title);
    });

    modal.querySelector('.normal-mode').addEventListener('click', () => {
      modal.remove();
      this.openInNormalBrowser(url);
    });

    modal.querySelector('.cancel').addEventListener('click', () => {
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
  }

  async openInAIBrowser(url, articleId = '', title = '') {
    console.log('Opening in AI Browser:', url, 'Article ID:', articleId);

    let aiSummary = null;

    // Try to get AI summary if we have an article ID
    let context = null;
    let fetchSummaryPromise = null;

    if (articleId) {
      try {
        console.log('Fetching AI summary for article...');

        // First, set initial context with title
        context = `Article: ${title}`;

        // Start fetching summary in background (don't await)
        fetchSummaryPromise = fetch(
          'http://localhost:4000/api/news/summarize',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ articleId, url, title }),
          }
        )
          .then(async (response) => {
            const result = await response.json();
            console.log(
              'Summary response:',
              JSON.stringify(result).substring(0, 500)
            );
            if (result.success && result.summary) {
              console.log('AI Summary fetched:', result.summary);
              return result.summary;
            }
            return null;
          })
          .catch((err) => {
            console.error('Error fetching summary:', err);
            return null;
          });
      } catch (err) {
        console.error('Error setting up summary fetch:', err);
        context = `Article: ${title}`;
      }
    } else {
      context = `Article: ${title}`;
    }

    // Open the AI browser window
    console.log('openInAIBrowser - electronAPI exists:', !!window.electronAPI);
    console.log(
      'openInAIBrowser - openAIBrowser exists:',
      !!(window.electronAPI && window.electronAPI.openAIBrowser)
    );

    if (window.electronAPI && window.electronAPI.openAIBrowser) {
      console.log(
        'Opening AI Browser via Electron API with URL:',
        url,
        'Context:',
        context ? 'yes' : 'no'
      );
      // Use Electron API to open AI browser with context
      window.electronAPI
        .openAIBrowser(url, context)
        .then((result) => {
          console.log('openAIBrowser result:', result);

          // After window opens, wait for summary to load and update chat
          if (fetchSummaryPromise) {
            fetchSummaryPromise.then((summary) => {
              if (summary) {
                console.log('Updating chat with AI summary...');
                window.electronAPI.updateAIChatWithSummary(summary);
              }
            });
          }
        })
        .catch((err) => {
          console.error('openAIBrowser error:', err);
          // Fallback
          this.openAIBrowserFallback(url, aiSummary);
        });
    } else {
      console.log('Using fallback - no Electron API');
      // Fallback: open the standalone AI browser page
      this.openAIBrowserFallback(url, context);
    }
  }

  openAIBrowserFallback(url, context) {
    console.log('openAIBrowserFallback - URL:', url, 'Context:', context);
    this.switchSection('browser');
    const urlInput = document.getElementById('browser-url');
    if (urlInput) {
      urlInput.value = url;
    }
    const frame = document.getElementById('browser-frame');
    if (frame) {
      let finalUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        finalUrl = `https://${url}`;
      }
      frame.src = finalUrl;

      // If we have a context/summary, display it
      if (context) {
        const responseArea = document.getElementById('ai-response-area');
        const responseText = document.getElementById('ai-response-text');
        if (responseArea && responseText) {
          responseArea.style.display = 'flex';
          responseText.innerHTML = `<strong>📰 Article Context:</strong><br><br>${context}`;
        }
      }
    }
  }

  openInNormalBrowser(url) {
    console.log('Opening in Normal Browser:', url);
    window.open(url, '_blank');
  }

  formatTimestamp(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
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

      if (!response.ok) {
        console.log(
          'GraphQL backend not available yet - this is expected during development'
        );
        return;
      }

      const data = await response.json();
      console.log('GraphQL data:', data);
    } catch (error) {
      console.log(
        'GraphQL backend not running on localhost:4000 - this is expected during development'
      );
    }
  }

  // AI Settings Methods
  async initAISettings() {
    this.aiAccounts = {
      CHATGPT: { connected: false, enabled: true, apiKey: '', model: 'gpt-4o' },
      CLAUDE: {
        connected: false,
        enabled: true,
        apiKey: '',
        model: 'claude-sonnet-4-20250514',
      },
      GEMINI: {
        connected: false,
        enabled: true,
        apiKey: '',
        model: 'gemini-1.5-pro',
      },
      PERPLEXITY: {
        connected: false,
        enabled: true,
        apiKey: '',
        model: 'llama-3.1-sonar-large-128k-online',
      },
      OPEN_SOURCE: {
        connected: false,
        enabled: true,
        url: 'http://localhost:11434',
        model: 'llama3',
      },
    };

    this.healthStatus = {};

    this.loadAIAccountsFromStorage();
    this.setupAIEventListeners();

    // Auto-check and start Ollama if available
    await this.autoStartOllama();

    await this.checkAIProvidersHealth();
    this.startHealthMonitoring();
  }

  async autoStartOllama() {
    if (!window.electronAPI) return; // Not in Electron

    try {
      const status = await window.electronAPI.checkOllamaStatus();

      if (status.needsInstall) {
        console.log('Ollama not installed - user can download from ollama.com');
        return;
      }

      if (!status.running) {
        // Try to auto-start Ollama silently
        console.log('Attempting to auto-start Ollama...');
        const result = await window.electronAPI.startOllama();

        if (result.success) {
          console.log('Ollama auto-started successfully');
          if (result.model) {
            console.log(`Ollama model ready: ${result.model}`);
          } else if (result.message) {
            console.log(result.message);
          }
        } else if (result.error) {
          console.log('Ollama auto-start failed:', result.error);
        }
      }
    } catch (error) {
      console.log('Ollama auto-start check failed:', error.message);
    }
  }

  setupAIEventListeners() {
    // Connect buttons
    document.querySelectorAll('.connect-btn').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        this.connectAIProvider(e.target.dataset.provider)
      );
    });

    // Toggle switches for all providers
    ['CHATGPT', 'CLAUDE', 'GEMINI', 'PERPLEXITY', 'OPEN_SOURCE'].forEach(
      (provider) => {
        const el =
          document.getElementById(`${provider.toLowerCase()}-enabled`) ||
          document.getElementById(`${provider.toLowerCase()}-enabled`);
        if (el) {
          el.addEventListener('change', (e) => {
            this.updateProviderEnabled(provider, e.target.checked);
          });
        }
      }
    );

    // Preference changes
    document
      .getElementById('default-provider')
      ?.addEventListener('change', (e) => {
        this.savePreference('defaultProvider', e.target.value);
      });
    document
      .getElementById('routing-strategy')
      ?.addEventListener('change', (e) => {
        this.savePreference('routingStrategy', e.target.value);
      });
    document
      .getElementById('free-tier-only')
      ?.addEventListener('change', (e) => {
        this.savePreference('freeTierOnly', e.target.checked);
      });
    document
      .getElementById('browser-automation')
      ?.addEventListener('change', (e) => {
        this.savePreference('browserAutomation', e.target.checked);
      });
  }

  async connectAIProvider(provider) {
    const btn = document.querySelector(
      `.connect-btn[data-provider="${provider}"]`
    );
    btn.textContent = 'Connecting...';
    btn.disabled = true;

    try {
      if (provider === 'OPEN_SOURCE' || provider === 'ollama') {
        const url =
          document.getElementById('ollama-url')?.value ||
          'http://localhost:11434';
        const model =
          document.getElementById('ollama-model')?.value || 'llama3';

        // Check Ollama status via Electron API (which can auto-start it)
        if (window.electronAPI) {
          const status = await window.electronAPI.checkOllamaStatus();

          if (status.needsInstall) {
            // Ollama not installed - prompt user
            const install = confirm(
              'Ollama is not installed. Would you like to download it?'
            );
            if (install) {
              await window.electronAPI.openOllamaDownload();
            }
            btn.textContent = 'Connect';
            btn.disabled = false;
            return;
          }

          if (!status.running) {
            // Ollama installed but not running - try to start it
            btn.textContent = 'Starting Ollama...';
            const result = await window.electronAPI.startOllama();

            if (!result.success) {
              console.error('Failed to start Ollama:', result.error);
              btn.textContent = 'Connect';
              btn.disabled = false;
              return;
            }

            // Check if model was pulled
            if (result.model) {
              console.log(`Ollama ready with model: ${result.model}`);
            } else if (result.message) {
              console.log(result.message);
              btn.textContent = 'Downloading model...';
              // Wait a bit and check again
              await new Promise((r) => setTimeout(r, 3000));
            }
          }
        }

        // Now try to connect
        const start = Date.now();
        const response = await fetch(`${url}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        });
        const latency = Date.now() - start;

        if (response.ok) {
          this.aiAccounts.OPEN_SOURCE = {
            connected: true,
            enabled: true,
            url,
            model,
            latency,
          };
          this.updateProviderUI('OPEN_SOURCE', true);
          this.updateAIStatus('OPEN_SOURCE', 'connected', latency);
          this.healthStatus[provider] = {
            isHealthy: true,
            latency,
            circuitState: 'CLOSED',
          };
        } else {
          throw new Error('Connection failed');
        }
      } else {
        const apiKey = document.getElementById(
          `${provider.toLowerCase()}-api-key`
        )?.value;
        if (!apiKey) {
          throw new Error('API key required');
        }

        // Validate the API key by making a test request
        const isValid = await this.validateProviderAPI(provider, apiKey);
        if (!isValid) {
          throw new Error('Invalid API key');
        }

        this.aiAccounts[provider] = {
          connected: true,
          enabled: true,
          apiKey,
          model: document.getElementById(`${provider.toLowerCase()}-model`)
            ?.value,
        };
        this.updateProviderUI(provider, true);
        this.healthStatus[provider] = {
          isHealthy: true,
          latency: 1500,
          circuitState: 'CLOSED',
        };
      }

      this.saveAIAccountsToStorage();
      this.updateHealthDashboard();
    } catch (error) {
      console.error(`Error connecting to ${provider}:`, error);
      this.healthStatus[provider] = {
        isHealthy: false,
        latency: 0,
        circuitState: 'OPEN',
      };
      this.updateProviderUI(provider, false);
    } finally {
      btn.disabled = false;
    }
  }

  async validateProviderAPI(provider, apiKey) {
    // Basic validation - in production this would make actual API calls
    if (provider === 'CHATGPT') {
      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(5000),
        });
        return res.ok;
      } catch {
        return false;
      }
    }
    if (provider === 'CLAUDE') {
      // Claude doesn't have a simple list endpoint, just assume valid if format looks right
      return apiKey.startsWith('sk-ant-');
    }
    if (provider === 'GEMINI') {
      return apiKey.startsWith('AIza');
    }
    if (provider === 'PERPLEXITY') {
      return apiKey.startsWith('pplx-');
    }
    return true;
  }

  updateProviderUI(provider, connected) {
    const card = document.querySelector(
      `.ai-account-card[data-provider="${provider}"]`
    );
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
        status.textContent =
          provider === 'ollama' ? 'Not Running' : 'Not Connected';
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
      this.updateHealthDashboard();
    }
  }

  async checkAIProvidersHealth() {
    const providers = [
      'CHATGPT',
      'CLAUDE',
      'GEMINI',
      'PERPLEXITY',
      'OPEN_SOURCE',
    ];
    let anyHealthy = false;

    for (const provider of providers) {
      const account = this.aiAccounts[provider];

      if (!account?.connected || !account?.enabled) {
        this.healthStatus[provider] = {
          isHealthy: false,
          latency: 0,
          circuitState: 'N/A',
        };
        continue;
      }

      try {
        let latency = 0;
        let isHealthy = false;

        if (provider === 'OPEN_SOURCE') {
          const start = Date.now();
          const response = await fetch(`${account.url}/api/tags`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
          });
          latency = Date.now() - start;
          isHealthy = response.ok;
        } else if (provider === 'CHATGPT') {
          const start = Date.now();
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${account.apiKey}` },
            signal: AbortSignal.timeout(5000),
          });
          latency = Date.now() - start;
          isHealthy = res.ok;
        } else {
          // For other providers, assume healthy if connected (would need real API validation)
          isHealthy = true;
          latency = 1500;
        }

        this.healthStatus[provider] = {
          isHealthy,
          latency,
          circuitState: isHealthy ? 'CLOSED' : 'OPEN',
        };

        if (isHealthy) anyHealthy = true;
      } catch (error) {
        this.healthStatus[provider] = {
          isHealthy: false,
          latency: 0,
          circuitState: 'OPEN',
        };
      }
    }

    this.updateHealthDashboard();
    this.updateAIStatus('overall', anyHealthy ? 'ready' : 'error');
  }

  startHealthMonitoring() {
    // Check health every 30 seconds
    setInterval(() => {
      this.checkAIProvidersHealth();
    }, 30000);
  }

  updateHealthDashboard() {
    const providers = [
      'CHATGPT',
      'CLAUDE',
      'GEMINI',
      'PERPLEXITY',
      'OPEN_SOURCE',
    ];

    providers.forEach((provider) => {
      const health = this.healthStatus[provider];
      const card = document.querySelector(
        `.health-card[data-provider="${provider}"]`
      );

      if (!card) return;

      const statusEl = card.querySelector('.health-status');
      const latencyEl = card.querySelector('.health-latency');
      const circuitEl = card.querySelector('.health-circuit');

      if (health) {
        statusEl.textContent = health.isHealthy ? 'Healthy' : 'Unavailable';
        statusEl.className = `health-status ${health.isHealthy ? 'healthy' : 'error'}`;

        latencyEl.textContent =
          health.latency > 0 ? `${health.latency}ms` : '-';

        circuitEl.textContent = health.circuitState;
        circuitEl.className = `health-circuit ${health.circuitState.toLowerCase()}`;
      } else {
        statusEl.textContent = 'Not Configured';
        statusEl.className = 'health-status';
        latencyEl.textContent = '-';
        circuitEl.textContent = '-';
        circuitEl.className = 'health-circuit';
      }
    });
  }

  updateAIStatus(provider, status, latency = null) {
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
        Object.keys(this.aiAccounts).forEach((provider) => {
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
          document.getElementById('default-provider').value =
            preferences.defaultProvider || 'auto';
        }
        if (document.getElementById('routing-strategy')) {
          document.getElementById('routing-strategy').value =
            preferences.routingStrategy || 'health-weighted';
        }
        if (document.getElementById('free-tier-only')) {
          document.getElementById('free-tier-only').checked =
            preferences.freeTierOnly || false;
        }
        if (document.getElementById('browser-automation')) {
          document.getElementById('browser-automation').checked =
            preferences.browserAutomation !== false;
        }
      }
    } catch (e) {
      console.error('Error loading AI accounts:', e);
    }
  }

  saveAIAccountsToStorage() {
    try {
      localStorage.setItem(
        'therev_ai_accounts',
        JSON.stringify(this.aiAccounts)
      );
    } catch (e) {
      console.error('Error saving AI accounts:', e);
    }
  }

  savePreference(key, value) {
    try {
      const prefs = JSON.parse(
        localStorage.getItem('therev_ai_preferences') || '{}'
      );
      prefs[key] = value;
      localStorage.setItem('therev_ai_preferences', JSON.stringify(prefs));
    } catch (e) {
      console.error('Error saving preference:', e);
    }
  }
}

// Initialize the app when DOM is loaded
let theRevApp;
document.addEventListener('DOMContentLoaded', () => {
  theRevApp = new TheRevApp();
  window.theRevApp = theRevApp;
});

// Global functions for onclick handlers
function closeLoginModal() {
  if (theRevApp) theRevApp.closeLoginModal();
}

function closeRegisterModal() {
  if (theRevApp) theRevApp.closeRegisterModal();
}

function showLoginModal() {
  if (theRevApp) theRevApp.showLoginModal();
}

function showRegisterModal() {
  if (theRevApp) theRevApp.showRegisterModal();
}

function closeForgotPasswordModal() {
  if (theRevApp) theRevApp.closeForgotPasswordModal();
}

function closeResetPasswordModal() {
  if (theRevApp) theRevApp.closeResetPasswordModal();
}
