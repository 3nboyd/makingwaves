import { EFFECT_PRESETS } from "./config.js";
import { createElement, formatDuration, formatPercent } from "./utils.js";

export class UIController {
  constructor() {
    this.elements = this.#collectElements();
    this.toastTimer = null;
    this.#renderEffects();
    this.#bindRangeOutputs();
  }

  get els() {
    return this.elements;
  }

  setDeviceOptions(select, devices, selectedId, placeholder) {
    select.innerHTML = "";

    if (!devices.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = placeholder;
      select.append(option);
      return;
    }

    for (const [index, device] of devices.entries()) {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `${placeholder} ${index + 1}`;
      option.selected = device.deviceId === selectedId;
      select.append(option);
    }
  }

  updateState(state) {
    this.elements.monitorToggle.checked = state.monitorEnabled;
    this.elements.monitorRange.disabled = !state.monitorEnabled;
    this.elements.mirrorToggle.checked = state.mirror;
    this.elements.hudToggle.checked = state.showHud;
    this.elements.performanceHud.classList.toggle("is-hidden", !state.showHud);
    this.elements.recordButton.classList.toggle("is-recording", state.isRecording);
    this.elements.hudRecording.classList.toggle("is-live", state.isRecording);
    this.elements.recordButton.textContent = state.isRecording ? "Stop Recording" : "Record";
    this.elements.recordStatus.textContent = state.isRecording ? "Live" : "Ready";

    if (!state.isRecording) {
      this.elements.recordTimer.textContent = "00:00";
    }

    this.#setActiveEffect(state.activeEffect);
  }

  updateDiagnostics({ session, camera, audio, pose, fps }) {
    this.elements.sessionStatus.textContent = session;
    this.elements.cameraStatus.textContent = camera;
    this.elements.audioStatus.textContent = audio;
    this.elements.poseStatus.textContent = pose;
    this.elements.fpsReadout.textContent = `${fps}`;
  }

  updateAudio(metrics) {
    this.elements.masterFill.style.width = formatPercent(metrics.level);
    this.elements.masterReadout.textContent = formatPercent(metrics.level);
    this.elements.masterDbReadout.textContent =
      Number.isFinite(metrics.inputDb) ? `${metrics.inputDb} dB` : "-inf dB";
    this.elements.signalStateLabel.textContent = metrics.signalDetected ? "Signal live" : "No signal";
    this.elements.signalStateCopy.textContent = metrics.signalDetected
      ? "Input is active. Your routed audio is reaching the browser."
      : "Waiting for routed audio. Check the virtual cable or interface output.";
    this.elements.signalStatePill.classList.toggle("signal-pill-live", metrics.signalDetected);
    this.elements.signalStatePill.classList.toggle("signal-pill-idle", !metrics.signalDetected);
    this.elements.levelFill.style.width = formatPercent(metrics.level);
    this.elements.bassFill.style.width = formatPercent(metrics.bass);
    this.elements.midFill.style.width = formatPercent(metrics.mid);
    this.elements.trebleFill.style.width = formatPercent(metrics.treble);
    this.elements.levelReadout.textContent = formatPercent(metrics.level);
    this.elements.bassReadout.textContent = formatPercent(metrics.bass);
    this.elements.midReadout.textContent = formatPercent(metrics.mid);
    this.elements.trebleReadout.textContent = formatPercent(metrics.treble);
    this.elements.peakReadout.textContent = formatPercent(metrics.peak);
  }

  updateRecordingTimer(seconds) {
    this.elements.recordTimer.textContent = formatDuration(seconds);
  }

  setOverlay(message, hidden = false) {
    this.elements.overlayStatusCopy.textContent = message;
    this.elements.stageOverlay.classList.toggle("is-hidden", hidden);
  }

  updateEffectLabel(effectId) {
    const preset = EFFECT_PRESETS.find((item) => item.id === effectId);
    if (preset) {
      this.elements.activeEffectLabel.textContent = preset.label;
    }
  }

  showToast(message) {
    clearTimeout(this.toastTimer);
    this.elements.toast.textContent = message;
    this.elements.toast.classList.add("is-visible");
    this.toastTimer = setTimeout(() => {
      this.elements.toast.classList.remove("is-visible");
    }, 2400);
  }

  drawSignal(metrics) {
    const canvas = this.elements.signalCanvas;
    const context = canvas.getContext("2d");
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;

    if (!width || !height) {
      return;
    }

    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "rgba(132, 231, 255, 0.88)");
    gradient.addColorStop(0.55, "rgba(147, 255, 214, 0.88)");
    gradient.addColorStop(1, "rgba(255, 195, 140, 0.88)");

    context.strokeStyle = gradient;
    context.lineWidth = 2;
    context.beginPath();

    metrics.waveform.forEach((sample, index) => {
      const x = (index / (metrics.waveform.length - 1)) * width;
      const y = height * 0.5 + sample * height * 0.28;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });

    context.stroke();

