// TheRev Desktop App - Frontend JavaScript (ES Module)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
} from '@pixiv/three-vrm-animation';

class TheRevApp {
  constructor() {
    console.log('[TheRevApp] Constructor called');
    this.currentSection = 'threads';
    this.avatarData = {};
    this.currentApprovalRequest = null;
    this.currentUser = null;
    this.jwtToken = null;
    this.currentNewsType = 'article';
    this.protectedSections = [
      'tasks',
      'analytics',
      'audit',
      'shards',
      'ai-settings',
    ];
    this.adminSections = ['tasks', 'analytics', 'audit', 'shards'];
    this._avatarMixer = null;
    this._avatarActions = {};
    this._currentAvatarAction = null;

    // Avatar animation settings
    this._avatarSettings = {
      enabled: true,
      cycleInterval: 30,
    };
    this._profileCycleTimer = null;
    this._profileCurrentIndex = 0;

    // Avatar scene cache
    this._avatarSceneReady = false;
    this._avatarAnimationsReady = false;
    this._avatarAnimatingPaused = false;

    // Voice control state
    this._voiceRecognition = null;
    this._isListening = false;
    this._voiceTranscript = '';

    // Tab cache for instant switching
    this._tabCache = {
      threads: { data: null, timestamp: 0 },
      news: { data: null, timestamp: 0, rawData: null },
      profile: { data: null, timestamp: 0 },
      avatar: { loaded: false, vrmDataUrl: null, fileName: null },
    };
    this._cacheTimeout = 5 * 60 * 1000; // 5 minutes

    this.init();
  }

  async init() {
    console.log('[TheRevApp] init() started');
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
    this.setupVoiceControl();

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
          // Check if token is expired
          try {
            const payload = JSON.parse(atob(auth.jwt.split('.')[1]));
            const isExpired = Date.now() >= payload.exp * 1000;

            if (isExpired) {
              console.log('[Auth] Token expired, clearing session');
              this.clearAuthSession();
              return;
            }
          } catch (e) {
            // Invalid token format, clear session
            console.log('[Auth] Invalid token, clearing session');
            this.clearAuthSession();
            return;
          }

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
                  profilePicUrl
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

  setupVoiceControl() {
    const voiceBtn = document.getElementById('voice-btn');
    if (!voiceBtn) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.log('[VoiceControl] Speech recognition not supported');
      voiceBtn.style.display = 'none';
      return;
    }

    this._voiceRecognition = new SpeechRecognition();
    this._voiceRecognition.continuous = true;
    this._voiceRecognition.interimResults = true;
    this._voiceRecognition.lang = 'en-US';

    voiceBtn.addEventListener('click', () => {
      if (this._isListening) {
        this.stopListening(true);
      } else {
        this.startListening();
      }
    });

    this._voiceRecognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const isFinal = result.isFinal;
      
      this._voiceTranscript = transcript;
      
      const transcriptEl = document.getElementById('voice-transcript');
      if (transcriptEl) {
        transcriptEl.textContent = `"${transcript}"`;
      }

      const input = document.getElementById('ai-command-input');
      if (input && isFinal && transcript.trim()) {
        input.value = transcript;
        this.stopListening(true);
        this.executeAICommand();
      }
    };

