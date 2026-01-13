import { Conversation } from "https://esm.run/@elevenlabs/client@0.12.2";

const VoiceController = (() => {
  const API = window.__INTERVIEW_API__;
  if (!API) {
    return {
      init() {},
      start() {},
      stop() {},
      getState() { return "idle"; },
      isActive() { return false; },
      injectContext() {},
      getTranscript() { return []; },
      navigateToQuestion() {},
      updateFormFromVoice() {},
      setVolume() {},
      getVolume() { return 0.7; },
      restart() {},
    };
  }

  const ui = {
    toggle: document.getElementById("voice-toggle"),
    indicator: document.getElementById("voice-indicator"),
    indicatorSpeaker: document.querySelector(".voice-indicator-speaker"),
    indicatorQuestion: document.querySelector(".voice-indicator-question"),
    indicatorRemaining: document.querySelector(".voice-indicator-remaining"),
    apiKeyModal: document.getElementById("voice-apikey-modal"),
    apiKeyInput: document.getElementById("voice-apikey-input"),
    apiKeyRemember: document.getElementById("voice-apikey-remember"),
    apiKeySave: document.getElementById("voice-apikey-save"),
    apiKeyCancel: document.getElementById("voice-apikey-cancel"),
  };

  const STATE = {
    idle: "idle",
    connecting: "connecting",
    listening: "listening",
    speaking: "speaking",
    error: "error",
    ended: "ended",
  };

  const validTransitions = {
    [STATE.idle]: [STATE.connecting],
    [STATE.connecting]: [STATE.listening, STATE.error, STATE.ended, STATE.idle],
    [STATE.listening]: [STATE.speaking, STATE.ended, STATE.error, STATE.idle],
    [STATE.speaking]: [STATE.listening, STATE.ended, STATE.error, STATE.idle],
    [STATE.error]: [STATE.idle, STATE.connecting],
    [STATE.ended]: [STATE.idle, STATE.connecting],
  };

  let state = STATE.idle;
  let conversation = null;
  let transcript = [];
  let currentVoiceQuestion = null;
  let sessionCounter = 0;
  let isToggling = false;
  let currentVolume = 0.7;

  const STORAGE_KEY = "pi-interview-voice-apikey";

  function setState(next) {
    if (!validTransitions[state]?.includes(next)) {
      return false;
    }
    state = next;
    updateUI();
    return true;
  }

  function getState() {
    return state;
  }

  function isActive() {
    return state === STATE.connecting || state === STATE.listening || state === STATE.speaking;
  }

  function getTranscript() {
    return transcript.slice();
  }

  function updateUI() {
    if (isActive() && API.nav && typeof API.nav.questionIndex === "number") {
      if (!currentVoiceQuestion || currentVoiceQuestion.index !== API.nav.questionIndex) {
        setCurrentQuestion(API.nav.questionIndex);
      }
    }

    if (ui.toggle) {
      ui.toggle.classList.toggle("voice-active", isActive());
      ui.toggle.classList.toggle("voice-connecting", state === STATE.connecting);
      ui.toggle.classList.toggle("voice-error", state === STATE.error);
      ui.toggle.setAttribute("aria-pressed", String(isActive()));
    }

    if (ui.indicator) {
      const show = isActive() || state === STATE.error;
      ui.indicator.classList.toggle("hidden", !show);
      ui.indicator.classList.toggle("voice-indicator-error", state === STATE.error);
      ui.indicator.classList.toggle("voice-indicator-speaking", state === STATE.speaking);
      ui.indicator.classList.toggle("voice-indicator-listening", state === STATE.listening);
      ui.indicator.classList.toggle("voice-indicator-paused", state === STATE.error);
    }

    const speakerText =
      state === STATE.speaking
        ? "Speaking"
        : state === STATE.listening
          ? "Listening"
          : state === STATE.connecting
            ? "Connecting"
            : state === STATE.error
              ? "Voice error"
              : "";

    if (ui.indicatorSpeaker) {
      ui.indicatorSpeaker.textContent = speakerText;
    }

    const questionInfo = currentVoiceQuestion
      ? `Question ${currentVoiceQuestion.index + 1}`
      : "Question";
    if (ui.indicatorQuestion) {
      ui.indicatorQuestion.textContent = questionInfo;
    }

    const unanswered = API.getAllUnanswered?.() || [];
    if (ui.indicatorRemaining) {
      ui.indicatorRemaining.textContent =
        unanswered.length > 0 ? `${unanswered.length} remaining` : "All answered";
    }
  }

  function showApiKeyModal() {
    if (!ui.apiKeyModal) return;
    ui.apiKeyModal.classList.remove("hidden");
    ui.apiKeyModal.setAttribute("aria-hidden", "false");
    if (ui.apiKeyInput) {
      ui.apiKeyInput.value = "";
      ui.apiKeyInput.focus();
    }
  }

  function hideApiKeyModal() {
    if (!ui.apiKeyModal) return;
    ui.apiKeyModal.classList.add("hidden");
    ui.apiKeyModal.setAttribute("aria-hidden", "true");
  }

  function getStoredApiKey() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_err) {
      return null;
    }
  }

  function storeApiKey(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (_err) {}
  }

  function getVoiceConfig() {
    return API.data?.voice || {};
  }

  function getNextUnansweredQuestion(afterIndex) {
    const answered = new Set(API.getAnsweredQuestionIds?.() || []);
    const questions = API.questions || [];

    for (let i = afterIndex + 1; i < questions.length; i++) {
      if (!answered.has(questions[i].id)) {
        return { question: questions[i], index: i };
      }
    }
    for (let i = 0; i < afterIndex; i++) {
      if (!answered.has(questions[i].id)) {
        return { question: questions[i], index: i };
      }
    }
    return null;
  }

  function setCurrentQuestion(index) {
    const question = API.questions[index];
    if (!question) return;
    currentVoiceQuestion = { question, index };
    updateUI();
  }

  function syncCurrentQuestion(index) {
    setCurrentQuestion(index);
  }

  function navigateToQuestion(index) {
    API.focusQuestion?.(index, "next", "voice");
    setCurrentQuestion(index);
  }

  function updateFormFromVoice(questionId, value) {
    const question = API.questions.find((q) => q.id === questionId);
    if (!question || !API.escapeSelector || !API.formEl) {
      console.log("[Voice] updateFormFromVoice: missing API", { question: !!question, escapeSelector: !!API.escapeSelector, formEl: !!API.formEl });
      return;
    }
    console.log("[Voice] updateFormFromVoice:", { questionId, value, type: question.type, options: question.options });

    if (question.type === "single" && typeof value === "string") {
      const radios = API.formEl.querySelectorAll(
        `input[name="${API.escapeSelector(questionId)}"]`
      );
      radios.forEach((r) => (r.checked = false));
      if (value !== "") {
        const selector = `input[name="${API.escapeSelector(questionId)}"][value="${API.escapeSelector(value)}"]`;
        const input = API.formEl.querySelector(selector);
        console.log("[Voice] Looking for radio:", { selector, found: !!input });
        if (input) {
          input.checked = true;
        } else {
          const otherCheck = API.formEl.querySelector(
            `input[name="${API.escapeSelector(questionId)}"][value="__other__"]`
          );
          const otherInput = API.formEl.querySelector(
            `.other-input[data-question-id="${API.escapeSelector(questionId)}"]`
          );
          if (otherCheck && otherInput) {
            otherCheck.checked = true;
            otherInput.value = value;
          }
        }
      }
    }

    if (question.type === "multi") {
      const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      const checkboxes = API.formEl.querySelectorAll(
        `input[name="${API.escapeSelector(questionId)}"]`
      );
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });
      let otherValue = "";
      values.forEach((val) => {
        const input = API.formEl.querySelector(
          `input[name="${API.escapeSelector(questionId)}"][value="${API.escapeSelector(val)}"]`
        );
        if (input) {
          input.checked = true;
        } else if (val) {
          otherValue = val;
        }
      });
      if (otherValue) {
        const otherCheck = API.formEl.querySelector(
          `input[name="${API.escapeSelector(questionId)}"][value="__other__"]`
        );
        const otherInput = API.formEl.querySelector(
          `.other-input[data-question-id="${API.escapeSelector(questionId)}"]`
        );
        if (otherCheck && otherInput) {
          otherCheck.checked = true;
          otherInput.value = otherValue;
        }
      }
      API.updateDoneState?.(questionId);
    }

    if (question.type === "text" && typeof value === "string") {
      const textarea = API.formEl.querySelector(
        `textarea[data-question-id="${API.escapeSelector(questionId)}"]`
      );
      if (textarea) textarea.value = value;
    }

    API.debounceSave?.();
    API.notifyAnswerUpdate?.(questionId);
  }

  function parseAnswerFromTranscript(question, text) {
    if (!text) return null;
    if (question.type === "image") return null;
    if (question.type === "text") return text.trim();

    const lower = text.toLowerCase();
    const options = Array.isArray(question.options) ? question.options : [];

    if (question.type === "single") {
      const match = options.find((opt) => opt.toLowerCase() === lower) ||
        options.find((opt) => lower.includes(opt.toLowerCase()));
      return match || text.trim();
    }

    if (question.type === "multi") {
      const matches = options.filter((opt) => lower.includes(opt.toLowerCase()));
      if (matches.length > 0) return matches;
      const trimmed = text.trim();
      return trimmed ? trimmed : null;
    }

    return null;
  }

  function handleUserTranscript(text) {
    if (!currentVoiceQuestion) {
      const fallbackIndex = API.nav?.questionIndex ?? 0;
      setCurrentQuestion(fallbackIndex);
    }
    if (!currentVoiceQuestion) return;

    const normalized = text.toLowerCase();
    if (normalized.includes("go back") || normalized.includes("previous question")) {
      const prevIndex = Math.max(0, currentVoiceQuestion.index - 1);
      navigateToQuestion(prevIndex);
      injectContext({
        type: "user_navigation",
        questionId: API.questions[prevIndex]?.id,
        questionIndex: prevIndex + 1,
        questionText: API.questions[prevIndex]?.question,
        currentAnswer: API.getQuestionValue?.(API.questions[prevIndex]) || null,
      });
      return;
    }

    const answer = parseAnswerFromTranscript(currentVoiceQuestion.question, text);
    console.log("[Voice] Parsed answer:", { text, answer, questionId: currentVoiceQuestion.question.id });
    if (answer !== null) {
      updateFormFromVoice(currentVoiceQuestion.question.id, answer);
      injectContext({ type: "sync_state" });
      checkAllAnswered();
    }
  }

  let submitTimeout = null;

  function checkAllAnswered() {
    const unanswered = API.getAllUnanswered?.() || [];
    if (unanswered.length === 0 && !submitTimeout) {
      console.log("[Voice] All questions answered, will submit after AI finishes...");
      submitTimeout = setTimeout(async () => {
        await stop();
        API.formEl?.requestSubmit?.();
      }, 3000);
    }
  }

  function handleMessage(message) {
    if (!message) return;
    const text =
      message.text ||
      message.message ||
      message.content ||
      message.transcript?.text ||
      message.transcript?.content ||
      "";
    if (!text) return;
    const isFinal =
      message.isFinal ?? message.is_final ?? message.final ?? true;
    if (!isFinal) return;
    const roleRaw = String(message.role || message.source || message.speaker || "").toLowerCase();
    const isUser = ["user", "human", "speaker", "customer", "client"].includes(roleRaw);
    const role = isUser ? "user" : "ai";
    console.log("[Voice] Message:", { role, roleRaw, text: text.slice(0, 100) });
    transcript.push({ role, text, timestamp: Date.now() });
    if (role === "user") {
      handleUserTranscript(text);
    }
  }

  function injectContext(event) {
    if (!conversation) return;
    let message;
    switch (event.type) {
      case "user_navigation":
        message = `[USER_NAVIGATION: User selected question ${event.questionIndex} - "${event.questionText}"]`;
        if (event.currentAnswer) {
          message += ` [Current answer: ${event.currentAnswer}]`;
        }
        break;
      case "answer_updated":
        message = `[FORM_UPDATE: Question ${event.questionId} answered with "${event.value}"]`;
        break;
      case "sync_state":
        const unanswered = API.getAllUnanswered?.() || [];
        if (unanswered.length === 0) {
          message = "[FORM_STATE: 0 remaining]";
        } else {
          message = `[FORM_STATE: ${unanswered.length} remaining: Q${unanswered
            .map((u) => u.index + 1)
            .join(", Q")}]`;
        }
        break;
      default:
        return;
    }
    conversation.sendContextualUpdate?.(message);
  }

  async function startWithKey(overrideKey) {
    const voiceConfig = getVoiceConfig();
    const apiKey = overrideKey || getStoredApiKey();
    if (!voiceConfig.apiKeyConfigured && !apiKey) {
      if (state === STATE.error) {
        setState(STATE.idle);
      }
      showApiKeyModal();
      return;
    }

    if (!setState(STATE.connecting)) return;
    const sessionId = ++sessionCounter;

    try {
      const response = await fetch("/voice/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: API.sessionToken,
          apiKey: voiceConfig.apiKeyConfigured ? undefined : apiKey || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        setState(STATE.error);
        return;
      }

      const signedUrl = data.signedUrl || data.signed_url;
      if (!signedUrl) {
        setState(STATE.error);
        return;
      }

      const allUnanswered = API.getAllUnanswered?.() || [];
      const firstUnanswered = allUnanswered[0];
      if (firstUnanswered) {
        setCurrentQuestion(firstUnanswered.index);
      } else {
        setCurrentQuestion(API.nav?.questionIndex ?? 0);
      }

      const sessionOptions = {
        signedUrl,
        onConnect: () => {
          if (sessionId !== sessionCounter) return;
          setState(STATE.listening);
          setVolume(currentVolume);
          injectContext({ type: "sync_state" });
        },
        onDisconnect: () => {
          if (sessionId !== sessionCounter) return;
          setState(STATE.ended);
          conversation = null;
        },
        onMessage: handleMessage,
        onError: () => {
          if (sessionId !== sessionCounter) return;
          conversation = null;
          setState(STATE.error);
        },
        onModeChange: (mode) => {
          if (sessionId !== sessionCounter) return;
          if (mode === "speaking") setState(STATE.speaking);
          if (mode === "listening") setState(STATE.listening);
        },
      };

      try {
        conversation = await Conversation.startSession({
          ...sessionOptions,
          connectionType: "websocket",
        });
      } catch (_err) {
        conversation = await Conversation.startSession(sessionOptions);
      }
    } catch (_err) {
      setState(STATE.error);
    }
  }

  async function start() {
    return startWithKey(null);
  }

  async function stop() {
    if (submitTimeout) {
      clearTimeout(submitTimeout);
      submitTimeout = null;
    }
    if (conversation) {
      try {
        await conversation.endSession();
      } catch (_err) {}
    }
    conversation = null;
    setState(STATE.idle);
  }

  function setVolume(volume) {
    currentVolume = Math.max(0, Math.min(1, volume));
    if (conversation) {
      try {
        if (typeof conversation.setVolume === "function") {
          conversation.setVolume({ volume: currentVolume });
        }
      } catch (_err) {}
    }
  }

  function getVolume() {
    return currentVolume;
  }

  async function restart() {
    if (!isActive()) return;
    await stop();
    await start();
  }

  async function toggle() {
    if (isToggling) return;
    isToggling = true;
    try {
      if (isActive()) {
        await stop();
      } else {
        await start();
      }
    } finally {
      isToggling = false;
    }
  }

  function init() {
    const voiceConfig = getVoiceConfig();

    currentVolume = voiceConfig.volume ?? 0.7;

    if (ui.toggle) {
      ui.toggle.classList.remove("hidden");
      ui.toggle.addEventListener("click", toggle);
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (ui.apiKeyModal && !ui.apiKeyModal.classList.contains("hidden")) {
          event.preventDefault();
          event.stopPropagation();
          hideApiKeyModal();
          setState(STATE.idle);
          return;
        }
        if (isActive()) {
          event.preventDefault();
          event.stopPropagation();
          stop();
          return;
        }
        return;
      }
      if (event.key.toLowerCase() !== "v") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      event.preventDefault();
      toggle();
    });

    if (ui.apiKeySave) {
      ui.apiKeySave.addEventListener("click", () => {
        const key = ui.apiKeyInput?.value?.trim();
        if (!key) return;
        if (ui.apiKeyRemember?.checked) {
          storeApiKey(key);
        }
        hideApiKeyModal();
        startWithKey(key);
      });
    }

    if (ui.apiKeyCancel) {
      ui.apiKeyCancel.addEventListener("click", () => {
        hideApiKeyModal();
        setState(STATE.idle);
      });
    }

    document.addEventListener("input", () => {
      conversation?.sendUserActivity?.();
    });

    if (voiceConfig.autoStart) {
      start();
    }
  }

  return {
    init,
    start,
    stop,
    getState,
    isActive,
    injectContext,
    getTranscript,
    navigateToQuestion,
    updateFormFromVoice,
    syncCurrentQuestion,
    setVolume,
    getVolume,
    restart,
  };
})();

window.VoiceController = VoiceController;
VoiceController.init();
