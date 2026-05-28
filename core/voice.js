// ─── VOICE.JS — Mic, speech recognition, TTS ─────────────────────────────────

let isListening = false;
let audioEnabled = false;
let recognition = null;

function speak(text) {
  if (!audioEnabled) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05; u.pitch = 1.0; u.volume = 1.0;
  window.speechSynthesis.speak(u);
}

function handleVoiceTranscript(transcript) {
  const t = transcript.toLowerCase().trim();
  if (t.startsWith('project ') || t.startsWith('switch to ') || t.startsWith('open ')) {
    switchToProject(t.replace(/^(project |switch to |open )/, '').trim());
  } else if (t === 'new thread' || t === 'add thread') {
    openNewThreadForm();
  } else if (['bank it','bank that','save that','remember that','hold that'].includes(t)) {
    saveIdea(t);
  } else if (t.includes('save progress') || t.includes('save session')) {
    saveProgress();
  } else if (t.includes('edit thread') || t.includes('update thread')) {
    openEditThread();
  } else {
    const inputId = currentView === 'dashboard' ? 'dashboard-input' : 'chat-input';
    const input = document.getElementById(inputId);
    if (input) { input.value = transcript.trim(); sendMessage(inputId); }
  }
}

function initVoice() {
  const micBtn = document.getElementById('mic-btn');
  if (!micBtn) return;

  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    micBtn.style.opacity = '0.3';
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = function(event) {
    let interim = '', final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) final += event.results[i][0].transcript;
      else interim += event.results[i][0].transcript;
    }
    const inputId = currentView === 'dashboard' ? 'dashboard-input' : 'chat-input';
    const textarea = document.getElementById(inputId);
    if (textarea) { textarea.value = final || interim; textarea.scrollTop = textarea.scrollHeight; }
    if (final) handleVoiceTranscript(final);
  };

  recognition.onerror = function(e) {
    if (e.error !== 'no-speech') { isListening = false; micBtn.textContent = '🎤'; }
  };

  recognition.onend = function() {
    if (isListening) { setTimeout(() => { if (isListening) recognition.start(); }, 300); }
    else { micBtn.textContent = '🎤'; }
  };

  micBtn.addEventListener('click', function() {
    if (!audioEnabled) {
      audioEnabled = true; isListening = true; micBtn.textContent = '🔴';
      window.speechSynthesis.speak(new SpeechSynthesisUtterance('Mavis listening.'));
      recognition.start();
    } else if (isListening) {
      isListening = false; recognition.stop(); micBtn.textContent = '🎤';
    } else {
      isListening = true; micBtn.textContent = '🔴'; recognition.start();
    }
  });
}
