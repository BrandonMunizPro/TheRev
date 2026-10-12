import {
  renderMessageList,
  textElement,
  compareMessages,
  compareCursors,
} from './MessagingUI.js';

const fields =
  'id content cursor senderId senderUserName senderFirstName senderLastName senderAvatarUrl channelId serverId isRead reactions { emoji users } createdAt';

export class MessagingController {
  constructor(app) {
    this.app = app;
    this.version = 0;
    this.messages = new Map();
    this.live = null;
    this.retry = null;
    this.refreshTimer = null;
    this.syncing = false;
    this.dirty = false;
    this.active = null;
    this.lastRead = null;
    this.hasMore = false;
    this.oldestCursor = null;
  }

  async request(query, variables = {}) {
    const token = this.app.jwtToken;
    if (!token || !this.app.currentUser) throw new Error('Please sign in');
    const response = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok)
      throw new Error(`Messaging request failed (${response.status})`);
    const result = await response.json();
    if (result.errors)
      throw new Error(result.errors.map((error) => error.message).join('; '));
    if (this.app.jwtToken !== token) throw new Error('Session changed');
    return result.data;
  }

  select(active) {
    this.active = active;
    this.version++;
    this.messages.clear();
    this.lastRead = null;
    this.oldestCursor = null;
    this.hasMore = false;
    this.render();
    this.start();
    return this.refresh();
  }

  async page(active, before) {
    if (active.type === 'channel') {
      const data = await this.request(
        `query Messages($id: ID!, $before: String) { getChannelMessages(channelId: $id, before: $before, limit: 50) { ${fields} } }`,
        { id: active.id, before }
      );
      return data.getChannelMessages;
    }
    const data = await this.request(
      `query Messages($user: ID!, $id: ID!, $before: String) { getDirectMessages(userId: $user, otherUserId: $id, before: $before, limit: 50) { ${fields} } }`,
      { user: this.app.currentUser.id, id: active.id, before }
    );
    return data.getDirectMessages;
  }

  async refresh() {
    if (!this.active) return;
    const version = this.version;
    if (this.olderJob?.version === version) {
      this.olderJob.refresh = true;
      return this.olderJob.promise;
    }
    if (this.refreshJob?.version === version) {
      this.refreshJob.again = true;
      return this.refreshJob.promise;
    }
    const job = { version, again: false };
    job.promise = this.refreshPages(version).finally(() => {
      if (this.refreshJob === job) this.refreshJob = null;
      if (job.again && version === this.version) this.scheduleSync();
    });
    this.refreshJob = job;
    return job.promise;
  }

  async refreshPages(version) {
    const active = this.active;
    try {
      const initial = this.messages.size === 0;
      let before;
      const loaded = [];
      // Reconcile every loaded page, including older edits/deletions and reconnect gaps.
      do {
        const page = await this.page(active, before);
        if (version !== this.version) return;
        loaded.push(...page);
        this.hasMore = page.length === 50;
        before = page.at(-1)?.cursor;
        if (
          !this.hasMore ||
          initial ||
          (this.oldestCursor &&
            before &&
            compareCursors(before, this.oldestCursor) <= 0)
        )
          break;
      } while (before);
      this.messages = new Map(loaded.map((message) => [message.id, message]));
      this.oldestCursor = loaded.at(-1)?.cursor || null;
      this.render();
      if (initial) {
        const container = document.getElementById('channel-messages');
        if (container) container.scrollTop = container.scrollHeight;
      }
      await this.markRead(version);
    } catch (error) {
      if (version !== this.version) return;
      this.error(error);
    }
  }

  async older() {
    if (
      !this.active ||
      !this.hasMore ||
      this.olderJob?.version === this.version
    )
      return;
    const version = this.version;
    const job = { version, refresh: false };
    job.promise = this.olderPage(version).finally(() => {
      if (this.olderJob === job) this.olderJob = null;
      if (job.refresh && version === this.version) this.scheduleSync();
    });
    this.olderJob = job;
    return job.promise;
  }

  async olderPage(version) {
    try {
      if (this.refreshJob) await this.refreshJob.promise;
      if (version !== this.version) return;
      const page = await this.page(this.active, this.oldestCursor);
      if (version !== this.version) return;
      for (const message of page) this.messages.set(message.id, message);
      this.oldestCursor = page.at(-1)?.cursor || this.oldestCursor;
      this.hasMore = page.length === 50;
      this.render();
    } catch (error) {
      if (version === this.version) this.error(error);
    }
  }

  render() {
    const container = document.getElementById('channel-messages');
    if (!container) return;
    // Cursor encodes the exact database timestamp; API pages already arrive newest first.
    const messages = [...this.messages.values()].sort(compareMessages);
    renderMessageList(container, messages, this.app.currentUser?.id, {
      edit: (message) => this.edit(message),
      delete: (message) => this.remove(message),
    });
    if (this.hasMore) {
      const button = textElement(
        'button',
        'secondary-btn',
        'Load older messages'
      );
      button.addEventListener('click', () => this.older());
      container.prepend(button);
    }
  }

  async markRead(version = this.version) {
    if (
      version !== this.version ||
      !this.active ||
      this.app.currentSection !== 'messages' ||
      document.visibilityState === 'hidden' ||
      !document.hasFocus()
    )
      return;
    const newest = [...this.messages.values()].sort(compareMessages).at(-1);
    if (!newest || this.lastRead === newest.id) return;
    const active = this.active;
    await this.request(
      'mutation Read($through: ID!, $channel: ID, $other: ID) { markConversationRead(throughMessageId: $through, channelId: $channel, otherUserId: $other) }',
      {
        through: newest.id,
        channel: active.type === 'channel' ? active.id : null,
        other: active.type === 'dm' ? active.id : null,
      }
    );
    if (version !== this.version) return;
    this.lastRead = newest.id;
    await this.app.loadConversations();
    if (active.type === 'channel')
      await this.app.loadServerDetails(active.serverId);
  }

  async edit(message) {
    const content = prompt('Edit message', message.content);
    if (content === null || !content.trim()) return;
    try {
      await this.request(
        'mutation Edit($id: ID!, $content: String!) { editMessage(messageId: $id, content: $content) { id } }',
        { id: message.id, content }
      );
      await this.refresh();
    } catch (error) {
      this.error(error);
    }
  }

  async remove(message) {
    if (!confirm('Delete this message?')) return;
    try {
      await this.request(
        'mutation Delete($id: ID!, $user: ID!) { deleteMessage(messageId: $id, userId: $user) }',
        { id: message.id, user: this.app.currentUser.id }
      );
      await this.refresh();
      await this.app.loadConversations();
    } catch (error) {
      this.error(error);
    }
  }

  error(error) {
    this.app.showSpeechBubble(
      error.message || 'Messaging request failed',
      5000
    );
  }

  scheduleSync() {
    this.dirty = true;
    if (this.refreshTimer || this.syncing) return;
    this.refreshTimer = setTimeout(async () => {
      this.refreshTimer = null;
      this.syncing = true;
      this.dirty = false;
      try {
        await this.app.loadServers();
        await this.app.loadConversations();
        await this.refresh();
        if (this.active?.type === 'channel')
          await this.app.loadServerDetails(this.active.serverId);
      } finally {
        this.syncing = false;
        if (this.dirty) this.scheduleSync();
      }
    }, 100);
  }

  start() {
    if (this.live || this.retry || !this.app.jwtToken) return;
    const controller = new AbortController();
    this.live = controller;
    const token = this.app.jwtToken;
    void (async () => {
      try {
        const response = await fetch(
          'http://localhost:4000/api/messages/events',
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }
        );
        if (response.status === 401) {
          this.app.clearAuthSession();
          this.error(new Error('Your session expired. Please sign in again.'));
          return;
        }
        if (!response.ok || !response.body)
          throw new Error(`Live messages unavailable (${response.status})`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder
            .decode(value, { stream: true })
            .replace(/\r\n/g, '\n');
          let end;
          while ((end = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (/^event: (message|ready)$/m.test(frame)) this.scheduleSync();
          }
          if (buffer.length > 65536)
            throw new Error('Invalid live message stream');
        }
      } catch (error) {
        if (!controller.signal.aborted)
          console.warn('[Messages] Reconnecting live updates:', error.message);
      } finally {
        if (this.live === controller) this.live = null;
        if (!controller.signal.aborted && this.app.jwtToken === token) {
          this.retry = setTimeout(() => {
            this.retry = null;
            this.start();
          }, 2000);
        }
      }
    })();
  }

  stop() {
    this.live?.abort();
    this.live = null;
    clearTimeout(this.retry);
    clearTimeout(this.refreshTimer);
    this.retry = this.refreshTimer = null;
    this.active = null;
    this.version++;
    this.messages.clear();
    this.dirty = false;
    this.lastRead = null;
    this.oldestCursor = null;
    this.hasMore = false;
  }
}