    this._voiceRecognition.onerror = (event) => {
      console.error('[VoiceControl] Error:', event.error);
      this.stopListening(false);
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access.');
      }
    };

    this._voiceRecognition.onend = () => {
      if (this._isListening) {
        try {
          this._voiceRecognition.start();
        } catch (e) {}
      }
    };

    console.log('[VoiceControl] Voice control initialized');
  }

  startListening() {
    if (!this._voiceRecognition || this._isListening) return;

    try {
      this._voiceRecognition.start();
      this._isListening = true;
      this._voiceTranscript = '';

      // Update UI
      const voiceBtn = document.getElementById('voice-btn');
      const voiceIndicator = document.getElementById('voice-indicator');
      const transcriptEl = document.getElementById('voice-transcript');
      
      if (voiceBtn) {
        voiceBtn.classList.add('listening');
        voiceBtn.textContent = '🔴';
      }
      if (voiceIndicator) {
        voiceIndicator.style.display = 'block';
      }
      if (transcriptEl) {
        transcriptEl.textContent = '';
      }

      console.log('[VoiceControl] Started listening');
    } catch (error) {
      console.error('[VoiceControl] Failed to start:', error);
    }
  }

  stopListening(clearTranscript = true) {
    if (!this._voiceRecognition) return;

    this._isListening = false;

    try {
      this._voiceRecognition.stop();
    } catch (e) {}

    const voiceBtn = document.getElementById('voice-btn');
    const voiceIndicator = document.getElementById('voice-indicator');
    const transcriptEl = document.getElementById('voice-transcript');
    
    if (voiceBtn) {
      voiceBtn.classList.remove('listening');
      voiceBtn.textContent = '🎤';
    }
    if (voiceIndicator) {
      voiceIndicator.style.display = 'none';
    }
    if (transcriptEl && !clearTranscript) {
      // Keep the transcript if we're stopping due to error
    } else if (transcriptEl) {
      transcriptEl.textContent = '';
    }

    console.log('[VoiceControl] Stopped listening');
  }

  speakText(text) {
    if (!window.speechSynthesis) {
      console.log('[VoiceControl] Speech synthesis not supported');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Try to find a good English voice
    const voices = speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural')) ||
                        voices.find(v => v.lang.startsWith('en'));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    window.speechSynthesis.speak(utterance);
  }

  setupEventListeners() {
    console.log('[setupEventListeners] Setting up all event listeners');
    // Use event delegation - attach to document for dynamically created elements

    // Navigation
    document.getElementById('threads-btn')?.addEventListener('click', () => {
      console.log('[Nav] Threads button clicked');
      this.switchSection('threads');
    });
    document.getElementById('news-btn')?.addEventListener('click', () => {
      console.log('[Nav] News button clicked');
      this.switchSection('news');
    });
    document.getElementById('profile-btn')?.addEventListener('click', () => {
      console.log('[Nav] Profile button clicked');
      this.switchSection('profile');
    });
    document.getElementById('browser-btn')?.addEventListener('click', () => {
      console.log('[Nav] Browser button clicked');
      this.switchSection('browser');
    });
    document.getElementById('avatar-btn')?.addEventListener('click', () => {
      console.log('[Nav] Avatar button clicked');
      this.switchSection('avatar');
    });

    // News tabs
    document.querySelectorAll('.news-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document
          .querySelectorAll('.news-tab')
          .forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentNewsType = tab.dataset.type;
        this.loadNews();
      });
    });

    // News refresh button
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
    document.getElementById('profile-btn')?.addEventListener('click', () => {
      console.log('[Nav] Profile button clicked');
      this.switchSection('profile');
    });
    document.getElementById('browser-btn')?.addEventListener('click', () => {
      console.log('[Nav] Browser button clicked');
      this.switchSection('browser');
    });

    // Use delegation for browser section elements (they may not exist yet)
    document.addEventListener('click', (e) => {
      const target = e.target;

      // Ask Rev button
      if (target.id === 'ai-command-btn' || target.closest('#ai-command-btn')) {
        this.executeAICommand();
      }
    });

    document.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && e.target.id === 'ai-command-input') {
        this.executeAICommand();
      }
    });

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

    // Animations panel button
    document.getElementById('animations-btn')?.addEventListener('click', () => {
      this.showAnimationsModal();
    });

    // Close animations panel when clicking outside
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('animations-panel');
      const btn = document.getElementById('animations-btn');
      if (panel && panel.classList.contains('active') && 
          !panel.contains(e.target) && !btn.contains(e.target)) {
        this.closeAnimationsModal();
      }
    });

    // Profile photo upload
    document
      .getElementById('upload-photo-btn')
      ?.addEventListener('click', () => {
        document.getElementById('profile-pic-input').click();
      });
    document
      .getElementById('profile-pic-input')
      ?.addEventListener('change', (e) => this.handleProfilePicUpload(e));

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

    // Register form - also handle via button click
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

    // Create thread form
    document
      .getElementById('create-thread-form')
      ?.addEventListener('submit', (e) => this.submitCreateThread(e));

    // Create post form
    document
      .getElementById('create-post-form')
      ?.addEventListener('submit', (e) => this.submitCreatePost(e));

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

      // Avatar reaction listeners (from main process)
      if (window.electronAPI.onAvatarReact) {
        window.electronAPI.onAvatarReact((type, message) => {
          this.avatarReact(type, message);
        });
      }
      if (window.electronAPI.onAvatarShowBubble) {
        window.electronAPI.onAvatarShowBubble((message, duration) => {
          this.showSpeechBubble(message, duration);
        });
      }
      if (window.electronAPI.onAvatarShowEmotion) {
        window.electronAPI.onAvatarShowEmotion((emotion) => {
          this.setAvatarEmotion(emotion);
        });
      }

      // Browser window listeners
      if (window.electronAPI.onBrowserWindowOpened) {
        window.electronAPI.onBrowserWindowOpened(() => {
          this._browserWindowOpen = true;
          // Pause avatar when browser window opens
          if (this._avatarSceneReady) {
            this._avatarAnimatingPaused = true;
            if (this._avatarRenderer?.domElement) {
              this._avatarRenderer.domElement.style.display = 'none';
            }
            console.log('[Avatar] Paused - browser window opened');
          }
        });
      }
      if (window.electronAPI.onBrowserWindowClosed) {
        window.electronAPI.onBrowserWindowClosed(() => {
          this._browserWindowOpen = false;
          // Resume avatar when browser window closes (if on avatar or profile section)
          if ((this.currentSection === 'avatar' || this.currentSection === 'profile') && this._avatarSceneReady) {
            this._avatarAnimatingPaused = false;
            if (this._avatarRenderer?.domElement) {
              this._avatarRenderer.domElement.style.display = 'block';
            }
            console.log('[Avatar] Resumed - browser window closed');
          }
        });
      }
    }
  }

  switchSection(section, forceRefresh = false) {
    console.log('[switchSection] Switching to:', section, 'forceRefresh:', forceRefresh);

    // Update navigation
    document
      .querySelectorAll('.nav-btn')
      .forEach((btn) => btn.classList.remove('active'));

    const btn = document.getElementById(`${section}-btn`);
    if (btn) btn.classList.add('active');

    // Update content sections
    document
      .querySelectorAll('.content-section')
      .forEach((sec) => sec.classList.remove('active'));

    const sectionEl = document.getElementById(`${section}-section`);
    if (sectionEl) sectionEl.classList.add('active');
    else console.log('[switchSection] Section not found!');

    this.currentSection = section;

    // Resume avatar for avatar and profile sections, pause for others
    if ((section === 'avatar' || section === 'profile') && this._avatarSceneReady && !this._browserWindowOpen) {
      this._avatarAnimatingPaused = false;
      if (this._avatarRenderer?.domElement) {
        this._avatarRenderer.domElement.style.display = 'block';
      }
      console.log('[Avatar] Resumed for', section);
    } else {
      this._avatarAnimatingPaused = true;
      if (this._avatarRenderer?.domElement) {
        this._avatarRenderer.domElement.style.display = 'none';
      }
    }

    // Check cache first (unless force refresh)
    const cache = this._tabCache[section];
    const isCacheValid = cache?.data && (Date.now() - cache.timestamp < this._cacheTimeout);

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
        if (forceRefresh || !isCacheValid) {
          this.loadNews(false);
        } else if (cache?.data) {
          this.loadNews(true);
        }
        break;
      case 'profile':
        if (forceRefresh || !isCacheValid) {
          this.loadProfile();
        }
        break;
      case 'threads':
        if (forceRefresh || !isCacheValid) {
          this.loadThreads(false);
        } else if (cache?.data) {
          this.loadThreads(true);
        }
        break;
      case 'browser':
        break;
      case 'ai-settings':
        break;
      case 'avatar':
        this.loadAvatar();
        break;
    }
  }

  async loadThreads(useCache = false) {
    console.log('[Threads] loadThreads called, useCache:', useCache);

    if (!this.jwtToken || !this.currentUser) {
      console.log('[Threads] Not logged in, skipping load');
      alert('Please log in to view threads');
      return;
    }

    const container = document.querySelector('.threads-container');
    
    // Check cache first
    if (useCache && this._tabCache.threads.data) {
      if (container) container.innerHTML = this._tabCache.threads.data;
      this.bindThreadsClickHandlers();
      return;
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
      };

      // Only add auth if we have a token
      if (this.jwtToken) {
        headers['Authorization'] = `Bearer ${this.jwtToken}`;
      }

      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `
            query {
              listThreads {
                id
                title
                content
                createdAt
                author {
                  id
                  userName
                }
                posts {
                  id
                  content
                  type
                  createdAt
                  metadata
                  author {
                    id
                    userName
                  }
                  replies {
                    id
                    content
                    type
                    createdAt
                    metadata
                    author {
                      id
                      userName
                    }
                  }
                }
              }
            }
          `,
        }),
      });

      const result = await response.json();
      console.log('[Threads] GraphQL result:', result);

      if (result.errors) {
        console.error('[Threads] GraphQL errors:', result.errors);
      }

      const threads = result.data?.listThreads || [];

      // Render threads with posts
      const container = document.querySelector('.threads-container');
      if (container) {
        if (threads.length === 0) {
          container.innerHTML =
            '<div class="empty-state">No threads yet. Create the first one!</div>';
        } else {
          container.innerHTML = threads
            .map((thread) => {
              // Check for URLs in thread content AND first post content
              let urlLink = '';
              const contentToSearch =
                thread.content + ' ' + (thread.posts?.[0]?.content || '');
              const urlMatch = contentToSearch.match(/(https?:\/\/[^\s]+)/);
              if (urlMatch && urlMatch[1]) {
                urlLink = `<span class="url-link clickable" data-url="${urlMatch[1]}">🔗 Open Link</span>`;
              }

              return `
            <div class="thread-card" onclick="theRevApp.openThread('${thread.id}')">
              <div class="thread-header">
                <h3>${thread.title}</h3>
                ${thread.isPinned ? '<span class="pinned-indicator">📌 Pinned</span>' : ''}
              </div>
              <div class="thread-meta">
                <span class="author">by @${thread.author?.userName || 'Unknown'}</span>
                <span class="timestamp">${new Date(thread.createdAt).toLocaleDateString()}</span>
                ${urlLink}
              </div>
              <p class="thread-preview">${thread.content || ''}</p>
              <div class="thread-posts">
                ${
                  thread.posts
                    ? thread.posts
                        .map((post) => {
                          const postType = post.type || 'TEXT';
                          const isVideo = postType === 'VIDEO';
                          const isImage = postType === 'IMAGE';
                          const replyCount = post.replies
                            ? post.replies.length
                            : 0;
                          let mediaContent = '';
                          // Check for YouTube URL in post content
                          const postContentToSearch = post.content || '';
                          const ytMatch = postContentToSearch.match(
                            /(https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[^\s]+)/
                          );
                          const ytShortMatch = postContentToSearch.match(
                            /(https?:\/\/youtu\.be\/[^\s]+)/
                          );
                          const videoUrl = ytMatch
                            ? ytMatch[1]
                            : ytShortMatch
                              ? ytShortMatch[1]
                              : null;

                          if (isVideo && post.metadata?.thumbnailUrl) {
                            const openUrl =
                              videoUrl || post.metadata.thumbnailUrl;
                            mediaContent = `<div class="post-media video clickable" data-url="${openUrl}" style="cursor:pointer"><img src="${post.metadata.thumbnailUrl}" alt="Video thumbnail" style="max-width:200px;border-radius:8px;margin:8px 0;" /><span class="media-badge">🎬 Video - Click to Open</span></div>`;
                          } else if (isImage && post.metadata?.thumbnailUrl) {
                            mediaContent = `<div class="post-media image"><img src="${post.metadata.thumbnailUrl}" alt="Post image" style="max-width:200px;border-radius:8px;margin:8px 0;" /></div>`;
                          }

                          // Render nested replies
                          let repliesHtml = '';
                          if (post.replies && post.replies.length > 0) {
                            repliesHtml =
                              '<div class="nested-replies" style="margin-top:10px;padding-left:15px;border-left:2px solid #00a8ff;">';
                            post.replies.forEach((reply) => {
                              repliesHtml += `
                                <div class="nested-reply" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);">
                                  <div class="post-author" style="font-size:11px;">@${reply.author?.userName || 'Unknown'} <span class="post-date">${new Date(reply.createdAt).toLocaleString()}</span></div>
                                  <div class="post-text" style="font-size:12px;margin-top:4px;">${reply.content || ''}</div>
                                </div>
                              `;
                            });
                            repliesHtml += '</div>';
                          }

                          return `
                  <div class="post-item">
                    <div class="post-author">@${post.author?.userName || 'Unknown'}</div>
                    <div class="post-text">${post.content || ''}</div>
                    ${mediaContent}
                    <div class="post-footer">
                      <span class="post-date">${new Date(post.createdAt).toLocaleString()}</span>
                      ${replyCount > 0 ? `<span class="reply-count">💬 ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}</span>` : ''}
                    </div>
                    ${repliesHtml}
                  </div>
                `;
                        })
                        .join('')
                    : ''
                }
              </div>
            </div>
          `;
            })
            .join('');

          // Add click handlers for URL links and videos in threads
          container
            .querySelectorAll(
              '.url-link.clickable, .post-media.video.clickable'
            )
            .forEach((el) => {
              el.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = el.dataset.url;
                if (url) theRevApp.showOpenModeModal(url, '', 'Link');
              });
            });
        }
        
        // Save to cache
        this._tabCache.threads = {
          data: container?.innerHTML || '',
          timestamp: Date.now()
        };
      }
    } catch (error) {
      console.error('Error loading threads:', error);
    }
  }

  bindThreadsClickHandlers() {
    const container = document.querySelector('.threads-container');
    if (!container) return;
    
    container.querySelectorAll('.url-link.clickable, .post-media.video.clickable').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = el.dataset.url;
        if (url) this.showOpenModeModal(url, '', 'Link');
      });
    });
  }

  async loadProfile() {
    // Don't try to load if not logged in
    if (!this.currentUser) {
      console.log('[Profile] No current user, cannot load profile');
      return;
    }

    // Update profile info from currentUser
    const usernameEl = document.getElementById('username');
    const profileAvatarEl = document.getElementById('profile-avatar-img');
    const profileBioEl = document.getElementById('profile-bio');
    const profileIdeologyEl = document.getElementById('profile-ideology');
    const profileJoinedEl = document.getElementById('profile-joined');

    if (this.currentUser && usernameEl) {
      usernameEl.textContent = this.currentUser.userName;
    }

    // Update bio
    if (profileBioEl && this.currentUser?.bio) {
      profileBioEl.textContent = this.currentUser.bio;
    } else if (profileBioEl) {
      profileBioEl.textContent =
        'Revolutionary thinker and political enthusiast';
    }

    // Update ideology
    if (profileIdeologyEl && this.currentUser?.ideology) {
      profileIdeologyEl.textContent = this.currentUser.ideology;
    } else if (profileIdeologyEl) {
      profileIdeologyEl.textContent = 'Independent';
    }

    // Update join date
    if (profileJoinedEl && this.currentUser?.createdAt) {
      const joinDate = new Date(
        this.currentUser.createdAt
      ).toLocaleDateString();
      profileJoinedEl.textContent = `Joined: ${joinDate}`;
    }

    // Update profile pic if user has one
    if (this.currentUser?.profilePicUrl && profileAvatarEl) {
      profileAvatarEl.src =
        'http://localhost:4000' + this.currentUser.profilePicUrl;
    }

    // Load avatar if user has one saved locally (use cache if available)
    if (window.electronAPI) {
      // Use cached VRM if available
      if (this._tabCache.avatar.loaded && this._tabCache.avatar.vrmDataUrl) {
        this._savedVrmDataUrl = this._tabCache.avatar.vrmDataUrl;
        this.renderAvatar3D(this._tabCache.avatar.vrmDataUrl, 'profile-avatar-3d-container');
        
        const profilePlaceholder = document.getElementById('profile-avatar-placeholder');
        if (profilePlaceholder) {
          profilePlaceholder.innerHTML = '';
        }
      } else {
        // Load from disk if not cached
        const savedAvatar = await window.electronAPI.getAvatarData();
        if (savedAvatar && savedAvatar.fileName) {
          const vrmResult = await window.electronAPI.loadVrmFile(savedAvatar.fileName);
          if (vrmResult.success && vrmResult.dataUrl) {
            // Cache it
            this._tabCache.avatar = {
              loaded: true,
              vrmDataUrl: vrmResult.dataUrl,
              fileName: savedAvatar.fileName
            };
            
            this._savedVrmDataUrl = vrmResult.dataUrl;
            this.renderAvatar3D(vrmResult.dataUrl, 'profile-avatar-3d-container');
            
            const profilePlaceholder = document.getElementById('profile-avatar-placeholder');
            if (profilePlaceholder) {
              profilePlaceholder.innerHTML = '';
            }
          }
        }
      }
    }

    // Load participated threads and stats
    await this.loadParticipatedThreads();
    await this.loadProfileStats();
  }

  async loadProfileStats() {
    // Don't try to load if not logged in
    if (!this.jwtToken || !this.currentUser) {
      console.log('[Profile] Not logged in, skipping stats load');
      return;
    }

    try {
      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.jwtToken}`,
        },
        body: JSON.stringify({
          query: `
            query {
              myParticipatedThreads {
                id
                posts {
                  id
                }
              }
            }
          `,
        }),
      });

      const result = await response.json();
      const threads = result.data?.myParticipatedThreads || [];

      // Calculate stats
      const threadCount = threads.length;
      const postCount = threads.reduce(
        (acc, t) => acc + (t.posts?.length || 0),
        0
      );

      // Update stats display with IDs
      const threadsEl = document.getElementById('stat-threads');
      const postsEl = document.getElementById('stat-posts');
      if (threadsEl) threadsEl.textContent = threadCount;
      if (postsEl) postsEl.textContent = postCount;
    } catch (error) {
      console.error('Error loading profile stats:', error);
    }
  }

  // Store 3D viewer instance
  _avatarViewer = null;

  async loadAvatar() {
    console.log('[Avatar] Loading avatar section');

    // Check if we already have VRM loaded in cache
    if (this._tabCache.avatar.loaded && this._tabCache.avatar.vrmDataUrl) {
      console.log('[Avatar] Using cached VRM');
      this._savedVrmDataUrl = this._tabCache.avatar.vrmDataUrl;
      this.renderAvatar3D(this._tabCache.avatar.vrmDataUrl);
      
      // Update placeholder
      const placeholder = document.getElementById('avatar-placeholder');
      if (placeholder && this._tabCache.avatar.fileName) {
        placeholder.innerHTML = `
          <div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); padding: 8px 16px; border-radius: 20px; color: #22c55e; font-size: 12px;">
            ${this._tabCache.avatar.fileName}
          </div>
        `;
      }
      
      // Skip reloading, just setup UI elements
      this.setupAvatarUI();
      return;
    }

    // Load saved avatar data and render in 3D
    if (window.electronAPI) {
      const savedAvatar = await window.electronAPI.getAvatarData();
      console.log('[Avatar] Loaded saved avatar:', savedAvatar);

      if (savedAvatar && savedAvatar.fileName) {
        // Load VRM from disk
        const vrmResult = await window.electronAPI.loadVrmFile(
          savedAvatar.fileName
        );

        if (vrmResult.success && vrmResult.dataUrl) {
          console.log('[Avatar] VRM loaded from disk');

          // Cache the VRM data
          this._tabCache.avatar = {
            loaded: true,
            vrmDataUrl: vrmResult.dataUrl,
            fileName: savedAvatar.fileName
          };

          // Store VRM data URL for browser avatar
          this._savedVrmDataUrl = vrmResult.dataUrl;

          // Render saved avatar in 3D
          this.renderAvatar3D(vrmResult.dataUrl);

          // Update placeholder to show filename
          const placeholder = document.getElementById('avatar-placeholder');
          if (placeholder) {
            placeholder.innerHTML = `
              <div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); padding: 8px 16px; border-radius: 20px; color: #22c55e; font-size: 12px;">
                ${savedAvatar.fileName}
              </div>
            `;
          }
        }
      }
    }

    this.setupAvatarUI();
  }

  setupAvatarUI() {
    // Check if VRoid Studio is installed
    const vroidStatus = document.getElementById('vroid-status');
    if (window.electronAPI) {
      window.electronAPI.checkVroidStudio().then(vroidInfo => {
        console.log('[Avatar] VRoid Studio status:', vroidInfo);

        if (vroidStatus) {
          if (vroidInfo.installed) {
            vroidStatus.innerHTML =
              '<span class="status-installed">✓ VRoid Studio is installed and ready</span>';
          } else {
            vroidStatus.innerHTML =
              '<span class="status-not-installed">VRoid Studio not found - click below to download</span>';
          }
        }
      });
    }

    // Setup VRoid Studio launch button
    const launchVroidBtn = document.getElementById('launch-vroid-btn');
    if (launchVroidBtn && window.electronAPI) {
      launchVroidBtn.onclick = async () => {
        console.log('[Avatar] Launching VRoid Studio');
        await window.electronAPI.launchVroidStudio();
      };
    }

    // Setup VRM upload
    const uploadVrmBtn = document.getElementById('upload-vrm-btn');
    const vrmUpload = document.getElementById('vrm-upload');

    if (uploadVrmBtn && vrmUpload) {
      uploadVrmBtn.onclick = () => vrmUpload.click();

      vrmUpload.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (file) {
          console.log('[Avatar] VRM file selected:', file.name);
          await this.handleVRMUpload(file);
        }
      };
    }

    // Setup open export folder button
    const openExportBtn = document.getElementById('open-export-folder-btn');
    if (openExportBtn && window.electronAPI) {
      openExportBtn.onclick = async () => {
        console.log('[Avatar] Opening VRoid export folder');
        await window.electronAPI.openVroidExportFolder();
      };
    }

    // Setup animation buttons
    this.setupAnimationButtons();
    this.setupAvatarModeControls();
    this.startProfileAnimationCycle();

    console.log('[Avatar] Avatar section loaded');
  }

  setupAnimationButtons() {
    console.log('[Avatar] Setting up animation buttons');
    const container = document.getElementById('animation-list');
    if (!container) {
      console.log('[Avatar] Animation list container not found');
      return;
    }

    // Animation names will be populated after animations are loaded
    this._animationNames = [];
    this._currentAnimationIndex = -1;

    // Initial render (will be updated after animations load)
    this.renderAnimationButtons();
  }

  renderAnimationButtons() {
    const container = document.getElementById('animation-grid') || document.getElementById('animation-list');
    if (!container) return;

    container.innerHTML = '';

    // Always add Idle button first
    const idleBtn = document.createElement('button');
    idleBtn.id = 'anim-idle';
    idleBtn.className =
      'anim-btn' + (this._currentAnimationIndex === -1 ? ' active' : '');
    idleBtn.innerHTML = '<span class="anim-icon">🧍</span><span>Idle</span>';
    idleBtn.onclick = () => {
      this.setAvatarEmotion('idle');
    };
    container.appendChild(idleBtn);

    // Add loaded animations
    this._animationNames.forEach((name, index) => {
      const btn = document.createElement('button');
      btn.id = `anim-${index}`;
      btn.className =
        'anim-btn' + (this._currentAnimationIndex === index ? ' active' : '');

      btn.innerHTML = `
        <span class="anim-icon">🎬</span>
        <span>${name.substring(0, 12)}${name.length > 12 ? '...' : ''}</span>
      `;
      btn.title = name;
      btn.onclick = () => {
        this.playAnimationByIndex(index);
      };
      container.appendChild(btn);
    });
  }

  setupAvatarModeControls() {
    // Animations enabled checkbox
    const animationsEnabled = document.getElementById('animations-enabled');
    if (animationsEnabled) {
      animationsEnabled.checked = this._avatarSettings.enabled;
      animationsEnabled.onchange = () => {
        this._avatarSettings.enabled = animationsEnabled.checked;
        this.saveAvatarSettings();
        if (this._avatarSettings.enabled) {
          this.startProfileAnimationCycle();
        } else {
          this.stopProfileAnimationCycle();
        }
      };
    }

    // Cycle interval slider
    const cycleSlider = document.getElementById('profile-cycle-interval');
    const cycleValue = document.getElementById('cycle-interval-value');
    if (cycleSlider && cycleValue) {
      cycleSlider.value = this._avatarSettings.cycleInterval;
      cycleValue.textContent = this._avatarSettings.cycleInterval + 's';

      cycleSlider.oninput = () => {
        cycleValue.textContent = cycleSlider.value + 's';
      };
      cycleSlider.onchange = () => {
        this._avatarSettings.cycleInterval = parseInt(cycleSlider.value);
        this.saveAvatarSettings();
        if (this._avatarSettings.enabled) {
          this.startProfileAnimationCycle();
        }
      };
    }

    this.loadAvatarSettings();
  }

  loadAvatarSettings() {
    try {
      const saved = localStorage.getItem('avatarSettings');
      if (saved) {
        const settings = JSON.parse(saved);
        this._avatarSettings = { ...this._avatarSettings, ...settings };
      }
    } catch (e) {
      console.log('[Avatar] Could not load settings');
    }
  }

  saveAvatarSettings() {
    try {
      localStorage.setItem(
        'avatarSettings',
        JSON.stringify(this._avatarSettings)
      );
    } catch (e) {
      console.log('[Avatar] Could not save settings');
    }
  }

  startProfileAnimationCycle() {
    this.stopProfileAnimationCycle();

    if (!this._avatarSettings.enabled || !this._animationNames || this._animationNames.length === 0) {
      return;
    }

    const playNext = () => {
      if (!this._avatarSettings.enabled) return;

      const animation =
        this._animationNames[this._profileCurrentIndex % this._animationNames.length];
      console.log('[Profile Avatar] Cycling to:', animation);

      if (this._avatarActions[animation]) {
        if (this._currentAvatarAction) {
          this._currentAvatarAction.fadeOut(0.5);
        }
        this._avatarActions[animation].reset().fadeIn(0.5).play();
        this._currentAvatarAction = this._avatarActions[animation];
      }

      this._profileCurrentIndex++;

      // Schedule next animation
      this._profileCycleTimer = setTimeout(
        playNext,
        this._avatarSettings.cycleInterval * 1000
      );
    };

    // Start cycling
    this._profileCycleTimer = setTimeout(
      playNext,
      this._avatarSettings.cycleInterval * 1000
    );

    console.log('[Profile Avatar] Started animation cycle');
  }

  stopProfileAnimationCycle() {
    if (this._profileCycleTimer) {
      clearTimeout(this._profileCycleTimer);
      this._profileCycleTimer = null;
    }
  }

  playRandomChatAnimation() {
    if (!this._avatarSettings.enabled || !this._animationNames || this._animationNames.length === 0) {
      return;
    }

    const randomIndex = Math.floor(Math.random() * this._animationNames.length);
    const animation = this._animationNames[randomIndex];

    console.log('[Chat Avatar] Playing random animation:', animation);

    if (this._avatarActions[animation]) {
      if (this._currentAvatarAction) {
        this._currentAvatarAction.fadeOut(0.3);
      }
      this._avatarActions[animation].reset().fadeIn(0.3).play();
      this._currentAvatarAction = this._avatarActions[animation];
    }
  }

  playAnimationByIndex(index) {
    if (index < 0 || index >= this._animationNames.length) return;

    console.log(
      '[Avatar] Playing animation',
      index + 1,
      ':',
      this._animationNames[index]
    );

    // Update UI
    document
      .querySelectorAll('.anim-btn')
      .forEach((b) => b.classList.remove('active'));
    const btn = document.getElementById(`anim-${index}`);
    if (btn) btn.classList.add('active');

    const idleBtn = document.getElementById('anim-idle');
    if (idleBtn) idleBtn.classList.remove('active');

    this._currentAnimationIndex = index;
    const emotionName = this._animationNames[index];

    // Update display
    const emotionDisplay = document.getElementById('emotion-name');
    if (emotionDisplay) {
      emotionDisplay.textContent = `Animation ${index + 1}`;
    }

    // Play the animation
    if (this._avatarMixer && this._avatarActions[emotionName]) {
      if (this._currentAvatarAction) {
        this._currentAvatarAction.fadeOut(0.3);
      }
      const action = this._avatarActions[emotionName];
      action.reset().fadeIn(0.3).play();
      this._currentAvatarAction = action;
    }
  }

  async renderAvatar3D(vrmUrl, targetContainer = 'avatar-3d-container') {
    const container = document.getElementById(targetContainer);
    if (!container) {
      console.log('[Avatar 3D] Container not found:', targetContainer);
      return;
    }

    // Check if scene already exists AND animations are loaded - if so, just show it
    if (this._avatarSceneReady && this._avatarAnimationsReady && 
        this._avatarRenderer && this._avatarRenderer.domElement && 
        Object.keys(this._avatarActions).length > 0) {
      console.log('[Avatar 3D] Using cached scene, animations loaded:', Object.keys(this._avatarActions).length);
      
      // Move renderer to new container if different
      if (container !== this._avatarRenderer.domElement.parentElement) {
        container.innerHTML = '';
        container.appendChild(this._avatarRenderer.domElement);
      }
      
      // Make sure renderer is visible
      this._avatarRenderer.domElement.style.display = 'block';
      
      // Ensure an animation is playing
      if (!this._currentAvatarAction && this._avatarActions['Standard Idle']) {
        this._avatarActions['Standard Idle'].play();
        this._currentAvatarAction = this._avatarActions['Standard Idle'];
      }
      
      // Render animation buttons
      this.renderAnimationButtons();
      
      // Unpause animation
      this._avatarAnimatingPaused = false;
      
      return;
    }

    // Store references for zoom controls
    this._avatarScene = null;
    this._avatarCamera = null;
    this._avatarRenderer = null;
    this._avatarMixer = null;
    this._avatarModel = null;
    this._avatarSceneReady = false;
    this._avatarAnimationsReady = false;
    this._avatarZoom = 3.5;
    this._avatarClock = new THREE.Clock();

    container.innerHTML =
      '<div class="avatar-placeholder-large"><span>Loading avatar...</span></div>';
    console.log('[Avatar 3D] Starting render, URL:', vrmUrl);

    if (typeof THREE === 'undefined') {
      container.innerHTML =
        '<div class="avatar-placeholder-large"><span>Three.js not loaded</span></div>';
      return;
    }

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    this._avatarScene = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1.0, this._avatarZoom);
    camera.lookAt(0, 0.8, 0);
    this._avatarCamera = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    this._avatarRenderer = renderer;

    // Better lighting setup
    const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
    fillLight.position.set(-3, 2, -4);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xff8844, 0.3);
    rimLight.position.set(0, 3, -5);
    scene.add(rimLight);

    // Floor with grid
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 64),
      new THREE.MeshStandardMaterial({
        color: 0x2a2a3a,
        metalness: 0.3,
        roughness: 0.7,
        transparent: true,
        opacity: 0.8,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid helper
    const gridHelper = new THREE.GridHelper(4, 20, 0x444466, 0x333344);
    gridHelper.position.y = 0.001;
    scene.add(gridHelper);

    // Setup zoom controls
    this._setupAvatarZoomControls(container, camera, scene, renderer);

    // Use GLTFLoader with VRMLoaderPlugin for proper VRM humanoid pose handling
    console.log('[Avatar 3D] Using GLTFLoader with VRMLoaderPlugin');
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    this._loadWithVRM(loader, vrmUrl, scene, container, camera, renderer);
  }

  // Render a smaller version of the avatar for the browser section
  async renderBrowserAvatar(vrmUrl) {
    const browserCanvas = document.getElementById('browser-avatar-canvas');
    const fallback = document.getElementById('browser-avatar-fallback');

    console.log('[Browser Avatar] Starting render');

    // If no vrmUrl, show fallback "R" logo
    if (!vrmUrl) {
      console.log('[Browser Avatar] No VRM URL, showing fallback');
      if (fallback) fallback.style.display = 'flex';
      if (browserCanvas) browserCanvas.style.display = 'none';
      return;
    }

    if (!browserCanvas) {
      console.log('[Browser Avatar] Canvas not found!');
      return;
    }

    // Show fallback while loading
    if (fallback) fallback.style.display = 'none';
    if (browserCanvas) browserCanvas.style.display = 'block';

    try {
      // Check if Three.js is loaded
      if (typeof THREE === 'undefined') {
        console.log('[Browser Avatar] Three.js not loaded');
        if (fallback) fallback.style.display = 'flex';
        if (browserCanvas) browserCanvas.style.display = 'none';
        return;
      }

      // Create scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e);

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(0, 1.0, 3.5);
      camera.lookAt(0, 0.8, 0);

      const renderer = new THREE.WebGLRenderer({
        canvas: browserCanvas,
        antialias: true,
        alpha: true,
      });

      renderer.setSize(50, 50);
      renderer.setPixelRatio(1);

      // Lighting
      const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
      scene.add(ambientLight);
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
      keyLight.position.set(3, 5, 4);
      scene.add(keyLight);

      // Store for animation
      this._browserAvatarScene = scene;
      this._browserAvatarCamera = camera;
      this._browserAvatarRenderer = renderer;

      console.log('[Browser Avatar] Loading VRM...');

      // Load VRM with promise
      await new Promise((resolve) => {
        if (typeof THREE.VRMLoader !== 'undefined') {
          const loader = new THREE.VRMLoader();
          loader.load(
            vrmUrl,
            (vrm) => {
              console.log('[Browser Avatar] VRM loaded with VRMLoader');
              scene.add(vrm.scene);
              vrm.scene.rotation.y = 0.3;
              this._browserAvatarAnimate();
              resolve();
            },
            undefined,
            () => {
              // Fallback to GLTFLoader
              const gltfLoader = new THREE.GLTFLoader();
              gltfLoader.load(
                vrmUrl,
                (result) => {
                  const model = result.scene || result;
                  scene.add(model);
                  model.rotation.y = 0.3;
                  this._browserAvatarAnimate();
                  resolve();
                },
                undefined,
                () => {
                  console.log('[Browser Avatar] GLTFLoader failed');
                  if (fallback) fallback.style.display = 'flex';
                  if (browserCanvas) browserCanvas.style.display = 'none';
                  resolve();
                }
              );
            }
          );
        } else if (typeof THREE.GLTFLoader !== 'undefined') {
          const loader = new THREE.GLTFLoader();
          loader.load(
            vrmUrl,
            (result) => {
              const model = result.scene || result;
              scene.add(model);
              model.rotation.y = 0.3;
              this._browserAvatarAnimate();
              resolve();
            },
            undefined,
            () => {
              if (fallback) fallback.style.display = 'flex';
              if (browserCanvas) browserCanvas.style.display = 'none';
              resolve();
            }
          );
        } else {
          if (fallback) fallback.style.display = 'flex';
          if (browserCanvas) browserCanvas.style.display = 'none';
          resolve();
        }
      });
    } catch (error) {
      console.error('[Browser Avatar] Error:', error);
      if (fallback) fallback.style.display = 'flex';
      if (browserCanvas) browserCanvas.style.display = 'none';
    }
  }

  // Animation loop for browser avatar
  _browserAvatarAnimate() {
    if (!this._browserAvatarRenderer) return;

    const animate = () => {
      if (!document.getElementById('browser-avatar-canvas')) return;

      const delta = this._browserAvatarClock.getDelta();

      // Update mixer if exists
      if (this._browserAvatarMixer) {
        this._browserAvatarMixer.update(delta);
      }

      // Subtle rotation
      if (this._browserAvatarScene) {
        this._browserAvatarCurrentRotY +=
          (this._browserAvatarTargetRotY - this._browserAvatarCurrentRotY) *
          0.02;
        this._browserAvatarScene.rotation.y =
          this._browserAvatarCurrentRotY + 0.3;
      }

      this._browserAvatarRenderer.render(
        this._browserAvatarScene,
        this._browserAvatarCamera
      );
      requestAnimationFrame(animate);
    };
    animate();
  }

  async _loadAvatarAnimations(vrm, mixer) {
    const basePath =
      window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

    // Categorize animations - loopable ones vs one-shot
    const loopableAnimations = {
      'Standard Idle': 'StandardIdle.vrma',
      'Offensive Idle': 'OffensiveIdle.vrma',
      Bored: 'Bored.vrma',
      'Idle Dance': 'idle.vrma',
      Walk: 'Walk.vrma',
      Jogging: 'Jogging.vrma',
    };

    const oneShotAnimations = {
      Stretch: 'stretch.vrma',
      'V Sign': 'v_sign.vrma',
      Spin: 'spin.vrma',
      Shoot: 'shoot.vrma',
      'Model Pose': 'model_pose.vrma',
      Wave: 'wave.vrma',
      'Bling Dance': 'bling_dance.vrma',
      'Cat Dance': 'cat_dance.vrma',
      'Devil Dance': 'devil_dance.vrma',
      'Heaven/Hell': 'heaven_hell.vrma',
      Capoeira: 'Capoeira.vrma',
      Rumba: 'Rumba.vrma',
      Death: 'Death.vrma',
      Taunt: 'Taunt.vrma',
      Slam: 'Slam.vrma',
      'Baseball Hit': 'BaseballHit.vrma',
      'Sit Yell': 'SitYell.vrma',
      'Change Dir': 'ChangeDir.vrma',
      Rummaging: 'Rummaging.vrma',
    };

    console.log('[Avatar] Loading animations from:', basePath + 'animations/');

    const loader = new GLTFLoader();
    loader.crossOrigin = 'anonymous';

    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    // Initialize animation names array
    this._animationNames = [];

    // Load loopable animations first
    for (const [name, filename] of Object.entries(loopableAnimations)) {
      const url = basePath + 'animations/' + filename;
      try {
        console.log(`[Avatar] Loading (loop): ${name}`);

        const gltf = await loader.loadAsync(url);
        const vrmAnimations = gltf.userData.vrmAnimations;

        if (!vrmAnimations || vrmAnimations.length === 0) {
          console.log(`[Avatar] ✗ Not found: ${filename}`);
          continue;
        }

        const vrmAnim = vrmAnimations[0];
        const clip = createVRMAnimationClip(vrmAnim, vrm);
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat);

        this._avatarActions[name] = action;
        this._animationNames.push(name);
        console.log(`[Avatar] ✓ ${name}`);
      } catch (e) {
        console.log(`[Avatar] ✗ ${name}: ${e.message}`);
      }
    }

    // Load one-shot animations
    for (const [name, filename] of Object.entries(oneShotAnimations)) {
      const url = basePath + 'animations/' + filename;
      try {
        console.log(`[Avatar] Loading (once): ${name}`);

        const gltf = await loader.loadAsync(url);
        const vrmAnimations = gltf.userData.vrmAnimations;

        if (!vrmAnimations || vrmAnimations.length === 0) {
          console.log(`[Avatar] ✗ Not found: ${filename}`);
          continue;
        }

        const vrmAnim = vrmAnimations[0];
        const clip = createVRMAnimationClip(vrmAnim, vrm);
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;

        this._avatarActions[name] = action;
        this._animationNames.push(name);
        console.log(`[Avatar] ✓ ${name}`);
      } catch (e) {
        console.log(`[Avatar] ✗ ${name}: ${e.message}`);
      }
    }

    console.log('[Avatar] Total loaded:', this._animationNames.length);

    // Update the animation buttons UI
    this.renderAnimationButtons();
  }

  _playEmotionAnimation(emotion, fadeTime = 0.3) {
    if (!this._avatarMixer || !this._avatarActions) return;

    const newAction = this._avatarActions[emotion];
    if (!newAction) return;

    if (this._currentAvatarAction) {
      this._currentAvatarAction.fadeOut(fadeTime);
    }

    newAction.reset().fadeIn(fadeTime).play();
    this._currentAvatarAction = newAction;

    console.log(`[Avatar] Playing animation: ${emotion}`);
  }

  _loadWithGLTF(loader, vrmUrl, scene, container, camera, renderer) {
    let targetRotationY = 0;
    let currentRotationY = 0;
    const clock = new THREE.Clock();

    // Find humanoid bones for animation
    let hipsBone = null;
    let chestBone = null;
    let headBone = null;
    let leftArmBone = null;
    let rightArmBone = null;
    let leftForearmBone = null;
    let rightForearmBone = null;
    let leftShoulder = null;
    let rightShoulder = null;

    loader.load(
      vrmUrl,
      (result) => {
        let model;
        if (result.scene) {
          model = result.scene;
        } else {
          model = result;
        }

        // Find bones for animation - VRM uses "JN" prefix typically
        model.traverse((obj) => {
          if (obj.isBone) {
            const name = obj.name.toLowerCase();
            console.log('[Avatar 3D] Found bone:', obj.name);

            // Hips/root
            if (
              !hipsBone &&
              (name.includes('hips') ||
                name.includes('root') ||
                name.includes('jnh'))
            ) {
              hipsBone = obj;
            }
            // Chest/spine
            if (
              !chestBone &&
              (name.includes('chest') ||
                name.includes('spine') ||
                name.includes('jnch') ||
                name.includes('jnsp'))
            ) {
              chestBone = obj;
            }
            // Head
            if (
              !headBone &&
              (name.includes('head') || name.includes('jnhead'))
            ) {
              headBone = obj;
            }
            // Left arm - VRoid naming: J_Bip_L_UpperArm, J_Bip_L_LowerArm
            if (
              !leftArmBone &&
              (name.includes('_l_') ||
                name.includes('j_bip_l_') ||
                name.includes('_l_') ||
                name.includes('left')) &&
              (name.includes('upperarm') || name.includes('upper_arm'))
            ) {
              console.log('[Avatar 3D] Found LEFT arm bone:', obj.name);
              leftArmBone = obj;
            }
            // Right arm
            if (
              !rightArmBone &&
              (name.includes('_r_') ||
                name.includes('j_bip_r_') ||
                name.includes('right')) &&
              (name.includes('upperarm') || name.includes('upper_arm'))
            ) {
              console.log('[Avatar 3D] Found RIGHT arm bone:', obj.name);
              rightArmBone = obj;
            }
            // Left forearm (lower arm)
            if (
              !leftForearmBone &&
              (name.includes('_l_') || name.includes('left')) &&
              (name.includes('lowerarm') ||
                name.includes('lower_arm') ||
                name.includes('forearm'))
            ) {
              console.log('[Avatar 3D] Found LEFT forearm bone:', obj.name);
              leftForearmBone = obj;
            }
            // Right forearm
            if (
              !rightForearmBone &&
              (name.includes('_r_') || name.includes('right')) &&
              (name.includes('lowerarm') ||
                name.includes('lower_arm') ||
                name.includes('forearm'))
            ) {
              console.log('[Avatar 3D] Found RIGHT forearm bone:', obj.name);
              rightForearmBone = obj;
            }
            // Left shoulder
            if (
              !leftShoulder &&
              (name.includes('_l_') || name.includes('left')) &&
              name.includes('shoulder')
            ) {
              leftShoulder = obj;
            }
            // Right shoulder
            if (
              !rightShoulder &&
              (name.includes('_r_') || name.includes('right')) &&
              name.includes('shoulder')
            ) {
              rightShoulder = obj;
            }
          }
        });

        console.log(
          '[Avatar 3D] Bones - hips:',
          hipsBone?.name,
          'chest:',
          chestBone?.name,
          'head:',
          headBone?.name,
          'leftArm:',
          leftArmBone?.name,
          'rightArm:',
          rightArmBone?.name,
          'leftForearm:',
          leftForearmBone?.name,
          'rightForearm:',
          rightForearmBone?.name
        );

        // Center and scale
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        model.position.x = -center.x;
        model.position.z = -center.z;
        model.position.y = -box.min.y;

        const scale = 1.6 / size.y;
        model.scale.set(scale, scale, scale);

        scene.add(model);

        // Try to play animations from the VRM file
        let animations = [];
        if (result.animations && result.animations.length > 0) {
          animations = result.animations;
          console.log(
            '[Avatar 3D] Found',
            animations.length,
            'animations in VRM'
          );
        } else if (
          result.gltf?.animations &&
          result.gltf.animations.length > 0
        ) {
          animations = result.gltf.animations;
          console.log(
            '[Avatar 3D] Found',
            animations.length,
            'animations in gltf'
          );
        }

        let mixer = null;
        if (animations.length > 0) {
          console.log(
            '[Avatar 3D] Animation names:',
            animations.map((a) => a.name)
          );

          // Find idle/stand/wait animation, otherwise use first
          let idleClip =
            animations.find(
              (clip) =>
                clip.name.toLowerCase().includes('idle') ||
                clip.name.toLowerCase().includes('stand') ||
                clip.name.toLowerCase().includes('wait') ||
                clip.name.toLowerCase().includes('walk') ||
                clip.name.toLowerCase().includes('run')
            ) || animations[0];

          console.log('[Avatar 3D] Playing animation:', idleClip?.name);

          // Try playing multiple animations to see which looks best
          mixer = new THREE.AnimationMixer(model);

          // Play the best animation found
          const action = mixer.clipAction(idleClip);
          action.setLoop(THREE.LoopRepeat);
          action.play();

          // Also try to find and play a secondary animation for arms
          const armClip = animations.find(
            (clip) =>
              clip.name.toLowerCase().includes('arm') ||
              clip.name.toLowerCase().includes('hand')
          );
          if (armClip && armClip !== idleClip) {
            const armAction = mixer.clipAction(armClip);
            armAction.play();
          }
        }

        // Procedural idle animation - also applies to override VRM arm pose
        console.log(
          '[Avatar 3D] Shoulder bones - left:',
          leftShoulder?.name,
          'right:',
          rightShoulder?.name
        );

        // Store initial rotations
        const initialLeftArmRot = leftArmBone
          ? leftArmBone.rotation.clone()
          : null;
        const initialRightArmRot = rightArmBone
          ? rightArmBone.rotation.clone()
          : null;

        // Fix T-pose: Apply A-pose (arms at sides, not out)
        // VRoid exports in T-pose (arms out 90 degrees), rotate down
        // -1.57 = 90 degrees down (full A-pose)
        if (leftArmBone) {
          console.log('[Avatar 3D] Fixing left arm T-pose');
          leftArmBone.rotation.z = -1.2; // Rotate arm down toward body
          leftArmBone.rotation.x = 0.3; // Slight forward angle
        }
        if (rightArmBone) {
          console.log('[Avatar 3D] Fixing right arm T-pose');
          rightArmBone.rotation.z = 1.2; // Rotate arm down toward body
          rightArmBone.rotation.x = 0.3; // Slight forward angle
        }
        if (leftForearmBone) {
          leftForearmBone.rotation.x = 0.5; // Let forearm hang naturally
        }
        if (rightForearmBone) {
          rightForearmBone.rotation.x = 0.5;
        }

        // Setup emotion animation state
        let currentEmotion = 'idle';
        let emotionTransition = 0;
        let targetEmotion = 'idle';

        this._avatarEmotionState = {
          get emotion() {
            return currentEmotion;
          },
          set emotion(val) {
            targetEmotion = val;
          },
        };

        const animate = () => {
          if (!container.parentElement) return;

          const delta = clock.getDelta();
          const time = clock.getElapsedTime();

          // Smooth emotion transition
          if (currentEmotion !== targetEmotion) {
            emotionTransition += delta * 5;
            if (emotionTransition >= 1) {
              currentEmotion = targetEmotion;
              emotionTransition = 1;
              console.log('[Avatar GLTF] Emotion changed to:', currentEmotion);
            }
          } else {
            emotionTransition = 1;
          }
          const t = emotionTransition;

          // Update animation mixer if available
          if (mixer) {
            mixer.update(delta);
          }

          // Calculate emotion-based animation values
          let breathe = 0;
          let armSway = 0;
          let bodyScale = 1;
          let headTilt = 0;
          let armRaise = 0;

          switch (currentEmotion) {
            case 'idle':
              breathe = Math.sin(time * 1.5) * 0.02;
              armSway = Math.sin(time * 0.8) * 0.05;
              break;
            case 'thinking':
              breathe = Math.sin(time * 0.5) * 0.01;
              armSway = Math.sin(time * 0.3) * 0.03;
              headTilt = 0.3;
              break;
            case 'excited':
              breathe = Math.sin(time * 4) * 0.15;
              armSway = Math.sin(time * 3) * 0.3;
              bodyScale = 1 + Math.sin(time * 4) * 0.1;
              armRaise = 0.8;
              break;
            case 'angry':
              breathe = Math.sin(time * 2) * 0.05;
              armSway = Math.sin(time * 1.5) * 0.05;
              headTilt = -0.2;
              armRaise = 0.6;
              break;
            case 'walking':
              breathe = Math.sin(time * 3) * 0.08;
              armSway = Math.sin(time * 3) * 0.2;
              bodyScale = 1 + Math.abs(Math.sin(time * 3)) * 0.05;
              break;
            case 'happy':
              breathe = Math.sin(time * 2.5) * 0.08;
              armSway = Math.sin(time * 2) * 0.15;
              bodyScale = 1.05;
              break;
            case 'sad':
              breathe = Math.sin(time * 0.8) * 0.02;
              armSway = Math.sin(time * 0.5) * 0.02;
              headTilt = 0.35;
              break;
            case 'listening':
              breathe = Math.sin(time * 1.2) * 0.03;
              armSway = Math.sin(time * 1) * 0.05;
              headTilt = 0.15;
              break;
          }

          // Apply animations to bones
          const leftArmZ = -1.2 + armSway + armRaise * t;
          const rightArmZ = 1.2 - armSway - armRaise * t;
          const forearmX = 0.5 + breathe + armRaise * 0.3 * t;

          // Breathing - chest
          if (chestBone) {
            chestBone.rotation.x = breathe;
          }

          // Head sway and tilt
          if (headBone) {
            headBone.rotation.y = Math.sin(time * 0.7) * 0.03;
            headBone.rotation.z = headTilt * t;
          }

          // Arm animations
          if (leftArmBone) {
            leftArmBone.rotation.z = leftArmZ;
            leftArmBone.rotation.x = 0.3 + armRaise * t;
          }
          if (rightArmBone) {
            rightArmBone.rotation.z = rightArmZ;
            rightArmBone.rotation.x = 0.3 + armRaise * t;
          }
          if (leftForearmBone) {
            leftForearmBone.rotation.x = forearmX;
          }
          if (rightForearmBone) {
            rightForearmBone.rotation.x = forearmX;
          }

          // Body sway
          if (hipsBone) {
            hipsBone.rotation.z =
              Math.sin(time * 0.8) * 0.01 +
              (currentEmotion === 'excited' ? Math.sin(time * 4) * 0.05 : 0);
          }

          // Apply body scale
          model.scale.set(
            scale * bodyScale,
            scale * bodyScale,
            scale * bodyScale
          );

          // Apply body lean for emotions
          let avatarLean = 0;
          switch (currentEmotion) {
            case 'excited':
              avatarLean = Math.sin(time * 4) * 0.1;
              break;
            case 'angry':
              avatarLean = Math.sin(time * 2) * 0.08;
              break;
            case 'walking':
              avatarLean = Math.sin(time * 6) * 0.05;
              break;
          }
          model.rotation.z = avatarLean * t;

          // Smooth rotation
          currentRotationY += (targetRotationY - currentRotationY) * 0.1;
          model.rotation.y = currentRotationY;

          camera.lookAt(0, 0.8, 0);
          renderer.render(scene, camera);
          requestAnimationFrame(animate);
        };
        animate();

        this._setupAvatarRotationControls(container, (delta) => {
          targetRotationY += delta;
        });

        container.innerHTML = '';
        container.appendChild(renderer.domElement);
      },
      (progress) => console.log('[Avatar 3D] Progress:', progress),
      (error) => {
        console.error('[Avatar 3D] Error:', error);
        container.innerHTML =
          '<div class="avatar-placeholder-large"><span>Error loading avatar</span></div>';
      }
    );
  }

  _loadWithVRM(loader, vrmUrl, scene, container, camera, renderer) {
    let targetRotationY = 0;
    let currentRotationY = 0;
    const clock = new THREE.Clock();
    let vrm = null;
    let mixer = null;
    let leftUpperArmBone = null;
    let rightUpperArmBone = null;
    let leftForearmBone = null;
    let rightForearmBone = null;

    // Store original bone rotations for breathing animation
    const originalRotations = {};

    loader.load(
      vrmUrl,
      (gltf) => {
        // VRMLoaderPlugin puts the VRM in userData.vrm
        vrm = gltf.userData.vrm || gltf;
        console.log('[Avatar VRM] Loaded VRM:', vrm);
        console.log('[Avatar VRM] Humanoid:', vrm.humanoid);
        console.log('[Avatar VRM] Springbones:', vrm.springBoneManager);

        // Find and fix arm bones for VRoid T-pose
        // VRoid uses: J_Bip_L_UpperArm, J_Bip_L_LowerArm
        // Some exporters use: mixamorig_LeftUpArm, mixamorig_LeftArm
        const bonePatterns = {
          leftUpperArm: [
            'j_bip_l_upperarm',
            'leftuparm',
            'left_upperarm',
            'upperarm_l',
            'shoulder_l',
            'arm_l1',
          ],
          rightUpperArm: [
            'j_bip_r_upperarm',
            'rightuparm',
            'right_upperarm',
            'upperarm_r',
            'shoulder_r',
            'arm_r1',
          ],
          leftForearm: [
            'j_bip_l_lowerarm',
            'leftarm',
            'left_forearm',
            'lowerarm_l',
            'arm_l2',
            'forearm_l',
          ],
          rightForearm: [
            'j_bip_r_lowerarm',
            'rightarm',
            'right_forearm',
            'lowerarm_r',
            'arm_r2',
            'forearm_r',
          ],
        };

        vrm.scene.traverse((obj) => {
          if (obj.isBone || obj.isObject3D) {
            const name = obj.name.toLowerCase().replace(/\s+/g, '');

            // Left upper arm
            if (
              !leftUpperArmBone &&
              bonePatterns.leftUpperArm.some((p) => name.includes(p))
            ) {
              leftUpperArmBone = obj;
              console.log('[Avatar VRM] Found left upper arm bone:', obj.name);
            }
            // Right upper arm
            if (
              !rightUpperArmBone &&
              bonePatterns.rightUpperArm.some((p) => name.includes(p))
            ) {
              rightUpperArmBone = obj;
              console.log('[Avatar VRM] Found right upper arm bone:', obj.name);
            }
            // Left forearm (check for forearm before arm to avoid partial matches)
            if (
              !leftForearmBone &&
              bonePatterns.leftForearm.some((p) => name.includes(p))
            ) {
              leftForearmBone = obj;
              console.log('[Avatar VRM] Found left forearm bone:', obj.name);
            }
            // Right forearm
            if (
              !rightForearmBone &&
              bonePatterns.rightForearm.some((p) => name.includes(p))
            ) {
              rightForearmBone = obj;
              console.log('[Avatar VRM] Found right forearm bone:', obj.name);
            }
          }
        });

        console.log(
          '[Avatar VRM] Bone detection complete - Left:',
          !!leftUpperArmBone,
          'Right:',
          !!rightUpperArmBone
        );

        // Debug: log all bones if specific ones not found
        if (!leftUpperArmBone || !rightUpperArmBone) {
          console.log('[Avatar VRM] Dumping all bones for debugging:');
          vrm.scene.traverse((obj) => {
            if (obj.isBone) {
              console.log('  Bone:', obj.name);
            }
          });

          // Also find meshes that might be arms (left/right of body)
          const armMeshes = [];
          vrm.scene.traverse((obj) => {
            if (obj.isMesh && obj.position) {
              // Arms are typically at x position < -0.3 or > 0.3
              if (
                Math.abs(obj.position.x) > 0.3 &&
                obj.position.y > 0.5 &&
                obj.position.y < 1.5
              ) {
                armMeshes.push({
                  mesh: obj,
                  side: obj.position.x < 0 ? 'left' : 'right',
                });
                console.log(
                  '[Avatar VRM] Found arm mesh:',
                  obj.name,
                  'at x:',
                  obj.position.x.toFixed(2)
                );
              }
            }
          });
          if (armMeshes.length > 0) {
            this._avatarArmMeshes = armMeshes.map((m) => m.mesh);
            console.log(
              '[Avatar VRM] Stored',
              armMeshes.length,
              'arm meshes for animation fallback'
            );
          }
        }

        // Apply standing pose to fix VRoid T-pose
        // Upper arms: rotate inward (toward body) ~30 degrees
        const upperArmInward = -0.5; // radians (~30 degrees)
        // Forearms: slight downward hang ~15 degrees
        const forearmDown = 0.25; // radians

        if (leftUpperArmBone) {
          originalRotations.leftUpperArm = leftUpperArmBone.rotation.clone();
          leftUpperArmBone.rotation.z = upperArmInward;
        }
        if (rightUpperArmBone) {
          originalRotations.rightUpperArm = rightUpperArmBone.rotation.clone();
          rightUpperArmBone.rotation.z = -upperArmInward; // opposite for right
        }
        if (leftForearmBone) {
          originalRotations.leftForearm = leftForearmBone.rotation.clone();
          leftForearmBone.rotation.x = forearmDown;
        }
        if (rightForearmBone) {
          originalRotations.rightForearm = rightForearmBone.rotation.clone();
          rightForearmBone.rotation.x = forearmDown;
        }

        console.log('[Avatar VRM] Applied standing pose to fix T-pose');

        // VRM loader automatically applies first-person standing pose
        // Add to scene
        scene.add(vrm.scene);

        // Enable springbones for VRoid hair/clothing physics
        if (vrm.springBoneManager) {
          console.log('[Avatar VRM] Springbones enabled for hair physics');
        }

        // Set up VRM materials for proper lighting
        vrm.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            obj.frustumCulled = false;
          }
        });

        // Center and scale based on avatar height
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        vrm.scene.position.x = -center.x;
        vrm.scene.position.z = -center.z;
        vrm.scene.position.y = -box.min.y;

        const scale = 1.6 / size.y;
        vrm.scene.scale.set(scale, scale, scale);

        console.log('[Avatar VRM] Model scaled to 1.6 units height');

        // Initialize VRM systems before animations
        if (vrm.humanoid) {
          vrm.humanoid.update();
        }
        vrm.update(0);

        // Set up animation mixer and load VRM animations
        mixer = new THREE.AnimationMixer(vrm.scene);
        this._avatarMixer = mixer;
        this._avatarActions = {};
        this._currentAvatarAction = null;

        // Load VRM animations and start idle after loading completes
        const loadAndStartIdle = async () => {
          await this._loadAvatarAnimations(vrm, mixer);

          // Start with idle animation to prevent T-pose
          if (this._avatarActions['Standard Idle']) {
            this._avatarActions['Standard Idle'].play();
            this._currentAvatarAction = this._avatarActions['Standard Idle'];
            console.log('[Avatar] Started Standard Idle animation');
          } else if (this._animationNames && this._animationNames.length > 0) {
            // Fallback to first available animation
            const firstAnim = this._animationNames[0];
            if (this._avatarActions[firstAnim]) {
              this._avatarActions[firstAnim].play();
              this._currentAvatarAction = this._avatarActions[firstAnim];
              console.log('[Avatar] Started fallback animation:', firstAnim);
            }
          }

          // Mark scene as ready for caching
          this._avatarSceneReady = true;
          this._avatarAnimationsReady = true;
          console.log('[Avatar] Scene ready and cached');

          // Start profile cycle if enabled
          if (this._avatarSettings.enabled) {
            this.startProfileAnimationCycle();
          }
        };
        loadAndStartIdle();

        // Animation loop
        let breathingTime = 0;
        let currentEmotion = 'idle';
        let emotionTransition = 0;
        let targetEmotion = 'idle';
        const app = this;

        // Store refs for emotion updates
        this._avatarEmotionState = {
          get emotion() {
            return currentEmotion;
          },
          set emotion(val) {
            targetEmotion = val;
            app._playEmotionAnimation(val);
          },
          vrm,
          mixer,
          leftUpperArmBone,
          rightUpperArmBone,
          leftForearmBone,
          rightForearmBone,
          originalRotations,
          clock,
          breathingTime: 0,
        };

        const animate = () => {
          if (!container.parentElement) return;
          if (app._avatarAnimatingPaused) {
            requestAnimationFrame(animate);
            return;
          }

          const delta = clock.getDelta();
          breathingTime += delta;

          // Smooth emotion transition - faster for better response
          if (currentEmotion !== targetEmotion) {
            emotionTransition += delta * 5; // Much faster transition
            if (emotionTransition >= 1) {
              currentEmotion = targetEmotion;
              emotionTransition = 1;
              console.log('[Avatar] Emotion changed to:', currentEmotion);
            }
          } else {
            emotionTransition = 1;
          }

          const t = emotionTransition;

          // Debug: log when target changes
          if (targetEmotion !== currentEmotion && targetEmotion !== 'idle') {
            // Just for excited, angry, etc - log once
          }

          // Update animation mixer
          if (mixer) {
            mixer.update(delta);
          }

          // Play VRM animation if emotion changed
          if (
            this._avatarActions[targetEmotion] &&
            currentEmotion !== targetEmotion
          ) {
            this._playEmotionAnimation(targetEmotion);
          }

          // Update VRM systems
          vrm.update(delta);

          // Only apply procedural animation if no VRM animation is available
          const hasVRMAnimation =
            app._avatarActions && app._avatarActions[currentEmotion];

          if (!hasVRMAnimation) {
            // Emotion-based animations (procedural fallback)
            let breathe = 0;
            let armSway = 0;
            let armRaise = 0;

            switch (currentEmotion) {
              case 'idle':
                breathe = Math.sin(breathingTime * 1.5) * 0.02;
                armSway = Math.sin(breathingTime * 0.8) * 0.05;
                break;
              case 'thinking':
                breathe = Math.sin(breathingTime * 0.5) * 0.01;
                armSway = Math.sin(breathingTime * 0.3) * 0.03;
                break;
              case 'excited':
                breathe = Math.sin(breathingTime * 4) * 0.15;
                armSway = Math.sin(breathingTime * 3) * 0.3;
                armRaise = 0.8;
                break;
              case 'angry':
                breathe = Math.sin(breathingTime * 2) * 0.05;
                armSway = Math.sin(breathingTime * 1.5) * 0.05;
                armRaise = 0.6;
                break;
              case 'walking':
                breathe = Math.sin(breathingTime * 3) * 0.08;
                armSway = Math.sin(breathingTime * 3) * 0.2;
                break;
              case 'happy':
                breathe = Math.sin(breathingTime * 2.5) * 0.08;
                armSway = Math.sin(breathingTime * 2) * 0.15;
                break;
              case 'sad':
                breathe = Math.sin(breathingTime * 0.8) * 0.02;
                armSway = Math.sin(breathingTime * 0.5) * 0.02;
                break;
              case 'listening':
                breathe = Math.sin(breathingTime * 1.2) * 0.03;
                armSway = Math.sin(breathingTime * 1) * 0.05;
                break;
            }

            // Apply animations to bones only when no VRM animation
            const leftArmZ = -0.5 + armSway + armRaise * t;
            const rightArmZ = 0.5 - armSway - armRaise * t;
            const forearmX = 0.25 + breathe + armRaise * 0.3 * t;

            if (leftUpperArmBone) {
              leftUpperArmBone.rotation.z = leftArmZ;
              leftUpperArmBone.rotation.x = armRaise * t;
            }
            if (rightUpperArmBone) {
              rightUpperArmBone.rotation.z = rightArmZ;
              rightUpperArmBone.rotation.x = armRaise * t;
            }
            if (leftForearmBone) {
              leftForearmBone.rotation.x = forearmX;
            }
            if (rightForearmBone) {
              rightForearmBone.rotation.x = forearmX;
            }

            // Additional emotion effects - rotate the avatar for excited/angry
            let avatarLean = 0;
            switch (currentEmotion) {
              case 'excited':
                avatarLean = Math.sin(breathingTime * 4) * 0.1;
                break;
              case 'angry':
                avatarLean = Math.sin(breathingTime * 2) * 0.08;
                break;
              case 'walking':
                avatarLean = Math.sin(breathingTime * 6) * 0.05;
                break;
            }
            vrm.scene.rotation.z = avatarLean * t;

            // Smooth rotation
            currentRotationY += (targetRotationY - currentRotationY) * 0.1;
            vrm.scene.rotation.y = currentRotationY;
          }

          // Update VRM systems (always)
          if (vrm.humanoid) {
            vrm.humanoid.update();
          }

          // Look at upper body
          camera.lookAt(0, 0.8 * scale, 0);
          renderer.render(scene, camera);
          requestAnimationFrame(animate);
        };
        animate();

        this._setupAvatarRotationControls(container, (delta) => {
          targetRotationY += delta;
        });

        container.innerHTML = '';
        container.appendChild(renderer.domElement);
      },
      (progress) =>
        console.log(
          '[Avatar VRM] Progress:',
          ((progress.loaded / progress.total) * 100).toFixed(1) + '%'
        ),
      (error) => {
        console.error('[Avatar VRM] Error loading VRM:', error);
        // Fallback to GLTFLoader if VRMLoader fails
        console.log('[Avatar VRM] Falling back to GLTFLoader');
        const gltfLoader = new THREE.GLTFLoader();
        this._loadWithGLTF(
          gltfLoader,
          vrmUrl,
          scene,
          container,
          camera,
          renderer
        );
      }
    );
  }

  _setupAvatarZoomControls(container, camera, scene, renderer) {
    // Mouse wheel zoom
    container.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const zoomSpeed = 0.001;
        this._avatarZoom += e.deltaY * zoomSpeed;
        this._avatarZoom = Math.max(1.5, Math.min(8, this._avatarZoom));
        camera.position.z = this._avatarZoom;
        camera.position.y = 1.0; // Keep looking at torso level
      },
      { passive: false }
    );

    // Button zoom controls
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');

    if (zoomInBtn) {
      zoomInBtn.onclick = () => {
        this._avatarZoom = Math.max(1.5, this._avatarZoom - 0.5);
        camera.position.z = this._avatarZoom;
      };
    }

    if (zoomOutBtn) {
      zoomOutBtn.onclick = () => {
        this._avatarZoom = Math.min(8, this._avatarZoom + 0.5);
        camera.position.z = this._avatarZoom;
      };
    }
  }

  _setupAvatarRotationControls(container, onRotate) {
    let isDragging = false;
    let previousX = 0;

    container.addEventListener('mousedown', (e) => {
      isDragging = true;
      previousX = e.clientX;
      container.style.cursor = 'grabbing';
    });

    container.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - previousX;
      previousX = e.clientX;
      onRotate(deltaX * 0.01);
    });

    container.addEventListener('mouseup', () => {
      isDragging = false;
      container.style.cursor = 'grab';
    });

    container.addEventListener('mouseleave', () => {
      isDragging = false;
      container.style.cursor = 'grab';
    });

    container.style.cursor = 'grab';
  }

  // Speech bubble and expression system
  showSpeechBubble(message, duration = 5000) {
    const bubble = document.getElementById('avatar-speech-bubble');
    const content = document.getElementById('speech-content');
    if (!bubble || !content) return;

    content.textContent = message;
    bubble.style.display = 'block';
    bubble.classList.remove('fade-out');

    if (this._speechBubbleTimeout) {
      clearTimeout(this._speechBubbleTimeout);
    }

    if (duration > 0) {
      this._speechBubbleTimeout = setTimeout(() => {
        this.hideSpeechBubble();
      }, duration);
    }
  }

  hideSpeechBubble() {
    const bubble = document.getElementById('avatar-speech-bubble');
    if (!bubble) return;

    bubble.classList.add('fade-out');
    setTimeout(() => {
      bubble.style.display = 'none';
      bubble.classList.remove('fade-out');
    }, 300);
  }

  showTypingIndicator() {
    const typing = document.getElementById('avatar-typing');
    if (typing) {
      typing.style.display = 'flex';
    }
  }

  hideTypingIndicator() {
    const typing = document.getElementById('avatar-typing');
    if (typing) {
      typing.style.display = 'none';
    }
  }

  // AI Speech Bubble (for AI responses in browser)
  showAISpeechBubble(message, duration = 5000) {
    const bubble = document.getElementById('ai-speech-bubble');
    const content = document.getElementById('ai-speech-content');
    if (!bubble || !content) return;

    content.textContent = message;
    bubble.style.display = 'block';
    bubble.classList.remove('fade-out');

    if (this._aiSpeechTimeout) {
      clearTimeout(this._aiSpeechTimeout);
    }

    if (duration > 0) {
      this._aiSpeechTimeout = setTimeout(() => {
        this.hideAISpeechBubble();
      }, duration);
    }
  }

  hideAISpeechBubble() {
    const bubble = document.getElementById('ai-speech-bubble');
    if (!bubble) return;

    bubble.classList.add('fade-out');
    setTimeout(() => {
      bubble.style.display = 'none';
      bubble.classList.remove('fade-out');
    }, 300);
  }

  showAITypingIndicator() {
    const typing = document.getElementById('ai-typing-indicator');
    if (typing) {
      typing.style.display = 'flex';
    }
  }

  hideAITypingIndicator() {
    const typing = document.getElementById('ai-typing-indicator');
    if (typing) {
      typing.style.display = 'none';
    }
  }

  // Browser Avatar Speech Bubble (for the browser section)
  showBrowserSpeechBubble(message, duration = 5000) {
    const bubble = document.getElementById('browser-ai-speech-bubble');
    const content = document.getElementById('browser-speech-content');
    if (!bubble || !content) return;

    content.textContent = message;
    bubble.style.display = 'block';
    bubble.classList.remove('fade-out');

    if (this._browserSpeechTimeout) {
      clearTimeout(this._browserSpeechTimeout);
    }

    if (duration > 0) {
      this._browserSpeechTimeout = setTimeout(() => {
        this.hideBrowserSpeechBubble();
      }, duration);
    }
  }

  hideBrowserSpeechBubble() {
    const bubble = document.getElementById('browser-ai-speech-bubble');
    if (!bubble) return;

    bubble.classList.add('fade-out');
    setTimeout(() => {
      bubble.style.display = 'none';
      bubble.classList.remove('fade-out');
    }, 300);
  }

  showBrowserTypingIndicator() {
    const typing = document.getElementById('browser-ai-typing');
    if (typing) {
      typing.style.display = 'flex';
    }
  }

  hideBrowserTypingIndicator() {
    const typing = document.getElementById('browser-ai-typing');
    if (typing) {
      typing.style.display = 'none';
    }
  }

  // Avatar emotion states - merged with animation
  setAvatarEmotion(emotion) {
    console.log('[Avatar] Setting emotion:', emotion);

    // Handle idle - play idle animation instead of stopping
    if (emotion === 'idle') {
      // Play Standard Idle animation if available
      const idleAnim =
        this._avatarActions['Standard Idle'] ||
        this._avatarActions['Offensive Idle'] ||
        this._avatarActions['Bored'] ||
        this._avatarActions['Idle Dance'];

      if (idleAnim) {
        if (this._currentAvatarAction) {
          this._currentAvatarAction.fadeOut(0.3);
        }
        idleAnim.reset().fadeIn(0.3).play();
        this._currentAvatarAction = idleAnim;
      }

      // Update UI
      document.querySelectorAll('.anim-btn').forEach((btn) => {
        btn.classList.remove('active');
      });
      const idleBtn = document.getElementById('anim-idle');
      if (idleBtn) idleBtn.classList.add('active');

      const emotionDisplay = document.getElementById('emotion-name');
      if (emotionDisplay) emotionDisplay.textContent = 'Standard Idle';

      this._currentAvatarEmotion = 'idle';

      // Update avatar emotion state
      if (this._avatarEmotionState) {
        this._avatarEmotionState.emotion = 'idle';
      }
      return;
    }

    // Prevent rapid changes if same animation
    if (this._currentAvatarEmotion === emotion) {
      return;
    }

    // Update button states
    document.querySelectorAll('.anim-btn').forEach((btn) => {
      btn.classList.remove('active');
    });

    // Update emotion display
    const emotionName = document.getElementById('emotion-name');
    if (emotionName) {
      emotionName.textContent = emotion;
    }

    // Store current emotion
    this._currentAvatarEmotion = emotion;

    // Play animation if it exists
    if (this._avatarActions && this._avatarActions[emotion]) {
      if (this._currentAvatarAction) {
        this._currentAvatarAction.fadeOut(0.3);
      }
      const action = this._avatarActions[emotion];
      action.reset().fadeIn(0.3).play();
      this._currentAvatarAction = action;
    }

    // Update the avatar emotion state if it exists (for VRM)
    if (this._avatarEmotionState) {
      this._avatarEmotionState.emotion = emotion;
    }

    // Auto-return to idle after animation finishes (for LoopOnce animations)
    clearTimeout(this._emotionTimeout);
    this._emotionTimeout = setTimeout(() => {
      if (this._currentAvatarEmotion === emotion) {
        this.setAvatarEmotion('idle');
      }
    }, 8000);
  }

  getEmotionEmoji(emotion) {
    const emojis = {
      thinking: '🤔',
      happy: '😄',
      sad: '😢',
      surprised: '😮',
      excited: '🎉',
      confused: '😕',
      speechless: '😐',
      angry: '😠',
      loves: '😍',
      wave: '👋',
      thumbsup: '👍',
      idle: '🧍',
      walking: '🚶',
      listening: '👂',
    };
    return emojis[emotion] || '🧍';
  }

  // Trigger avatar animation based on context
  triggerAvatarAnimation(type) {
    switch (type) {
      case 'thinking':
        this.setAvatarEmotion('thinking');
        this.showTypingIndicator();
        break;
      case 'happy':
        this.setAvatarEmotion('happy');
        break;
      case 'excited':
        this.setAvatarEmotion('excited');
        break;
      case 'speaking':
        this.setAvatarEmotion('speechless');
        break;
      case 'react':
        this.setAvatarEmotion('loves');
        break;
      case 'success':
        this.setAvatarEmotion('thumbsup');
        this.showSpeechBubble('✅ Done!', 3000);
        break;
      case 'error':
        this.setAvatarEmotion('confused');
        this.showSpeechBubble('❌ Oops!', 4000);
        break;
      case 'welcome':
        this.setAvatarEmotion('wave');
        this.showSpeechBubble('👋 Welcome back!', 3000);
        break;
      case 'bye':
        this.setAvatarEmotion('wave');
        this.showSpeechBubble('👋 Goodbye!', 3000);
        break;
      case 'loading':
        this.showTypingIndicator();
        this.showSpeechBubble('⏳ Loading...', 0);
        break;
      case 'idle':
        this.hideTypingIndicator();
        this.hideSpeechBubble();
        break;
      default:
        break;
    }
  }

  // AI Chat integration - show AI response in avatar bubble
  showAIResponse(message, type = 'normal') {
    this.hideTypingIndicator();

    const emotionMap = {
      normal: 'speechless',
      success: 'happy',
      error: 'confused',
      question: 'thinking',
      excited: 'excited',
      greeting: 'wave',
    };

    const emotion = emotionMap[type] || 'speechless';
    this.setAvatarEmotion(emotion);

    // Truncate long messages for bubble
    const displayMessage =
      message.length > 100 ? message.substring(0, 100) + '...' : message;

    this.showSpeechBubble(displayMessage, 5000);
  }

  // Public API for external integration
  avatarReact(type, message) {
    if (type === 'bubble' && message) {
      this.showSpeechBubble(message);
    } else if (type === 'emotion' && message) {
      this.setAvatarEmotion(message);
    } else {
      this.triggerAvatarAnimation(type);
    }
  }

  async handleVRMUpload(file) {
    const uploadStatus = document.getElementById('upload-status');
    const fileName = file.name.toLowerCase();

    if (!fileName.endsWith('.vrm') && !fileName.endsWith('.xroid')) {
      if (uploadStatus) {
        uploadStatus.textContent = 'Please upload a .vrm or .xroid file';
        uploadStatus.className = 'upload-status error';
      }
      return;
    }

    try {
      console.log('[Avatar] Processing VRM file:', file.name);

      if (uploadStatus) {
        uploadStatus.textContent = 'Uploading...';
        uploadStatus.className = 'upload-status';
      }

      // Convert file to base64 for persistent storage
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Save VRM file to disk for persistence
      if (window.electronAPI) {
        const saveResult = await window.electronAPI.saveVrmFile(
          file.name,
          dataUrl
        );

        if (saveResult.success) {
          console.log('[Avatar] VRM file saved to disk:', saveResult.vrmPath);

          // Save metadata with file reference
          await window.electronAPI.saveAvatarCustomization({
            fileName: file.name,
            vrmPath: saveResult.vrmPath,
            uploadedAt: new Date().toISOString(),
          });

          if (uploadStatus) {
            uploadStatus.textContent = 'Avatar uploaded and saved!';
            uploadStatus.className = 'upload-status success';
          }

          // Store VRM data URL for browser avatar
          this._savedVrmDataUrl = dataUrl;

          // Render avatar in 3D
          this.renderAvatar3D(dataUrl);

          // Browser tab avatar disabled - avatar lives in AI Browser popup instead
          // this.renderBrowserAvatar(dataUrl);
        } else {
          throw new Error(saveResult.error);
        }
      }
    } catch (error) {
      console.error('[Avatar] VRM upload error:', error);
      if (uploadStatus) {
        uploadStatus.textContent = 'Failed to upload avatar';
        uploadStatus.className = 'upload-status error';
      }
    }
  }

  renderAvatar(style, primaryColor, accentColor) {
    const container = document.getElementById('avatar-canvas');
    if (!container) return;

    // Clear existing
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Create Three.js scene with professional lighting
    const scene = new THREE.Scene();

    // Gradient-like background using multiple colored planes
    const bgGeo = new THREE.PlaneGeometry(20, 20);
    const bgMat1 = new THREE.MeshBasicMaterial({
      color: 0x0f0f1a,
      side: THREE.DoubleSide,
    });
    const bg1 = new THREE.Mesh(bgGeo, bgMat1);
    bg1.position.z = -5;
    scene.add(bg1);

    // Add subtle grid floor
    const gridHelper = new THREE.GridHelper(4, 20, 0x333355, 0x222244);
    gridHelper.position.y = -0.1;
    scene.add(gridHelper);

    // Platform/pedestal for avatar
    const platformGeo = new THREE.CylinderGeometry(0.5, 0.55, 0.08, 32);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a3a,
      metalness: 0.8,
      roughness: 0.3,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = -0.15;
    platform.receiveShadow = true;
    scene.add(platform);

    // Platform ring glow
    const ringGeo = new THREE.TorusGeometry(0.52, 0.015, 8, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 0.5,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.11;
    scene.add(ring);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1.6, 2.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Professional lighting setup
    const ambientLight = new THREE.AmbientLight(0x404060, 0.4);
    scene.add(ambientLight);

    // Main key light
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    scene.add(keyLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
    fillLight.position.set(-5, 0, -5);
    scene.add(fillLight);

    // Create avatar based on style
    const avatar = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      roughness: 0.7,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xffdbac,
      roughness: 0.8,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.9,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      metalness: 0.8,
      roughness: 0.3,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.5,
    });

    switch (style) {
      case 'default':
        this.createAvatarGeometry(avatar, 'default', bodyMat, skinMat, hairMat);
        break;
      case 'revolutionary':
        this.createAvatarGeometry(
          avatar,
          'revolutionary',
          bodyMat,
          skinMat,
          hairMat
        );
        break;
      case 'journalist':
        this.createAvatarGeometry(
          avatar,
          'journalist',
          bodyMat,
          skinMat,
          hairMat
        );
        break;
      case 'activist':
        this.createAvatarGeometry(
          avatar,
          'activist',
          bodyMat,
          skinMat,
          hairMat
        );
        break;
      case 'robot':
        this.createAvatarGeometry(avatar, 'robot', metalMat, metalMat, glowMat);
        break;
      case 'minimal':
        this.createAvatarGeometry(avatar, 'minimal', bodyMat, skinMat, hairMat);
        break;
      default:
        this.createAvatarGeometry(avatar, 'default', bodyMat, skinMat, hairMat);
    }

    avatar.position.y = -0.5;
    scene.add(avatar);

    // Animation loop
    let isSpinning = false;
    const animate = () => {
      if (!container.parentElement) return;
      requestAnimationFrame(animate);

      if (isSpinning) {
        avatar.rotation.y += 0.01;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Mouse drag rotation
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    renderer.domElement.addEventListener('mousedown', (e) => {
      isDragging = true;
      isSpinning = false;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - previousMousePosition.x;
      avatar.rotation.y += deltaX * 0.01;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener('mouseup', () => {
      isDragging = false;
      isSpinning = true;
    });

    renderer.domElement.addEventListener('mouseleave', () => {
      isDragging = false;
    });

    // Store for cleanup
    this._currentAvatarRenderer = { renderer, scene, camera };
  }

  createAvatarGeometry(avatar, style, bodyMat, skinMat, hairMat) {
    switch (style) {
      case 'default': {
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 32, 32),
          skinMat
        );
        head.position.y = 1.6;
        head.castShadow = true;
        avatar.add(head);

        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.25, 0.7, 32),
          bodyMat
        );
        body.position.y = 1.0;
        body.castShadow = true;
        avatar.add(body);

        const hair = new THREE.Mesh(
          new THREE.SphereGeometry(
            0.27,
            32,
            16,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2
          ),
          hairMat
        );
        hair.position.y = 1.75;
        hair.castShadow = true;
        avatar.add(hair);

        const eyeGeo = new THREE.SphereGeometry(0.03, 16, 16);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.08, 1.65, 0.22);
        avatar.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.08, 1.65, 0.22);
        avatar.add(rightEye);
        break;
      }

      case 'revolutionary': {
        const revHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 32, 32),
          skinMat
        );
        revHead.position.y = 1.6;
        revHead.castShadow = true;
        avatar.add(revHead);

        const revBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.28, 0.8, 32),
          bodyMat
        );
        revBody.position.y = 0.95;
        revBody.castShadow = true;
        avatar.add(revBody);

        const revHair = new THREE.Mesh(
          new THREE.ConeGeometry(0.3, 0.3, 8),
          hairMat
        );
        revHair.position.y = 1.9;
        revHair.castShadow = true;
        avatar.add(revHair);

        const bandana = new THREE.Mesh(
          new THREE.TorusGeometry(0.26, 0.03, 8, 32),
          hairMat
        );
        bandana.position.y = 1.8;
        bandana.rotation.x = Math.PI / 2;
        avatar.add(bandana);
        break;
      }

      case 'journalist': {
        const jourHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 32, 32),
          skinMat
        );
        jourHead.position.y = 1.6;
        jourHead.castShadow = true;
        avatar.add(jourHead);

        const jourBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.22, 0.7, 32),
          bodyMat
        );
        jourBody.position.y = 1.0;
        jourBody.castShadow = true;
        avatar.add(jourBody);

        const glassesFrame = new THREE.MeshStandardMaterial({
          color: 0x333333,
          metalness: 0.8,
          roughness: 0.2,
        });
        const leftLens = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16),
          glassesFrame
        );
        leftLens.position.set(-0.1, 1.65, 0.2);
        leftLens.rotation.z = Math.PI / 2;
        avatar.add(leftLens);
        const rightLens = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16),
          glassesFrame
        );
        rightLens.position.set(0.1, 1.65, 0.2);
        rightLens.rotation.z = Math.PI / 2;
        avatar.add(rightLens);
        break;
      }

      case 'activist': {
        const actHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 32, 32),
          skinMat
        );
        actHead.position.y = 1.6;
        actHead.castShadow = true;
        avatar.add(actHead);

        const actBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.26, 0.75, 32),
          bodyMat
        );
        actBody.position.y = 0.97;
        actBody.castShadow = true;
        avatar.add(actBody);

        const fistGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const leftFist = new THREE.Mesh(fistGeo, skinMat);
        leftFist.position.set(-0.3, 1.3, 0.1);
        avatar.add(leftFist);
        const rightFist = new THREE.Mesh(fistGeo, skinMat);
        rightFist.position.set(0.3, 1.3, 0.1);
        avatar.add(rightFist);

        const actHair = new THREE.Mesh(
          new THREE.ConeGeometry(0.32, 0.15, 6),
          hairMat
        );
        actHair.position.y = 1.88;
        avatar.add(actHair);
        break;
      }

      case 'robot': {
        const robotGroup = new THREE.Group();

        // Head - main
        const headGeo = new THREE.BoxGeometry(0.45, 0.42, 0.4, 2, 2, 2);
        const head = new THREE.Mesh(headGeo, bodyMat);
        head.position.y = 1.6;
        head.castShadow = true;
        robotGroup.add(head);

        // Face plate - darker
        const facePlate = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.32, 0.03),
          new THREE.MeshStandardMaterial({
            color: 0x1a1a2e,
            metalness: 0.95,
            roughness: 0.15,
          })
        );
        facePlate.position.set(0, 1.58, 0.2);
        robotGroup.add(facePlate);

        // Visor - glowing
        const visorMat = new THREE.MeshStandardMaterial({
          color: accentColor,
          emissive: accentColor,
          emissiveIntensity: 1.2,
          metalness: 0.1,
          roughness: 0.1,
        });
        const visor = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.09, 0.04),
          visorMat
        );
        visor.position.set(0, 1.62, 0.22);
        robotGroup.add(visor);

        // Visor glow spheres
        const glowMat = new THREE.MeshStandardMaterial({
          color: accentColor,
          emissive: accentColor,
          emissiveIntensity: 1.5,
        });
        [-0.11, -0.04, 0.04, 0.11].forEach((x) => {
          const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.02, 12, 12),
            glowMat
          );
          glow.position.set(x, 1.62, 0.24);
          robotGroup.add(glow);
        });

        // Head side panels
        const sidePanelMat = new THREE.MeshStandardMaterial({
          color: 0x3a3a4a,
          metalness: 0.9,
          roughness: 0.2,
        });
        [-0.24, 0.24].forEach((x) => {
          const sidePanel = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.25, 0.2),
            sidePanelMat
          );
          sidePanel.position.set(x, 1.58, 0.1);
          robotGroup.add(sidePanel);
        });

        // Antenna base
        const antBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.06, 0.05, 16),
          bodyMat
        );
        antBase.position.set(0, 1.95, 0);
        robotGroup.add(antBase);

        // Antenna pole
        const antPole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8),
          new THREE.MeshStandardMaterial({
            color: 0x666666,
            metalness: 0.9,
            roughness: 0.3,
          })
        );
        antPole.position.set(0, 2.08, 0);
        robotGroup.add(antPole);

        // Antenna tip - glowing
        const antTip = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 16, 16),
          glowMat
        );
        antTip.position.set(0, 2.2, 0);
        robotGroup.add(antTip);

        // Neck
        const neck = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.09, 0.12, 16),
          new THREE.MeshStandardMaterial({
            color: 0x333344,
            metalness: 0.85,
            roughness: 0.35,
          })
        );
        neck.position.y = 1.33;
        robotGroup.add(neck);

        // Chest - main body
        const chest = new THREE.Mesh(
          new THREE.BoxGeometry(0.48, 0.5, 0.32, 2, 2, 2),
          bodyMat
        );
        chest.position.y = 1.03;
        chest.castShadow = true;
        robotGroup.add(chest);

        // Chest panel
        const chestPanel = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.35, 0.025),
          sidePanelMat
        );
        chestPanel.position.set(0, 1.03, 0.17);
        robotGroup.add(chestPanel);

        // Status lights (3 colored buttons)
        const buttonColors = [0x00ff66, 0xffaa00, 0xff3366];
        [-0.1, 0, 0.1].forEach((x, i) => {
          const btnMat = new THREE.MeshStandardMaterial({
            color: buttonColors[i],
            emissive: buttonColors[i],
            emissiveIntensity: 0.5,
          });
          const button = new THREE.Mesh(
            new THREE.CylinderGeometry(0.028, 0.028, 0.015, 16),
            btnMat
          );
          button.rotation.x = Math.PI / 2;
          button.position.set(x, 0.83, 0.175);
          robotGroup.add(button);
        });

        // Speakers
        [-0.16, 0.16].forEach((x) => {
          const speaker = new THREE.Mesh(
            new THREE.CircleGeometry(0.04, 16),
            sidePanelMat
          );
          speaker.position.set(x, 1.15, 0.165);
          robotGroup.add(speaker);
        });

        // Shoulders
        const shoulderGeo = new THREE.SphereGeometry(0.11, 16, 16);
        [-0.32, 0.32].forEach((x) => {
          const shoulder = new THREE.Mesh(shoulderGeo, bodyMat);
          shoulder.position.set(x, 1.28, 0);
          shoulder.castShadow = true;
          robotGroup.add(shoulder);
        });

        // Upper arms
        const upperArmGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.32, 12);
        const armMat = new THREE.MeshStandardMaterial({
          color: primaryColor,
          metalness: 0.75,
          roughness: 0.3,
        });
        [-0.36, 0.36].forEach((x) => {
          const arm = new THREE.Mesh(upperArmGeo, armMat);
          arm.position.set(x, 1.05, 0);
          arm.castShadow = true;
          robotGroup.add(arm);
        });

        // Elbows
        const elbowGeo = new THREE.SphereGeometry(0.07, 12, 12);
        [-0.36, 0.36].forEach((x) => {
          const elbow = new THREE.Mesh(elbowGeo, sidePanelMat);
          elbow.position.set(x, 0.86, 0);
          robotGroup.add(elbow);
        });

        // Forearms
        const foreArmGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.28, 12);
        [-0.36, 0.36].forEach((x) => {
          const foreArm = new THREE.Mesh(foreArmGeo, armMat);
          foreArm.position.set(x, 0.69, 0);
          foreArm.castShadow = true;
          robotGroup.add(foreArm);
        });

        // Hands
        const handGeo = new THREE.BoxGeometry(0.09, 0.11, 0.07);
        [-0.36, 0.36].forEach((x) => {
          const hand = new THREE.Mesh(handGeo, sidePanelMat);
          hand.position.set(x, 0.52, 0);
          robotGroup.add(hand);
        });

        // Waist
        const waist = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.16, 0.14, 16),
          sidePanelMat
        );
        waist.position.y = 0.74;
        robotGroup.add(waist);

        // Legs
        const legGeo = new THREE.CylinderGeometry(0.075, 0.085, 0.42, 12);
        [-0.13, 0.13].forEach((x) => {
          const leg = new THREE.Mesh(legGeo, armMat);
          leg.position.set(x, 0.48, 0);
          leg.castShadow = true;
          robotGroup.add(leg);
        });

        // Knees
        const kneeGeo = new THREE.SphereGeometry(0.085, 12, 12);
        [-0.13, 0.13].forEach((x) => {
          const knee = new THREE.Mesh(kneeGeo, sidePanelMat);
          knee.position.set(x, 0.26, 0);
          robotGroup.add(knee);
        });

        // Lower legs
        const lowerLegGeo = new THREE.CylinderGeometry(0.06, 0.075, 0.28, 12);
        [-0.13, 0.13].forEach((x) => {
          const lowerLeg = new THREE.Mesh(lowerLegGeo, armMat);
          lowerLeg.position.set(x, 0.1, 0);
          robotGroup.add(lowerLeg);
        });

        // Feet
        const footGeo = new THREE.BoxGeometry(0.11, 0.07, 0.16);
        [-0.13, 0.13].forEach((x) => {
          const foot = new THREE.Mesh(footGeo, sidePanelMat);
          foot.position.set(x, -0.08, 0.02);
          robotGroup.add(foot);
        });

        avatar.add(robotGroup);
        break;
      }

      case 'minimal': {
        const minHead = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.2, 1),
          skinMat
        );
        minHead.position.y = 1.65;
        minHead.castShadow = true;
        avatar.add(minHead);

        const minBody = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.25, 1),
          bodyMat
        );
        minBody.position.y = 1.05;
        minBody.castShadow = true;
        avatar.add(minBody);

        const leftMinEye = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.04, 0.02),
          new THREE.MeshStandardMaterial({ color: 0x333333 })
        );
        leftMinEye.position.set(-0.06, 1.68, 0.18);
        avatar.add(leftMinEye);
        const rightMinEye = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.04, 0.02),
          new THREE.MeshStandardMaterial({ color: 0x333333 })
        );
        rightMinEye.position.set(0.06, 1.68, 0.18);
        avatar.add(rightMinEye);
        break;
      }
    }
  }

  async saveAvatarSettings() {
    const activeStyle = document.querySelector('.style-btn.active');
    const primaryColor = document.getElementById('avatar-primary').value;
    const accentColor = document.getElementById('avatar-accent').value;

    const avatarData = {
      style: activeStyle?.dataset.style || 'default',
      primaryColor,
      accentColor,
      ...this.avatarData,
    };

    try {
      if (window.electronAPI) {
        await window.electronAPI.saveAvatarCustomization(avatarData);
        this.avatarData = avatarData;
        alert('Avatar settings saved!');
      }
    } catch (error) {
      console.error('[Avatar] Save error:', error);
      alert('Failed to save avatar settings');
    }
  }

  async loadParticipatedThreads() {
    // Don't try to load if not logged in
    if (!this.jwtToken || !this.currentUser) {
      console.log('[Profile] Not logged in, skipping threads load');
      const container = document.querySelector('.recent-threads');
      if (container) {
        container.innerHTML =
          '<p class="no-threads">Please log in to see your threads.</p>';
      }
      return;
    }

    try {
      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.jwtToken}`,
        },
        body: JSON.stringify({
          query: `
            query {
              myParticipatedThreads {
                id
                title
                content
                createdAt
                isPinned
                author {
                  id
                  userName
                }
                posts {
                  id
                  type
                  content
                  metadata
                }
              }
            }
          `,
        }),
      });

      const result = await response.json();
      const threads = result.data?.myParticipatedThreads || [];

      // Render threads in profile
      const container = document.getElementById('user-threads');
      if (container) {
        if (threads.length === 0) {
          container.innerHTML =
            '<p class="no-threads">You haven\'t created any threads yet.</p>';
        } else {
          container.innerHTML = threads
            .map((thread) => {
              // Check for video/image in first post
              let thumbnailHtml = '';
              const firstPost = thread.posts?.[0];

              // Check for YouTube URL in thread content OR first post content
              const contentToSearch =
                thread.content + ' ' + (firstPost?.content || '');
              const ytMatch = contentToSearch.match(
                /(https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[^\s]+)/
              );
              const ytShortMatch = contentToSearch.match(
                /(https?:\/\/youtu\.be\/[^\s]+)/
              );
              const videoUrl = ytMatch
                ? ytMatch[1]
                : ytShortMatch
                  ? ytShortMatch[1]
                  : null;

              if (firstPost?.metadata?.thumbnailUrl) {
                if (firstPost.type === 'VIDEO') {
                  // Use actual YouTube URL if found, otherwise use thumbnail as last resort
                  const openUrl = videoUrl || firstPost.metadata.thumbnailUrl;
                  thumbnailHtml = `<div class="thread-thumb clickable" data-url="${openUrl}" style="cursor:pointer"><img src="${firstPost.metadata.thumbnailUrl}" alt="" /><span class="video-badge">🎬 Click to Open</span></div>`;
                } else if (firstPost.type === 'IMAGE') {
                  thumbnailHtml = `<div class="thread-thumb"><img src="${firstPost.metadata.thumbnailUrl}" alt="" /></div>`;
                }
              }

              // Check for URLs in content
              let urlLink = '';
              const urlMatch = (thread.content || '').match(
                /(https?:\/\/[^\s]+)/g
              );
              if (urlMatch && urlMatch[0]) {
                urlLink = `<span class="url-indicator clickable" data-url="${urlMatch[0]}">🔗 Open Link</span>`;
              }

              return `
              <div class="thread-item" onclick="theRevApp.openThread('${thread.id}')">
                ${thumbnailHtml}
                <span class="thread-title">${thread.title}</span>
                <div class="thread-meta">
                  <span class="thread-author">by @${thread.author?.userName || 'Unknown'}</span>
                  <span class="thread-date">${new Date(thread.createdAt).toLocaleDateString()}</span>
                  ${urlLink}
                </div>
              </div>
            `;
            })
            .join('');

          // Add click handlers for video thumbnails and URLs
          container
            .querySelectorAll(
              '.thread-thumb.clickable, .url-indicator.clickable'
            )
            .forEach((el) => {
              el.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = el.dataset.url;
                if (url) theRevApp.showOpenModeModal(url, '', 'Video');
              });
            });
        }
      }
    } catch (error) {
      console.error('Error loading participated threads:', error);
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

      // If there's a saved VRM, load it for the browser avatar
      if (this.avatarData?.fileName) {
        const vrmResult = await window.electronAPI.loadVrmFile(
          this.avatarData.fileName
        );
        if (vrmResult.success && vrmResult.dataUrl) {
          console.log('[Avatar] Loaded saved VRM for browser');
          this._savedVrmDataUrl = vrmResult.dataUrl;
          // Browser tab avatar disabled - avatar lives in AI Browser popup instead
          // this.renderBrowserAvatar(vrmResult.dataUrl);
        }
      }
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

  showAnimationsModal() {
    const panel = document.getElementById('animations-panel');
    if (panel) {
      panel.classList.add('active');
      this.renderAnimationButtons();
    }
  }

  closeAnimationsModal() {
    const panel = document.getElementById('animations-panel');
    if (panel) {
      panel.classList.remove('active');
    }
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

  async handleProfilePicUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result;

        // Upload to server
        const response = await fetch(
          'http://localhost:4000/api/profile/upload',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: base64,
              userId: this.currentUser?.id,
              fileName: file.name,
            }),
          }
        );

        const result = await response.json();

        if (result.success) {
          // Update profile pic display
          const profileImg = document.getElementById('profile-avatar-img');
          if (profileImg) {
            profileImg.src = 'http://localhost:4000' + result.imageUrl;
          }

          // Update header avatar too
          const headerAvatar = document.getElementById('user-avatar');
          if (headerAvatar) {
            headerAvatar.src = 'http://localhost:4000' + result.imageUrl;
          }

          alert('Profile photo updated!');
        } else {
          alert(result.error || 'Failed to upload image');
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Profile pic upload error:', error);
      alert('Failed to upload image');
    }

    // Reset input so same file can be selected again
    event.target.value = '';
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
    const command = input.value.trim();
    if (!command) return;

    const statusEl = document.getElementById('browser-status');
    const statusText = statusEl?.querySelector('.status-text');
    const aiResponseArea = document.getElementById('ai-response-area');
    const aiResponseText = document.getElementById('ai-response-text');
    const aiApprovalSection = document.getElementById('ai-approval-section');

    if (statusText) statusText.textContent = '🤖 Rev is thinking...';
    if (aiResponseArea) aiResponseArea.style.display = 'none';

    this.showAITypingIndicator();
    this.showAISpeechBubble('🤔 Thinking...', 0);

    try {
      if (window.electronAPI?.['ai-brain:execute']) {
        const result = await window.electronAPI['ai-brain:execute']({
          task: command,
          userId: 'local-user',
        });

        console.log('AI Brain result:', result);

        this.hideAITypingIndicator();

        if (result.success) {
          if (result.approvalRequest) {
            this.showApprovalRequest(result.approvalRequest);
            this.avatarReact('thinking', 'Should I do this?');
            this.showAISpeechBubble('🤔 Need your approval...', 4000);
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
          } else if (result.url) {
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
          } else if (result.url) {
            // Navigation intent - open AI Browser immediately with URL and context
            console.log('[executeAICommand] Opening AI Browser with URL:', result.url);
            
            // Extract context for the chat
            const context = result.context || `Navigating to: ${result.url}`;
            
            if (window.electronAPI?.openAIBrowser) {
              await window.electronAPI.openAIBrowser(result.url, context);
            }
            
            // AI Avatar: Show success
            this.showAISpeechBubble('✅ Opening!', 2000);
            if (aiResponseText) {
              aiResponseText.textContent = `Opening ${result.url}`;
            }
            if (aiApprovalSection) aiApprovalSection.style.display = 'none';
            if (aiResponseArea) aiResponseArea.style.display = 'block';
            if (statusText) statusText.textContent = '✅ Opening AI Browser...';
            input.value = '';
          } else if (result.actions) {
            // AI Avatar: Show success
            this.showAISpeechBubble('✅ Done!', 3000);
            if (aiResponseText)
              aiResponseText.textContent = `Executed: ${result.actions.map((a) => a.type).join(', ')}`;
            if (aiApprovalSection) aiApprovalSection.style.display = 'none';
            if (aiResponseArea) aiResponseArea.style.display = 'block';
            if (statusText) statusText.textContent = '✅ Done';
            input.value = '';
          }
        } else {
          // AI Avatar: Show error
          this.showAISpeechBubble('❌ Oops, something went wrong...', 4000);
          if (aiResponseText)
            aiResponseText.textContent = 'Error: ' + (result.error || 'Failed');
          if (aiResponseArea) aiResponseArea.style.display = 'block';
          if (statusText)
            statusText.textContent = 'Error: ' + (result.error || 'Failed');
        }
      }
    } catch (error) {
      // AI Avatar: Show error on catch
      this.hideAITypingIndicator();
      this.showAISpeechBubble('❌ Error occurred', 4000);
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
      // AI Avatar: Show sad/rejected reaction
      this.showAISpeechBubble('😕 Maybe next time...', 3000);
      if (statusText) statusText.textContent = '❌ Denied';
      if (aiResponseText) aiResponseText.textContent = 'Action denied';
      if (aiApprovalSection) aiApprovalSection.style.display = 'none';
      this.currentApprovalRequest = null;
      return;
    }

    // Approved - extract URL from actions and open AI browser
    // AI Avatar: Show excited reaction
    this.showAISpeechBubble("🎉 Let's go!", 3000);
    if (statusText) statusText.textContent = '✅ Opening AI Browser...';

    // Extract URL from navigate action
    let targetUrl = null;
    const actions = this.currentApprovalRequest.actions || [];
    for (const action of actions) {
      if (action.action === 'navigate' && action.params?.url) {
        targetUrl = action.params.url;
        break;
      }
    }

    console.log('[respondToApproval] Target URL:', targetUrl);

    try {
      // Use IPC to open the AI browser window with URL
      if (window.electronAPI?.openAIBrowser) {
        await window.electronAPI.openAIBrowser(targetUrl);
        if (statusText) statusText.textContent = '✅ AI Browser opened!';
        if (aiResponseText)
          aiResponseText.textContent = targetUrl
            ? `Opening ${targetUrl}...`
            : 'AI Browser opened - you can now chat with Rev there!';
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
    if (!this.jwtToken || !this.currentUser) {
      alert('Please log in to create a thread');
      return;
    }
    document.getElementById('create-thread-modal').classList.add('active');
    document.getElementById('create-thread-error').style.display = 'none';
  }

  closeCreateThreadModal() {
    document.getElementById('create-thread-modal').classList.remove('active');
    document.getElementById('create-thread-form').reset();
    document.getElementById('create-thread-error').style.display = 'none';
  }

  async submitCreateThread(e) {
    e.preventDefault();

    if (!this.jwtToken || !this.currentUser) {
      alert('Please log in to create a thread');
      return;
    }

    const title = document.getElementById('thread-title').value;
    const content = document.getElementById('thread-content').value;
    const type = document.getElementById('thread-type').value;
    const errorEl = document.getElementById('create-thread-error');

    try {
      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.jwtToken}`,
        },
        body: JSON.stringify({
          query: `
            mutation CreateThread($input: CreateThreadInput!) {
              createThread(input: $input) {
                id
                title
                content
                createdAt
              }
            }
          `,
          variables: {
            input: { title, content, type },
          },
        }),
      });

      const result = await response.json();
      console.log('[CreateThread] Result:', result);

      if (result.errors) {
        console.error(
          '[CreateThread] GraphQL errors:',
          JSON.stringify(result.errors, null, 2)
        );
        errorEl.textContent =
          result.errors[0].message || 'Failed to create thread';
        errorEl.style.display = 'block';
        return;
      }

      if (result.data?.createThread) {
        this.closeCreateThreadModal();
        this.loadThreads();
      }
    } catch (error) {
      errorEl.textContent = error.message || 'Failed to create thread';
      errorEl.style.display = 'block';
    }
  }

  openCreatePostModal(threadId, parentId = null, parentAuthorName = null) {
    if (!this.jwtToken || !this.currentUser) {
      alert('Please log in to reply');
      return;
    }
    document.getElementById('post-thread-id').value = threadId;
    document.getElementById('post-parent-id').value = parentId || '';

    const replyIndicator = document.getElementById('reply-to-indicator');
    if (parentId && parentAuthorName) {
      document.getElementById('reply-to-author').textContent =
        '@' + parentAuthorName;
      replyIndicator.style.display = 'block';
    } else {
      replyIndicator.style.display = 'none';
    }

    document.getElementById('create-post-modal').classList.add('active');
    document.getElementById('create-post-error').style.display = 'none';
  }

  clearReplyTo() {
    document.getElementById('post-parent-id').value = '';
    document.getElementById('reply-to-indicator').style.display = 'none';
  }

  closeCreatePostModal() {
    document.getElementById('create-post-modal').classList.remove('active');
    document.getElementById('create-post-form').reset();
    document.getElementById('create-post-error').style.display = 'none';
    this.clearReplyTo();
  }

  async submitCreatePost(e) {
    e.preventDefault();

    if (!this.jwtToken || !this.currentUser) {
      alert('Please log in to reply');
      return;
    }

    const threadId = document.getElementById('post-thread-id').value;
    const parentId = document.getElementById('post-parent-id').value;
    const content = document.getElementById('post-content').value;
    const type = document.getElementById('post-type').value;
    const errorEl = document.getElementById('create-post-error');

    const input = { threadId, content, type };
    if (parentId) {
      input.parentId = parentId;
    }

    try {
      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.jwtToken}`,
        },
        body: JSON.stringify({
          query: `
            mutation CreatePost($input: CreatePostInput!) {
              createPost(input: $input) {
                id
                content
                createdAt
              }
            }
          `,
          variables: {
            input,
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      if (result.data?.createPost) {
        this.closeCreatePostModal();
        this.loadThreadDetail(threadId);
        this.loadThreads();
      }
    } catch (error) {
      errorEl.textContent = error.message || 'Failed to create post';
      errorEl.style.display = 'block';
    }
  }

  async togglePin(postId, shouldPin) {
    if (!this.jwtToken || !this.currentUser) {
      alert('Please log in to pin posts');
      return;
    }

    try {
      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.jwtToken}`,
        },
        body: JSON.stringify({
          query: `
            mutation TogglePin($input: UpdatePostPinnedInput!) {
              updatePostPin(input: $input) {
                id
                isPinned
              }
            }
          `,
          variables: {
            input: {
              id: postId,
              isPinned: shouldPin,
            },
          },
        }),
      });

      const result = await response.json();
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Refresh the thread to show updated pin status
      const threadId = document.getElementById('post-thread-id')?.value;
      if (threadId) {
        this.loadThreadDetail(threadId);
      }
    } catch (error) {
      console.error('Error toggling pin:', error);
      alert('Failed to toggle pin: ' + error.message);
    }
  }

  openThread(threadId) {
    console.log('[Thread] Opening thread:', threadId);
    this.loadThreadDetail(threadId);
  }

  async loadThreadDetail(threadId) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (this.jwtToken) {
        headers['Authorization'] = `Bearer ${this.jwtToken}`;
      }

      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `
            query GetThread($id: ID!) {
              getThread(data: { id: $id }) {
                id
                title
                content
                createdAt
                author {
                  id
                  userName
                }
                posts {
                  id
                  content
                  type
                  createdAt
                  author {
                    id
                    userName
                  }
                  metadata
                }
              }
            }
          `,
          variables: { id: threadId },
        }),
      });

      const result = await response.json();
      console.log('[Thread] getThread result:', result);
      const thread = result.data?.getThread;

      if (thread) {
        console.log(
          '[Thread] Thread found:',
          thread.title,
          'posts:',
          thread.posts?.length
        );
        this.showThreadModal(thread);
      } else {
        console.log('[Thread] No thread found for id:', threadId);
      }
    } catch (error) {
      console.error('Error loading thread:', error);
    }
  }

  showThreadModal(thread) {
    console.log('[ThreadModal] Showing modal for thread:', thread.title);
    const modal = document.getElementById('thread-detail-modal');
    const titleEl = document.getElementById('thread-detail-title');
    const postsEl = document.getElementById('thread-posts');

    // Close modal first if already open to reset state
    if (modal) {
      modal.classList.remove('active');
      // Small delay to allow DOM to reset
      setTimeout(() => {
        this._showThreadModalContent(thread);
      }, 50);
    } else {
      this._showThreadModalContent(thread);
    }
  }

  _showThreadModalContent(thread) {
    const modal = document.getElementById('thread-detail-modal');
    const titleEl = document.getElementById('thread-detail-title');
    const postsEl = document.getElementById('thread-posts');

    console.log('[ThreadModal] Modal element:', modal);
    console.log('[ThreadModal] Posts:', thread.posts?.length);
    console.log(
      '[ThreadModal] First post has replies:',
      thread.posts?.[0]?.replies?.length
    );
    if (thread.posts?.[0]?.replies?.length > 0) {
      console.log('[ThreadModal] First reply:', thread.posts[0].replies[0]);
    }
    console.log(
      '[ThreadModal] First post replies:',
      thread.posts?.[0]?.replies
    );

    if (titleEl) titleEl.textContent = thread.title;

    // Add reply button
    let replyButton = document.getElementById('thread-reply-btn');
    if (!replyButton) {
      replyButton = document.createElement('button');
      replyButton.id = 'thread-reply-btn';
      replyButton.className = 'primary-btn';
      replyButton.textContent = 'Add Reply';
      replyButton.style.marginTop = '15px';
      titleEl?.parentElement?.appendChild(replyButton);
    }
    replyButton.onclick = () => this.openCreatePostModal(thread.id);

    if (postsEl && thread.posts) {
      const renderPost = (post, depth = 0) => {
        const postType = post.type || 'TEXT';
        const isVideo = postType === 'VIDEO';
        const isImage = postType === 'IMAGE';
        const indent = depth * 30;

        let mediaContent = '';
        if (isVideo && post.metadata?.thumbnailUrl) {
          mediaContent = `<div class="post-media video"><img src="${post.metadata.thumbnailUrl}" alt="Video thumbnail" /><span class="media-badge">🎬 Video</span></div>`;
        } else if (isImage && post.metadata?.thumbnailUrl) {
          mediaContent = `<div class="post-media image"><img src="${post.metadata.thumbnailUrl}" alt="Post image" /></div>`;
        }

        let repliesHtml = '';
        if (post.replies && post.replies.length > 0) {
          repliesHtml = post.replies
            .map((reply) => renderPost(reply, depth + 1))
            .join('');
        }

        const isPinned = post.isPinned || false;

        return `
          <div class="post-card" style="margin-left: ${indent}px; border-left: ${depth > 0 ? '2px solid var(--border-color)' : 'none'};">
            <div class="post-header">
              <span class="post-author">@${post.author?.userName || 'Unknown'}</span>
              <span class="post-date">${new Date(post.createdAt).toLocaleString()}</span>
              <span class="post-type">${postType}</span>
              ${post.isPinned ? '<span class="pinned-badge">📌 Pinned</span>' : ''}
              <button class="reply-btn" onclick="theRevApp.openCreatePostModal('${thread.id}', '${post.id}', '${post.author?.userName || ''}')">Reply</button>
              ${this.currentUser && post.author?.id === this.currentUser.id ? `<button class="pin-btn" onclick="theRevApp.togglePin('${post.id}', ${!isPinned})">${isPinned ? '📌 Unpin' : '📌 Pin'}</button>` : ''}
            </div>
            <div class="post-content">
              ${post.content}
              ${mediaContent}
            </div>
            ${repliesHtml}
          </div>
        `;
      };

      postsEl.innerHTML = thread.posts
        .map((post) => renderPost(post, 0))
        .join('');

      // Add click handlers for video thumbnails
      postsEl.querySelectorAll('.post-media.video.clickable').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const url = el.dataset.url;
          if (url) this.showOpenModeModal(url, '', 'Video');
        });
      });
    }

    if (modal) modal.classList.add('active');
  }

  closeThreadModal() {
    const modal = document.getElementById('thread-detail-modal');
    if (modal) modal.classList.remove('active');
  }

  async refreshNewsFeed() {
    console.log('Refreshing news feed...');
    const btn = document.getElementById('news-refresh-btn');
    const container = document.querySelector('.news-container');

    if (btn) {
      btn.disabled = true;
      btn.textContent = '↻ Syncing...';
    }
    if (container) {
      container.innerHTML = '<div class="loading">Syncing feeds...</div>';
    }

    try {
      const syncResponse = await fetch('http://localhost:4000/api/news/sync', {
        method: 'POST',
      });
      const syncResult = await syncResponse.json();
      console.log('News sync result:', syncResult);
      await this.loadNews();
    } catch (error) {
      console.error('Error refreshing news:', error);
      if (container) {
        container.innerHTML = '<div class="error">Failed to sync news</div>';
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '↻ Refresh';
      }
    }
  }

  async loadNews(useCache = false) {
    const container = document.querySelector('.news-container');
    if (!container) return;

    // Check cache first
    if (useCache && this._tabCache.news.rawData) {
      this.renderNews(this._tabCache.news.rawData);
      return;
    }

    container.innerHTML = '<div class="loading">Loading news...</div>';

    try {
      const newsType = this.currentNewsType || 'article';
      const typeParam = newsType === 'video' ? 'video' : 'article';

      const url = new URL('http://localhost:4000/api/news');
      url.searchParams.set('type', typeParam);

      const response = await fetch(url.toString());
      const news = await response.json();

      if (!news || news.length === 0) {
        container.innerHTML =
          '<div class="empty-state">No news available. Click refresh to fetch latest news.</div>';
        return;
      }

      this.renderNews(news);

      // Save to cache
      this._tabCache.news = {
        data: container.innerHTML,
        rawData: news,
        timestamp: Date.now()
      };
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
      'Secular Talk': { bg: '#0066cc', letter: 'ST' },
      'Breaking Points': { bg: '#ff6600', letter: 'BP' },
      'The Young Turks': { bg: '#cc0000', letter: 'TYT' },
      'Sabby Sabs': { bg: '#9933cc', letter: 'SS' },
      'Bad Faith': { bg: '#333333', letter: 'BF' },
      'The Majority Report': { bg: '#0066cc', letter: 'MR' },
      'Marc Lamont Hill': { bg: '#cc9900', letter: 'MLH' },
      'Thom Hartman': { bg: '#0066cc', letter: 'TH' },
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
                window.electronAPI
                  .updateAIChatWithSummary(summary)
                  .then((result) => {
                    console.log('updateAIChatWithSummary result:', result);
                  })
                  .catch((err) => {
                    console.error('Error updating AI chat:', err);
                  });
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
    // Load threads on startup if logged in
    if (this.jwtToken) {
      this.loadThreads();
    }
  }

  async fetchGraphQLData() {
    try {
      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.jwtToken ? `Bearer ${this.jwtToken}` : '',
        },
        body: JSON.stringify({
          query: `
            query {
              listThreads {
                id
                title
                content
                author {
                  userName
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

// Initialize the app - handle both cases: DOM already loaded or still loading
let theRevApp;
function initApp() {
  console.log('[TheRev] Starting app initialization...');
  try {
    theRevApp = new TheRevApp();
    window.theRevApp = theRevApp;
    console.log('[TheRev] App initialized successfully');
  } catch (e) {
    console.error('[TheRev] Error initializing app:', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  // DOM already loaded, init immediately
  initApp();
}

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
