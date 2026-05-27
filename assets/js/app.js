import { DEFAULT_STATE } from "./config.js";
import { AudioEngine } from "./audio-engine.js";
import { MediaManager } from "./media-manager.js";
import { PoseEngine } from "./pose-engine.js";
import { RecorderController } from "./recorder.js";
import { UIController } from "./ui.js";
import { clamp, supportsMediaDevices } from "./utils.js";
import { VisualizerEngine } from "./visualizer-engine.js";

const state = { ...DEFAULT_STATE };
const ui = new UIController();
const mediaManager = new MediaManager();
const audioEngine = new AudioEngine();
const poseEngine = new PoseEngine();
const recorder = new RecorderController();

let wakeLockSentinel = null;
let poseLoading = false;
let poseFailed = false;
let recordingStartedAt = 0;

const visualizer = new VisualizerEngine({
  canvas: ui.els.visualizerCanvas,
  video: ui.els.cameraVideo,
  audioEngine,
  poseEngine,
  getState: () => state,
  onFrame: ({ audio, pose, fps }) => {
    ui.updateAudio(audio);
    ui.drawSignal(audio);
    ui.updateDiagnostics({
      session: state.sessionActive ? "Live" : "Idle",
      camera: state.sessionActive ? "Live" : "Offline",
      audio: !state.sessionActive ? "Offline" : audio.signalDetected ? "Signal" : "Waiting",
      pose: !state.sessionActive
        ? "Standby"
        : poseLoading
          ? "Loading"
          : poseFailed
            ? "Unavailable"
            : pose.detected
              ? "Locked"
              : "Searching",
      fps,
    });

    if (state.isRecording) {
      ui.updateRecordingTimer((performance.now() - recordingStartedAt) / 1000);
    }
  },
});

visualizer.start();
ui.updateState(state);

bootstrap().catch((error) => {
  console.error(error);
  ui.showToast("Auralith could not finish loading.");
});

async function bootstrap() {
  if (!supportsMediaDevices()) {
    ui.setOverlay("This browser does not expose camera and audio input APIs.", false);
    ui.showToast("Camera and audio APIs are unavailable in this browser.");
    return;
  }

  await refreshDevices();
  bindEvents();
  mediaManager.watchDeviceChanges(async () => {
    await refreshDevices();
    ui.showToast("Media devices updated.");
  });
}

function bindEvents() {
  const { els } = ui;

  els.navToggle.addEventListener("click", () => {
    const isOpen = els.nav.classList.toggle("is-open");
    els.navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  [els.heroLaunch, els.navLaunch, els.ctaLaunch].forEach((button) => {
    button.addEventListener("click", () => scrollToStudio());
  });

  els.startButton.addEventListener("click", () => void startSession());
  els.stopButton.addEventListener("click", () => void stopSession({ keepRecording: false }));
  els.fullscreenButton.addEventListener("click", () => void toggleFullscreen());
  els.wakeLockButton.addEventListener("click", () => void toggleWakeLock(true));
  els.recordButton.addEventListener("click", () => void toggleRecording());
  els.refreshDevicesButton.addEventListener("click", () => void refreshDevices());

  els.videoSelect.addEventListener("change", async (event) => {
    state.videoDeviceId = event.target.value;

    if (!state.sessionActive) {
      return;
    }

    if (state.isRecording) {
      ui.showToast("Stop recording before switching cameras.");
      await refreshDevices();
      return;
    }

    await swapVideoDevice();
  });

  els.audioSelect.addEventListener("change", async (event) => {
    state.audioDeviceId = event.target.value;

    if (!state.sessionActive) {
      return;
    }

    if (state.isRecording) {
      ui.showToast("Stop recording before switching audio inputs.");
      await refreshDevices();
      return;
    }

    await swapAudioDevice();
  });

  els.monitorToggle.addEventListener("change", (event) => {
    state.monitorEnabled = event.target.checked;
    audioEngine.setMonitorEnabled(state.monitorEnabled);
    ui.updateState(state);
  });

  els.monitorRange.addEventListener("input", (event) => {
    state.monitorLevel = clamp(Number(event.target.value) / 100, 0, 1);
    audioEngine.setMonitorLevel(state.monitorLevel);
  });

  els.mirrorToggle.addEventListener("change", (event) => {
    state.mirror = event.target.checked;
    ui.updateState(state);
  });

  els.hudToggle.addEventListener("change", (event) => {
    state.showHud = event.target.checked;
    ui.updateState(state);
  });

  els.intensityRange.addEventListener("input", (event) => {
    state.intensity = clamp(Number(event.target.value) / 100, 0, 1);
  });

  els.sensitivityRange.addEventListener("input", (event) => {
    state.sensitivity = clamp(Number(event.target.value) / 100, 0, 1);
  });

  els.trailRange.addEventListener("input", (event) => {
    state.trail = clamp(Number(event.target.value) / 100, 0, 1);
  });

  els.thresholdRange.addEventListener("input", (event) => {
    state.threshold = clamp(Number(event.target.value) / 100, 0, 1);
  });

  els.effectPicker.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-effect]");

    if (!trigger) {
      return;
    }

    state.activeEffect = trigger.dataset.effect;
    ui.updateState(state);
  });

  document.addEventListener("fullscreenchange", () => {
    const isFullscreen = Boolean(document.fullscreenElement);
    ui.els.fullscreenButton.textContent = isFullscreen ? "Exit Fullscreen" : "Fullscreen";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.wakeLockEnabled) {
      void requestWakeLock();
    }
  });
}

