// VS Code API
const vscode = acquireVsCodeApi();

// Application state
let state = {
  sessions: new Map(),
  activeSessionId: null,
  contextMenuVisible: false
};

// Message handling
window.addEventListener('message', event => {
  const message = event.data;
  handleExtensionMessage(message);
});

function handleExtensionMessage(message) {
  switch (message.type) {
    case 'updateSession':
      handleUpdateSession(message.payload);
      break;
    case 'showProgress':
      handleShowProgress(message.payload);
      break;
    case 'renderMarkdown':
      handleRenderMarkdown(message.payload);
      break;
    case 'updateConfig':
      handleUpdateConfig(message.payload);
      break;
    case 'showError':
      handleShowError(message.payload);
      break;
    default:
      console.warn('Unknown message type:', message.type);
  }
}

function handleUpdateSession(payload) {
  if (payload.sessionId) {
    if (!state.sessions.has(payload.sessionId)) {
      state.sessions.set(payload.sessionId, {
        id: payload.sessionId,
        title: payload.title || `Session ${payload.sessionId.slice(-4)}`,
        type: payload.type || 'conversation',
        messages: [],
        isActive: false,
        metadata: {}
      });
    }
    
    const session = state.sessions.get(payload.sessionId);
    Object.assign(session, payload);
    
    if (payload.message) {
      session.messages.push(payload.message);
    }
    
    if (payload.isActive) {
      state.activeSessionId = payload.sessionId;
    }
    
    renderApp();
  }
}

function handleShowProgress(payload) {
  // TODO: Implement progress display
  console.log('Show progress:', payload);
}

function handleRenderMarkdown(payload) {
  // TODO: Implement markdown rendering
  console.log('Render markdown:', payload);
}

function handleUpdateConfig(payload) {
  // TODO: Implement config updates
  console.log('Update config:', payload);
}

function handleShowError(payload) {
  // TODO: Implement error display
  console.error('Extension error:', payload);
}

// UI Event handlers
function sendMessage(sessionId, message, contextItems = []) {
  if (!message.trim()) return;
  
  postMessage({
    type: 'sendMessage',
    payload: { sessionId, message, contextItems }
  });
  
  // Clear input
  const input = document.getElementById('message-input');
  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }
}

function switchSession(sessionId) {
  postMessage({
    type: 'switchSession',
    payload: { sessionId }
  });
}

function createSession(type = 'conversation') {
  postMessage({
    type: 'createSession',
    payload: { type }
  });
}

function closeSession(sessionId) {
  postMessage({
    type: 'closeSession',
    payload: { sessionId }
  });
}

function openConfig(type) {
  postMessage({
    type: 'openConfig',
    payload: { type }
  });
}

function addContext(type, content) {
  postMessage({
    type: 'addContext',
    payload: { type, content }
  });
}

function switchAgent(sessionId, agentId, phase) {
  postMessage({
    type: 'switchAgent',
    payload: { sessionId, agentId, phase }
  });
}

function postMessage(message) {
  vscode.postMessage(message);
}

// Rendering functions
function renderApp() {
  const app = document.getElementById('app');
  if (!app) return;
  
  const activeSession = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
  
  app.innerHTML = `
    <div class="session-tabs">
      ${renderSessionTabs()}
      <div class="session-controls">
        <button class="session-control-btn" onclick="createSession('conversation')">New</button>
        <button class="session-control-btn" onclick="showSessionHistory()">History</button>
      </div>
    </div>
    
    <div class="chat-output" id="chat-output">
      ${activeSession ? renderChatOutput(activeSession) : renderWelcome()}
    </div>
    
    <div class="input-area">
      ${renderPhaseAlert()}
      ${renderInputContainer()}
      ${renderToolbar()}
    </div>
  `;
  
  // Scroll to bottom of chat
  const chatOutput = document.getElementById('chat-output');
  if (chatOutput) {
    chatOutput.scrollTop = chatOutput.scrollHeight;
  }
  
  // Setup input handlers
  setupInputHandlers();
}

function renderSessionTabs() {
  const sessions = Array.from(state.sessions.values());
  if (sessions.length === 0) return '';
  
  return sessions.map(session => `
    <button class="session-tab ${session.id === state.activeSessionId ? 'active' : ''}" 
            onclick="switchSession('${session.id}')">
      <span class="session-tab-title">${escapeHtml(session.title)}</span>
      <button class="session-tab-close" onclick="event.stopPropagation(); closeSession('${session.id}')">&times;</button>
    </button>
  `).join('');
}

