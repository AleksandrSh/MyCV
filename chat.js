(function () {
  const API_URL = window.MYCV_CHAT_API || '/api/chat';
  const STORAGE_KEY = 'mycv-chat-messages-v1';

  const els = {
    root: document.getElementById('cv-chat'),
    panel: document.getElementById('cv-chat-panel'),
    toggle: document.getElementById('cv-chat-toggle'),
    close: document.getElementById('cv-chat-close'),
    messages: document.getElementById('cv-chat-messages'),
    form: document.getElementById('cv-chat-form'),
    input: document.getElementById('cv-chat-input'),
    send: document.getElementById('cv-chat-send'),
    status: document.getElementById('cv-chat-status'),
    suggestions: document.querySelectorAll('[data-cv-chat-suggestion]'),
  };

  if (!els.root) return;

  let messages = loadMessages();
  let isLoading = false;

  function loadMessages() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return getWelcomeMessages();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return getWelcomeMessages();
      return parsed;
    } catch {
      return getWelcomeMessages();
    }
  }

  function getWelcomeMessages() {
    return [
      {
        role: 'assistant',
        content:
          "Hi — I'm Alex's AI assistant. Ask me about his recruiting experience, technical sourcing tools, or the projects on this site. For a real conversation, email alshabanov27@gmail.com.",
      },
    ];
  }

  function saveMessages() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text || '';
  }

  function setOpen(open) {
    els.panel.classList.toggle('hidden', !open);
    els.panel.classList.toggle('flex', open);
    els.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      renderMessages();
      els.input.focus();
    }
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMessage(text) {
    const escaped = escapeHtml(text);
    const withBreaks = escaped.replace(/\n/g, '<br>');
    return withBreaks.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function renderMessages() {
    els.messages.innerHTML = messages
      .map((m) => {
        const isUser = m.role === 'user';
        const bubble = isUser
          ? 'bg-blue-600 text-white ml-8'
          : 'bg-slate-800 text-slate-200 mr-4 border border-slate-700';
        const isError = Boolean(m.isError);
        const label = isUser ? 'You' : isError ? 'Notice' : 'Alex (AI)';
        const errorBubble =
          'bg-amber-950/80 text-amber-100 mr-4 border border-amber-700/60';
        return `
          <div class="flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}">
            <span class="text-[10px] uppercase tracking-wider text-slate-500 font-bold px-1">${label}</span>
            <div class="rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[95%] ${isError ? errorBubble : bubble}">
              ${formatMessage(m.content)}
            </div>
          </div>`;
      })
      .join('');
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function setLoading(loading) {
    isLoading = loading;
    els.input.disabled = loading;
    els.send.disabled = loading;
    setStatus(loading ? 'Thinking…' : '');
  }

  function getApiMessages() {
    const filtered = messages.filter(
      (m) => (m.role === 'user' || m.role === 'assistant') && !m.isError
    );
    while (filtered.length > 0 && filtered[0].role === 'assistant') {
      filtered.shift();
    }
    return filtered;
  }

  async function sendUserMessage(text) {
    const content = text.trim();
    if (!content || isLoading) return;

    messages.push({ role: 'user', content });
    saveMessages();
    renderMessages();
    els.input.value = '';
    setLoading(true);

    let response;
    let data = {};

    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: getApiMessages() }),
      });

      data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const chatError = formatChatError(response, data);
        messages.push({ role: 'assistant', content: chatError, isError: true });
        saveMessages();
        renderMessages();
        setStatus(chatError);
        return;
      }

      messages.push({ role: 'assistant', content: data.reply });
      saveMessages();
      renderMessages();
      setStatus('');
    } catch (err) {
      const chatError =
        err.message?.includes('Failed to fetch') || err.name === 'TypeError'
          ? 'Could not reach the chat API. Check that the site is deployed on Vercel with the /api/chat function.'
          : err.message || 'Something went wrong';
      messages.push({ role: 'assistant', content: chatError, isError: true });
      saveMessages();
      renderMessages();
      setStatus(chatError);
    } finally {
      setLoading(false);
    }
  }

  function formatChatError(response, data) {
    if (response.status === 429 || data.code === 'quota_exceeded') {
      return (
        "I'm temporarily unavailable — please try again in a little while. " +
        'For a direct conversation, email Alex at alshabanov27@gmail.com.'
      );
    }
    if (response.status === 503) {
      return data.error || 'Chat API is not configured on the server (missing GEMINI_API_KEY).';
    }
    const detail = data.detail ? ` Details: ${data.detail}` : '';
    return (data.error || `Request failed (${response.status}).`) + detail;
  }

  els.toggle.addEventListener('click', () => {
    const isOpen = !els.panel.classList.contains('hidden');
    setOpen(!isOpen);
  });

  document.getElementById('cv-chat-hero-open')?.addEventListener('click', () => setOpen(true));

  els.close.addEventListener('click', () => setOpen(false));

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendUserMessage(els.input.value);
  });

  els.suggestions.forEach((btn) => {
    btn.addEventListener('click', () => {
      setOpen(true);
      sendUserMessage(btn.getAttribute('data-cv-chat-suggestion') || '');
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
})();
