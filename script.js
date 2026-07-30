(function () {
  const PROXY_URL = 'http://localhost:3000/gemini';
  const CRISIS_KEYWORDS = ['suicide', 'harm', 'end it', 'die', 'kill myself', 'crisis', 'emergency'];

  window.isWaitingForResponse = false;
  let chatBox, userInput, sendBtn, logoutBtn, newCheckInBtn;
  let quickMoodChecked = false;
  let chatState = 'initial';

  function getStorageKey(user) { return `mindwell_chat_${user}`; }
  
  function saveChatHistory(user, message, sender) {
    const key = getStorageKey(user);
    const history = JSON.parse(localStorage.getItem(key) || '[]');
    history.push({ message, sender, time: Date.now() });
    try { localStorage.setItem(key, JSON.stringify(history)); } catch (e) { console.warn('Storage error', e); }
  }
  
  function loadChatHistory(user) {
    const key = getStorageKey(user);
    return JSON.parse(localStorage.getItem(key) || '[]');
  }

  function createMessageDiv(html, sender) {
    const d = document.createElement('div');
    d.className = `message ${sender}-message`;
    d.innerHTML = html;
    return d;
  }

  function displayMessage(text, sender, saveToHistory = true) {
    if (!chatBox) return;
    const el = createMessageDiv(text, sender);
    chatBox.appendChild(el);
    chatBox.scrollTop = chatBox.scrollHeight;
    const loggedInUser = localStorage.getItem('mindwell_logged_in');
    if (saveToHistory && loggedInUser) saveChatHistory(loggedInUser, text, sender);
  }

  function displayOptions(options) {
    if (!chatBox) return;
    const container = document.createElement('div');
    container.className = 'quick-reply-options';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt;
      btn.onclick = () => {
        if (container.parentNode) container.parentNode.removeChild(container);
        sendMessage(opt);
      };
      container.appendChild(btn);
    });
    chatBox.appendChild(container);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return tmp.textContent || tmp.innerText || '';
  }

  function escapeHtml(unsafe) {
    return String(unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function getAIResponse(userMessage) {
    const loggedInUser = localStorage.getItem('mindwell_logged_in');
    const history = loggedInUser ? loadChatHistory(loggedInUser) : [];
    const recent = history.slice(-6).map(h => ({ 
      role: h.sender === 'user' ? 'user' : 'assistant', 
      parts: [{ text: stripHtml(h.message) }] 
    }));
    recent.push({ role: 'user', parts: [{ text: userMessage }] });

    const body = {
      contents: recent,
      systemInstruction: {
        parts: [{
          text: "Keep responses short and concise. Maximum 2-3 sentences. Be brief and helpful."
        }]
      },
      generationConfig: {
        temperature: 0.7,
        candidateCount: 1,
        maxOutputTokens: 100
      }
    };

    const controller = new AbortController();
    const TIMEOUT_MS = 20000;
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.error('Proxy error:', res.status);
        return { response: "AI not available. Try again.", options: ['Retry'] };
      }

      const data = await res.json();

      if (data.candidates && data.candidates.length) {
        const cand = data.candidates[0];
        if (cand.content && cand.content.parts) {
          const out = cand.content.parts.map(p => p.text || '').join('\n').trim();
          if (out) return { response: out, options: [] };
        }
      }

      return { response: "Got unexpected response. Try again.", options: ['Retry'] };

    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        return { response: "Request timed out. Try again.", options: ['Retry'] };
      }
      console.error('AI error:', err);
      return { response: "Unable to reach AI. Try again later.", options: ['Retry'] };
    }
  }

  async function processInput(message) {
    const lower = (message || '').toLowerCase();

    if (CRISIS_KEYWORDS.some(k => lower.includes(k))) {
      return {
        response: "🛑 Your safety matters. Call or Text 988 (National Suicide & Crisis Lifeline)",
        options: []
      };
    }

    if (chatState === 'quickmood') {
      if (!quickMoodChecked) {
        quickMoodChecked = true;
        if (["sad","stressed","anxious","tired","angry"].some(w => lower.includes(w))) {
          return { response: "I hear you. Try 3 deep breaths. Want grounding exercise?", options: ['Grounding','Music','Chat'] };
        } else if (lower.includes('happy') || lower.includes('energetic')) {
          return { response: "That's great! Want tips or chat?", options: ['Tips','Chat'] };
        } else {
          return { response: "Thanks for sharing. Tips, music, or chat?", options: ['Tips','Music','Chat'] };
        }
      }

      if (lower.includes('ground') || lower.includes('exercise')) {
        return { response: "<strong>5-4-3-2-1 Grounding:</strong> Name 5 things you see, 4 you touch, 3 you hear, 2 you smell, 1 you taste.", options:['Chat','Finish'] };
      }
      if (lower.includes('music')) {
        return { response: "<strong>Calming Music:</strong> <a href='https://www.youtube.com/watch?v=2OEL4P1Rz04' target='_blank'>Relaxing Piano</a>", options:['Chat','Finish'] };
      }
      if (lower.includes('finish')) {
        chatState = 'initial';
        quickMoodChecked = false;
        return { response: "Glad you checked in. I'm here anytime.", options:['Quick Mood Check-in','Help'] };
      }
      if (lower.includes('chat')) {
        chatState = 'initial';
        quickMoodChecked = false;
      } else {
        return { response: "Choose an option or type your message.", options: ['Grounding','Music','Chat','Finish'] };
      }
    }

    if (chatState === 'initial' && lower.includes('quick')) {
      chatState = 'quickmood';
      quickMoodChecked = false;
      return { response: "How are you feeling right now?", options: [] };
    }

    return await getAIResponse(message);
  }

  async function botResponse(message) {
    if (window.isWaitingForResponse) return;
    window.isWaitingForResponse = true;

    if (sendBtn) sendBtn.disabled = true;
    if (userInput) userInput.disabled = true;

    const thinking = createMessageDiv('<span style="opacity:.6; font-style:italic;">Thinking...</span>', 'bot');
    if (chatBox) chatBox.appendChild(thinking);

    try {
      const result = await processInput(message);
      if (chatBox && chatBox.contains(thinking)) chatBox.removeChild(thinking);
      if (result && result.response) displayMessage(result.response, 'bot');
      if (result && result.options && result.options.length) displayOptions(result.options);
    } catch (e) {
      console.error('Error:', e);
      if (chatBox && chatBox.contains(thinking)) chatBox.removeChild(thinking);
      displayMessage('An error occurred. Try again.', 'bot');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (userInput) { userInput.disabled = false; userInput.focus(); }
      window.isWaitingForResponse = false;
    }
  }

  function sendMessage(messageText) {
    const text = messageText || (userInput ? userInput.value.trim() : '');
    if (!text || window.isWaitingForResponse) return;

    displayMessage(escapeHtml(text), 'user');
    if (userInput) { userInput.value = ''; userInput.focus(); }
    
    if (text.toLowerCase().includes('quick')) chatState = 'quickmood';
    botResponse(text);
  }

  function startNewSession() {
    if (!chatBox) return;
    chatBox.innerHTML = '';
    quickMoodChecked = false;
    chatState = 'initial';

    const loggedInUser = localStorage.getItem('mindwell_logged_in');
    if (!loggedInUser) {
      location.href = 'login.html';
      return;
    }

    const history = loadChatHistory(loggedInUser);
    history.forEach(item => {
      displayMessage(item.message, item.sender, false);
    });

    if (history.length === 0) {
      setTimeout(() => {
        displayMessage("Welcome to <strong>MindWell</strong>! 💚 How can I help?", 'bot');
        displayOptions(['Quick Mood Check-in', 'Chat with AI', 'Music Suggestion']);
      }, 300);
    }
  }

  function initializeApp() {
    chatBox = document.getElementById('chat-box');
    userInput = document.getElementById('user-input');
    sendBtn = document.getElementById('send-btn');
    logoutBtn = document.getElementById('logout-btn');
    newCheckInBtn = document.getElementById('new-checkin-btn');

    const loggedInUser = localStorage.getItem('mindwell_logged_in');
    if (!loggedInUser) {
      alert('Please login first.');
      location.href = 'login.html';
      return;
    }

    if (sendBtn) {
      sendBtn.onclick = (e) => {
        e.preventDefault();
        if (!window.isWaitingForResponse && userInput && userInput.value.trim()) {
          sendMessage();
        }
      };
    }

    if (userInput) {
      userInput.onkeypress = (e) => {
        if (e.key === 'Enter' && !window.isWaitingForResponse && userInput.value.trim()) {
          e.preventDefault();
          sendMessage();
        }
      };
    }

    if (logoutBtn) {
      logoutBtn.onclick = () => {
        localStorage.removeItem('mindwell_logged_in');
        location.href = 'login.html';
      };
    }

    if (newCheckInBtn) {
      newCheckInBtn.onclick = (e) => {
        e.preventDefault();
        startNewSession();
      };
    }

    startNewSession();
    console.log('✅ MindWell Ready!');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }

  window.MindWell = {
    startNewSession,
    loadChatHistory,
    saveChatHistory,
    sendMessage
  };
})();