async function startSession() {
  ui.setOverlay("Requesting camera and audio access…", false);

  try {
    const { videoStream, audioStream } = await mediaManager.startSession({
      videoDeviceId: state.videoDeviceId,
      audioDeviceId: state.audioDeviceId,
    });

    ui.els.cameraVideo.srcObject = videoStream;
    await ui.els.cameraVideo.play();
    await audioEngine.connectStream(audioStream);
    audioEngine.setMonitorLevel(state.monitorLevel);
    audioEngine.setMonitorEnabled(state.monitorEnabled);

    state.sessionActive = true;
    ui.updateState(state);
    await refreshDevices(true);
    await initializePose();
    ui.setOverlay("Live rig ready. Use fullscreen when the room is set.", true);
    ui.showToast("Session is live.");
  } catch (error) {
    console.error(error);
    state.sessionActive = false;
    ui.updateState(state);
    ui.setOverlay("Permission denied or device unavailable. Check browser access and inputs.", false);
    ui.showToast("Auralith could not access the requested devices.");
  }
}

async function stopSession({ keepRecording = false } = {}) {
  if (state.isRecording && !keepRecording) {
    const blob = await recorder.stop();
    recorder.download(blob);
    state.isRecording = false;
    ui.updateState(state);
  }

  mediaManager.stopAll();
  audioEngine.disconnect();
  ui.els.cameraVideo.pause();
  ui.els.cameraVideo.srcObject = null;
  state.sessionActive = false;
  ui.updateState(state);
  ui.setOverlay("Awaiting camera and audio access", false);
  await releaseWakeLock();
}

async function swapVideoDevice() {
  ui.showToast("Switching camera…");

  try {
    const stream = await mediaManager.restartVideo(state.videoDeviceId);
    ui.els.cameraVideo.srcObject = stream;
    await ui.els.cameraVideo.play();
  } catch (error) {
    console.error(error);
    ui.showToast("The selected camera could not be started.");
  }
}

async function swapAudioDevice() {
  ui.showToast("Switching audio input…");

  try {
    const stream = await mediaManager.restartAudio(state.audioDeviceId);
    await audioEngine.connectStream(stream);
    audioEngine.setMonitorLevel(state.monitorLevel);
    audioEngine.setMonitorEnabled(state.monitorEnabled);
  } catch (error) {
    console.error(error);
    ui.showToast("The selected audio input could not be started.");
  }
}

