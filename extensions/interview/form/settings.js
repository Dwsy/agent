const SettingsController = (() => {
  const API = window.__INTERVIEW_API__;
  if (!API) {
    return {
      init() {},
      openModal() {},
      closeModal() {},
      getVolume() { return 0.7; },
    };
  }

  const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
  const FOCUSABLE_SELECTORS = 'button:not([disabled]), select, input[type="range"]';

  const ui = {
    button: document.getElementById("settings-button"),
    modal: document.getElementById("settings-modal"),
    modalContent: document.querySelector(".settings-modal-content"),
    backdrop: document.querySelector(".settings-modal-backdrop"),
    close: document.getElementById("settings-close"),
    cancel: document.getElementById("settings-cancel"),
    save: document.getElementById("settings-save"),
    voiceSelect: document.getElementById("voice-select"),
    voicePreview: document.getElementById("voice-preview"),
    volumeSlider: document.getElementById("settings-volume"),
    volumeValue: document.getElementById("settings-volume-value"),
    indicatorVolume: document.getElementById("indicator-volume"),
  };

  let voices = [];
  let currentSettings = { voiceId: "", volume: 70 };
  let previewAudio = null;
  let voicesLoaded = false;
  let previouslyFocusedElement = null;

  function getFocusableElements() {
    if (!ui.modalContent) return [];
    return Array.from(ui.modalContent.querySelectorAll(FOCUSABLE_SELECTORS));
  }

  function handleTabKey(event) {
    if (event.key !== "Tab") return;
    
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  function trapFocus() {
    ui.modalContent?.addEventListener("keydown", handleTabKey);
  }

  function releaseFocus() {
    ui.modalContent?.removeEventListener("keydown", handleTabKey);
  }

  async function fetchVoices() {
    if (voicesLoaded) return voices;
    try {
      const response = await fetch(`/settings/voices?session=${API.sessionToken}`);
      const data = await response.json();
      if (data.ok && data.voices) {
        voices = data.voices;
        voicesLoaded = true;
      }
    } catch (err) {
      console.error("Failed to fetch voices:", err);
    }
    return voices;
  }

  async function fetchSettings() {
    try {
      const response = await fetch(`/settings?session=${API.sessionToken}`);
      const data = await response.json();
      if (data.ok && data.settings) {
        currentSettings = {
          voiceId: data.settings.voiceId || "",
          volume: Math.round((data.settings.volume ?? 0.7) * 100),
        };
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    }
  }

  async function saveSettings(settings) {
    try {
      const response = await fetch("/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: API.sessionToken,
          voiceId: settings.voiceId,
          volume: settings.volume / 100,
        }),
      });
      const data = await response.json();
      return data.ok;
    } catch (err) {
      console.error("Failed to save settings:", err);
      return false;
    }
  }

  function populateVoiceDropdown() {
    if (!ui.voiceSelect) return;
    ui.voiceSelect.innerHTML = "";

    if (voices.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No voices available";
      ui.voiceSelect.appendChild(option);
      return;
    }

    const categories = {};
    for (const voice of voices) {
      const cat = voice.category || "other";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(voice);
    }

    const selectedId = currentSettings.voiceId || DEFAULT_VOICE_ID;

    const sortedCategories = Object.entries(categories).sort(([a], [b]) => a.localeCompare(b));
    for (const [category, voiceList] of sortedCategories) {
      const group = document.createElement("optgroup");
      group.label = category.charAt(0).toUpperCase() + category.slice(1);
      for (const voice of voiceList) {
        const option = document.createElement("option");
        option.value = voice.voice_id;
        option.textContent = voice.name;
        option.dataset.previewUrl = voice.preview_url || "";
        if (voice.voice_id === selectedId) {
          option.selected = true;
        }
        group.appendChild(option);
      }
      ui.voiceSelect.appendChild(group);
    }

    if (ui.voicePreview) {
      ui.voicePreview.disabled = false;
    }
  }

  function playPreview() {
    if (!ui.voiceSelect) return;
    const selected = ui.voiceSelect.options[ui.voiceSelect.selectedIndex];
    const previewUrl = selected?.dataset?.previewUrl;
    if (!previewUrl) return;

    stopPreview();

    previewAudio = new Audio(previewUrl);
    previewAudio.volume = (ui.volumeSlider?.value || 70) / 100;
    previewAudio.play().catch(() => {});
  }

  function stopPreview() {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.currentTime = 0;
      previewAudio = null;
    }
  }

  function updateVolumeDisplay() {
    if (ui.volumeValue && ui.volumeSlider) {
      ui.volumeValue.textContent = `${ui.volumeSlider.value}%`;
    }
  }

  function syncIndicatorVolume(volume) {
    if (ui.indicatorVolume) {
      ui.indicatorVolume.value = volume;
    }
  }

  function applyVolumeToConversation(volume) {
    const normalized = Math.max(0, Math.min(1, volume / 100));
    if (window.VoiceController?.setVolume) {
      window.VoiceController.setVolume(normalized);
    }
  }

  async function openModal() {
    if (!ui.modal) return;

    previouslyFocusedElement = document.activeElement;

    await fetchSettings();

    if (ui.volumeSlider) {
      ui.volumeSlider.value = currentSettings.volume;
      updateVolumeDisplay();
    }

    await fetchVoices();
    populateVoiceDropdown();

    ui.modal.classList.remove("hidden");
    ui.modal.setAttribute("aria-hidden", "false");

    trapFocus();

    const firstFocusable = getFocusableElements()[0];
    if (firstFocusable) {
      firstFocusable.focus();
    }
  }

  function closeModal() {
    if (!ui.modal) return;

    stopPreview();
    releaseFocus();

    ui.modal.classList.add("hidden");
    ui.modal.setAttribute("aria-hidden", "true");

    if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === "function") {
      previouslyFocusedElement.focus();
    }
    previouslyFocusedElement = null;
  }

  async function handleSave() {
    const newSettings = {
      voiceId: ui.voiceSelect?.value || DEFAULT_VOICE_ID,
      volume: parseInt(ui.volumeSlider?.value || "70", 10),
    };

    const voiceChanged = newSettings.voiceId !== currentSettings.voiceId;

    const saved = await saveSettings(newSettings);
    if (saved) {
      currentSettings = newSettings;
      applyVolumeToConversation(newSettings.volume);
      syncIndicatorVolume(newSettings.volume);

      if (voiceChanged && window.VoiceController?.isActive?.()) {
        window.VoiceController.restart?.();
      }

      closeModal();
    } else {
      console.error("Failed to save settings");
    }
  }

  function init() {
    if (!ui.button) return;

    ui.button.addEventListener("click", openModal);
    ui.close?.addEventListener("click", closeModal);
    ui.cancel?.addEventListener("click", closeModal);
    ui.backdrop?.addEventListener("click", closeModal);
    ui.save?.addEventListener("click", handleSave);

    ui.voicePreview?.addEventListener("click", playPreview);

    ui.volumeSlider?.addEventListener("input", () => {
      updateVolumeDisplay();
      if (previewAudio) {
        previewAudio.volume = (ui.volumeSlider?.value || 70) / 100;
      }
    });

    ui.indicatorVolume?.addEventListener("input", () => {
      const volume = parseInt(ui.indicatorVolume?.value || "70", 10);
      applyVolumeToConversation(volume);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && ui.modal && !ui.modal.classList.contains("hidden")) {
        closeModal();
      }
    });

    window.addEventListener("beforeunload", stopPreview);

    const inlineVolume = API.data?.voice?.volume;
    if (typeof inlineVolume === "number") {
      currentSettings.volume = Math.round(inlineVolume * 100);
      syncIndicatorVolume(currentSettings.volume);
    }
  }

  return {
    init,
    openModal,
    closeModal,
    getVolume: () => currentSettings.volume / 100,
    getCurrentSettings: () => ({ ...currentSettings }),
  };
})();

window.SettingsController = SettingsController;
SettingsController.init();