function renderChatOutput(session) {
  if (session.type === 'configuration') {
    return renderConfigScreen(session);
  }
  
  if (session.messages.length === 0) {
    return `
      <div class="chat-message">
        <div class="chat-message-content">
          Welcome to your new session! Start by typing a message below.
        </div>
      </div>
    `;
  }
  
  return session.messages.map(message => `
    <div class="chat-message ${message.sender}">
      <div class="chat-message-header">
        <span>${message.sender === 'user' ? 'You' : 'Agent'}</span>
        <span>${new Date(message.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="chat-message-content">
        ${escapeHtml(message.content)}
      </div>
    </div>
  `).join('');
}

function renderWelcome() {
  return `
    <div class="chat-message">
      <div class="chat-message-content">
        <h3>Welcome to Comrade!</h3>
        <p>Create a new session to get started with your AI coding assistant.</p>
        <button class="config-btn primary" onclick="createSession('conversation')">Start New Session</button>
      </div>
    </div>
  `;
}

function renderConfigScreen(session) {
  // TODO: Implement configuration screens
  return `
    <div class="config-screen">
      <h2>Configuration: ${session.title}</h2>
      <p>Configuration interface will be implemented here.</p>
    </div>
  `;
}

function renderPhaseAlert() {
  // TODO: Implement phase alerts based on session state
  return '';
}

function renderInputContainer() {
  return `
    <div class="input-container">
      <textarea id="message-input" 
                class="input-text" 
                placeholder="Type your message here..."
                rows="3"></textarea>
      <button id="send-button" class="input-send-btn" onclick="handleSendClick()">Send</button>
    </div>
  `;
}

function renderToolbar() {
  return `
    <div class="toolbar">
      <div style="position: relative;">
        <button class="toolbar-btn" id="context-btn" onclick="toggleContextMenu()">
          # <span>Add Context</span>
        </button>
        <div id="context-menu" class="context-menu hidden">
          <button class="context-menu-item" onclick="addContext('file'); hideContextMenu()">📄 File</button>
          <button class="context-menu-item" onclick="addContext('selection'); hideContextMenu()">📝 Selection</button>
          <button class="context-menu-item" onclick="addContext('image'); hideContextMenu()">🖼️ Image</button>
          <button class="context-menu-item" onclick="addContext('workspace'); hideContextMenu()">📁 Workspace</button>
        </div>
      </div>
      
      <select class="toolbar-select" id="agent-select" onchange="handleAgentChange()">
        <option value="">Select Agent</option>
        <option value="gpt-4">GPT-4</option>
        <option value="claude">Claude</option>
      </select>
      
      <button class="toolbar-btn" onclick="showComradeMenu()">
        ⚙️ <span>Comrade</span>
      </button>
    </div>
  `;
}

// Event handlers
function setupInputHandlers() {
  const input = document.getElementById('message-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendClick();
      }
    });
    
    input.addEventListener('input', () => {
      // Auto-resize textarea
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    });
  }
}

function handleSendClick() {
  const input = document.getElementById('message-input');
  const message = input?.value?.trim();
  
  if (message && state.activeSessionId) {
    sendMessage(state.activeSessionId, message);
  }
}

function handleAgentChange() {
  const select = document.getElementById('agent-select');
  const agentId = select?.value;
  
  if (agentId && state.activeSessionId) {
    switchAgent(state.activeSessionId, agentId);
  }
}

function toggleContextMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) {
    menu.classList.toggle('hidden');
    state.contextMenuVisible = !menu.classList.contains('hidden');
  }
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) {
    menu.classList.add('hidden');
    state.contextMenuVisible = false;
  }
}

function showComradeMenu() {
  // TODO: Implement Comrade settings menu
  console.log('Show Comrade menu');
}

function showSessionHistory() {
  // TODO: Implement session history
  console.log('Show session history');
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Close context menu when clicking outside
document.addEventListener('click', (e) => {
  if (state.contextMenuVisible && !e.target.closest('#context-btn') && !e.target.closest('#context-menu')) {
    hideContextMenu();
  }
});

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  renderApp();
  
  // Create initial session for demo
  setTimeout(() => {
    createSession('conversation');
  }, 100);
});