async function refreshDevices(preserveSelections = true) {
  try {
    const { videoInputs, audioInputs } = await mediaManager.listDevices();
    const hasSelectedVideo = videoInputs.some((device) => device.deviceId === state.videoDeviceId);
    const hasSelectedAudio = audioInputs.some((device) => device.deviceId === state.audioDeviceId);

    if (!preserveSelections || !state.videoDeviceId || !hasSelectedVideo) {
      state.videoDeviceId = videoInputs[0]?.deviceId || "";
    }

    if (!preserveSelections || !state.audioDeviceId || !hasSelectedAudio) {
      state.audioDeviceId = audioInputs[0]?.deviceId || "";
    }

    ui.setDeviceOptions(ui.els.videoSelect, videoInputs, state.videoDeviceId, "Camera");
    ui.setDeviceOptions(ui.els.audioSelect, audioInputs, state.audioDeviceId, "Audio input");
  } catch (error) {
    console.error(error);
    ui.showToast("Device labels are unavailable until permissions are granted.");
  }
}

async function initializePose() {
  if (poseEngine.ready || poseLoading) {
    return;
  }

  poseLoading = true;
  poseFailed = false;
  ui.showToast("Loading pose tracking…");

  try {
    await poseEngine.initialize();
    ui.showToast("Pose tracking is ready.");
  } catch (error) {
    console.error(error);
    poseFailed = true;
    ui.showToast("Pose tracking could not be loaded.");
  } finally {
    poseLoading = false;
  }
}

async function toggleRecording() {
  if (!state.sessionActive) {
    ui.showToast("Start the session before recording.");
    return;
  }

  if (!state.isRecording) {
    const started = recorder.start(ui.els.visualizerCanvas, audioEngine.getRecordingStream());

    if (!started) {
      ui.showToast("Recording could not start.");
      return;
    }

    state.isRecording = true;
    recordingStartedAt = performance.now();
    ui.updateState(state);
    ui.showToast("Recording started.");
    return;
  }

  const blob = await recorder.stop();
  recorder.download(blob);
  state.isRecording = false;
  recordingStartedAt = 0;
  ui.updateRecordingTimer(0);
  ui.updateState(state);
  ui.showToast("Recording saved.");
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  try {
    await ui.els.stageShell.requestFullscreen();
  } catch (error) {
    console.error(error);
    ui.showToast("Fullscreen must be triggered from a user action.");
  }
}

async function toggleWakeLock(showUnsupportedToast = false) {
  if (!("wakeLock" in navigator)) {
    if (showUnsupportedToast) {
      ui.showToast("Screen wake lock is not supported in this browser.");
    }
    return;
  }

  if (wakeLockSentinel) {
    await releaseWakeLock();
    return;
  }

  await requestWakeLock();
}

async function requestWakeLock() {
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    state.wakeLockEnabled = true;
    ui.els.wakeLockButton.textContent = "Release Awake";
    ui.showToast("Screen wake lock enabled.");
    wakeLockSentinel.addEventListener("release", () => {
      state.wakeLockEnabled = false;
      wakeLockSentinel = null;
      ui.els.wakeLockButton.textContent = "Keep Awake";
    });
  } catch (error) {
    console.error(error);
    state.wakeLockEnabled = false;
    ui.els.wakeLockButton.textContent = "Keep Awake";
    ui.showToast("Wake lock request was rejected.");
  }
}

async function releaseWakeLock() {
  if (!wakeLockSentinel) {
    state.wakeLockEnabled = false;
    ui.els.wakeLockButton.textContent = "Keep Awake";
    return;
  }

  await wakeLockSentinel.release();
  wakeLockSentinel = null;
  state.wakeLockEnabled = false;
  ui.els.wakeLockButton.textContent = "Keep Awake";
}

function scrollToStudio() {
  document.getElementById("studio").scrollIntoView({ behavior: "smooth", block: "start" });
  ui.els.nav.classList.remove("is-open");
  ui.els.navToggle.setAttribute("aria-expanded", "false");
}