    context.fillStyle = "rgba(132, 231, 255, 0.12)";
    context.fillRect(0, height * (1 - metrics.level), width, height * metrics.level);
  }

  #renderEffects() {
    const pickerFragment = document.createDocumentFragment();
    const libraryFragment = document.createDocumentFragment();

    for (const effect of EFFECT_PRESETS) {
      const chip = createElement("button", "effect-chip");
      chip.type = "button";
      chip.dataset.effect = effect.id;
      chip.setAttribute("role", "option");

      const title = createElement("strong", "", effect.label);
      const copy = createElement("span", "", effect.short);
      chip.append(title, copy);
      pickerFragment.append(chip);

      const card = createElement("article", "surface-card effect-library-card");
      card.dataset.effectCard = effect.id;
      const eyebrow = createElement("span", "workflow-index", effect.short);
      const heading = createElement("h3", "", effect.label);
      const description = createElement("p", "", effect.description);
      const tags = createElement("div", "effect-tag-row");

      effect.tags.forEach((tag) => {
        const tagElement = createElement("span", "effect-tag", tag);
        tagElement.style.borderColor = effect.accent;
        tags.append(tagElement);
      });

      card.append(eyebrow, heading, description, tags);
      libraryFragment.append(card);
    }

    this.elements.effectPicker.append(pickerFragment);
    this.elements.effectLibrary.append(libraryFragment);
    this.#setActiveEffect(EFFECT_PRESETS[0].id);
  }

  #setActiveEffect(effectId) {
    this.elements.effectPicker.querySelectorAll("[data-effect]").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.effect === effectId);
      chip.setAttribute("aria-selected", chip.dataset.effect === effectId ? "true" : "false");
    });

    this.elements.effectLibrary.querySelectorAll("[data-effect-card]").forEach((card) => {
      card.style.borderColor =
        card.dataset.effectCard === effectId ? "rgba(132, 231, 255, 0.24)" : "rgba(255, 255, 255, 0.08)";
    });

    this.updateEffectLabel(effectId);
  }

  #bindRangeOutputs() {
    const pairs = [
      [this.elements.monitorRange, this.elements.monitorValue],
      [this.elements.intensityRange, this.elements.intensityValue],
      [this.elements.sensitivityRange, this.elements.sensitivityValue],
      [this.elements.trailRange, this.elements.trailValue],
      [this.elements.thresholdRange, this.elements.thresholdValue],
    ];

    for (const [input, output] of pairs) {
      const update = () => {
        output.textContent = `${input.value}%`;
      };

      update();
      input.addEventListener("input", update);
    }
  }

  #collectElements() {
    return {
      navToggle: document.getElementById("nav-toggle"),
      nav: document.getElementById("site-nav"),
      navLaunch: document.getElementById("nav-launch"),
      heroLaunch: document.getElementById("hero-launch"),
      ctaLaunch: document.getElementById("cta-launch"),
      startButton: document.getElementById("start-session"),
      stopButton: document.getElementById("stop-session"),
      fullscreenButton: document.getElementById("fullscreen-toggle"),
      wakeLockButton: document.getElementById("wake-lock-toggle"),
      recordButton: document.getElementById("record-toggle"),
      refreshDevicesButton: document.getElementById("refresh-devices"),
      videoSelect: document.getElementById("video-device"),
      audioSelect: document.getElementById("audio-device"),
      monitorToggle: document.getElementById("monitor-toggle"),
      monitorRange: document.getElementById("monitor-range"),
      mirrorToggle: document.getElementById("mirror-toggle"),
      hudToggle: document.getElementById("hud-toggle"),
      monitorValue: document.getElementById("monitor-value"),
      intensityRange: document.getElementById("intensity-range"),
      sensitivityRange: document.getElementById("sensitivity-range"),
      trailRange: document.getElementById("trail-range"),
      thresholdRange: document.getElementById("threshold-range"),
      intensityValue: document.getElementById("intensity-value"),
      sensitivityValue: document.getElementById("sensitivity-value"),
      trailValue: document.getElementById("trail-value"),
      thresholdValue: document.getElementById("threshold-value"),
      effectPicker: document.getElementById("effect-picker"),
      effectLibrary: document.getElementById("effect-library"),
      stageShell: document.getElementById("stage-shell"),
      stageOverlay: document.getElementById("stage-overlay"),
      overlayStatusCopy: document.getElementById("overlay-status-copy"),
      visualizerCanvas: document.getElementById("visualizer-canvas"),
      cameraVideo: document.getElementById("camera-source"),
      signalCanvas: document.getElementById("signal-canvas"),
      performanceHud: document.getElementById("performance-hud"),
      activeEffectLabel: document.getElementById("active-effect-label"),
      peakReadout: document.getElementById("peak-readout"),
      masterFill: document.getElementById("master-fill"),
      masterReadout: document.getElementById("master-readout"),
      masterDbReadout: document.getElementById("master-db-readout"),
      signalStateCopy: document.getElementById("signal-state-copy"),
      signalStateLabel: document.getElementById("signal-state-label"),
      signalStatePill: document.getElementById("signal-state-pill"),
      recordTimer: document.getElementById("record-timer"),
      hudRecording: document.querySelector(".hud-recording"),
      sessionStatus: document.getElementById("session-status"),
      cameraStatus: document.getElementById("camera-status"),
      audioStatus: document.getElementById("audio-status"),
      poseStatus: document.getElementById("pose-status"),
      fpsReadout: document.getElementById("fps-readout"),
      recordStatus: document.getElementById("record-status"),
      levelFill: document.getElementById("level-fill"),
      bassFill: document.getElementById("bass-fill"),
      midFill: document.getElementById("mid-fill"),
      trebleFill: document.getElementById("treble-fill"),
      levelReadout: document.getElementById("level-readout"),
      bassReadout: document.getElementById("bass-readout"),
      midReadout: document.getElementById("mid-readout"),
      trebleReadout: document.getElementById("treble-readout"),
      toast: document.getElementById("app-toast"),
    };
  }
}
