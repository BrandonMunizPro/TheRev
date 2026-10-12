export function textElement(tag, className, text = '') {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = String(text ?? '');
  return element;
}

export function safeImage(value, className, label) {
  const image = textElement('img', className);
  image.alt = String(label ?? '');
  image.src = 'assets/default-avatar.svg';
  try {
    if (value) {
      const url = new URL(value, 'http://localhost:4000');
      if (url.protocol === 'http:' || url.protocol === 'https:')
        image.src = url.href;
    }
  } catch {
    /* Keep the default image. */
  }
  image.addEventListener(
    'error',
    () => {
      image.src = 'assets/default-avatar.svg';
    },
    { once: true }
  );
  return image;
}

export function compareMessages(a, b) {
  const time = (message) => {
    try {
      return JSON.parse(
        atob(message.cursor.replace(/-/g, '+').replace(/_/g, '/'))
      ).createdAt;
    } catch {
      return new Date(message.createdAt).toISOString();
    }
  };
  return time(a).localeCompare(time(b)) || a.id.localeCompare(b.id);
}

export function compareCursors(first, second) {
  const decode = (cursor) =>
    JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
  const a = decode(first),
    b = decode(second);
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

// Preserve plaintext/newlines and HTTP(S) links. Never interpret user HTML.
export function renderMessageText(content) {
  const element = textElement('div', 'message-text');
  element.style.whiteSpace = 'pre-wrap';
  element.style.overflowWrap = 'anywhere';
  const text = String(content ?? '');
  const urls = /https?:\/\/[^\s<>"']+/g;
  let offset = 0;
  for (const match of text.matchAll(urls)) {
    element.append(document.createTextNode(text.slice(offset, match.index)));
    const link = textElement('a', '', match[0]);
    link.href = match[0];
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    element.append(link);
    offset = match.index + match[0].length;
  }
  element.append(document.createTextNode(text.slice(offset)));
  return element;
}

export function renderMessageList(
  container,
  messages,
  currentUserId,
  actions = {}
) {
  const nodes = [];
  for (const message of messages) {
    const row = textElement('div', 'message-item');
    row.dataset.messageId = message.id;
    row.append(
      textElement(
        'div',
        'message-avatar',
        (message.senderFirstName || message.senderUserName || '?').charAt(0)
      )
    );
    const body = textElement('div', 'message-content');
    const header = textElement('div', 'message-header');
    header.append(
      textElement(
        'span',
        'message-author',
        [
          message.senderFirstName || message.senderUserName,
          message.senderLastName,
        ]
          .filter(Boolean)
          .join(' ')
      )
    );
    header.append(
      textElement(
        'span',
        'message-timestamp',
        new Date(message.createdAt).toLocaleString()
      )
    );
    if (!message.channelId && message.senderId === currentUserId)
      header.append(
        textElement(
          'span',
          'message-read-status',
          message.isRead ? 'Read' : 'Sent'
        )
      );
    if (message.senderId === currentUserId) {
      for (const [label, action] of [
        ['Edit', actions.edit],
        ['Delete', actions.delete],
      ]) {
        if (!action) continue;
        const button = textElement('button', 'message-action', label);
        button.type = 'button';
        button.addEventListener('click', () => action(message));
        header.append(button);
      }
    }
    body.append(header, renderMessageText(message.content));
    const reactions = textElement('div', 'message-reactions');
    for (const reaction of message.reactions || [])
      reactions.append(
        textElement(
          'span',
          'reaction-badge',
          `${reaction.emoji} ${reaction.users.length}`
        )
      );
    body.append(reactions);
    row.append(body);
    nodes.push(row);
  }
  if (!nodes.length)
    nodes.push(
      textElement(
        'div',
        'empty-state',
        'No messages yet. Start the conversation!'
      )
    );
  container.replaceChildren(...nodes);
}

export function messageDestination(app) {
  if (app.currentDMUserId) return { recipientId: app.currentDMUserId };
  if (app.currentChannelId && app.currentServerId)
    return { channelId: app.currentChannelId, serverId: app.currentServerId };
  throw new Error('Select a channel or direct conversation first');
}
