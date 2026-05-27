export class MediaManager {
  constructor() {
    this.videoStream = null;
    this.audioStream = null;
    this.deviceChangeHandler = null;
  }

  async listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();

    return {
      videoInputs: devices.filter((device) => device.kind === "videoinput"),
      audioInputs: devices.filter((device) => device.kind === "audioinput"),
    };
  }

  watchDeviceChanges(handler) {
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }

    this.unwatchDeviceChanges();
    this.deviceChangeHandler = handler;
    navigator.mediaDevices.addEventListener("devicechange", handler);
  }

  unwatchDeviceChanges() {
    if (!this.deviceChangeHandler || !navigator.mediaDevices?.removeEventListener) {
      return;
    }

    navigator.mediaDevices.removeEventListener("devicechange", this.deviceChangeHandler);
    this.deviceChangeHandler = null;
  }

  async startSession({ videoDeviceId = "", audioDeviceId = "" } = {}) {
    const [videoStream, audioStream] = await Promise.all([
      this.restartVideo(videoDeviceId),
      this.restartAudio(audioDeviceId),
    ]);

    return { videoStream, audioStream };
  }

  async restartVideo(deviceId = "") {
    this.stopVideo();
    this.videoStream = await this.#acquireStream(this.#videoConstraints(deviceId));
    return this.videoStream;
  }

  async restartAudio(deviceId = "") {
    this.stopAudio();
    this.audioStream = await this.#acquireStream(this.#audioConstraints(deviceId));
    return this.audioStream;
  }

  stopVideo() {
    if (!this.videoStream) {
      return;
    }

    this.videoStream.getTracks().forEach((track) => track.stop());
    this.videoStream = null;
  }

  stopAudio() {
    if (!this.audioStream) {
      return;
    }

    this.audioStream.getTracks().forEach((track) => track.stop());
    this.audioStream = null;
  }

  stopAll() {
    this.stopVideo();
    this.stopAudio();
  }

  async #acquireStream(constraintsList) {
    let lastError = null;

    for (const constraints of constraintsList) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  #videoConstraints(deviceId) {
    const shared = {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 60 },
      aspectRatio: { ideal: 16 / 9 },
      facingMode: "user",
    };

    const withDevice = deviceId ? { deviceId: { exact: deviceId } } : {};

    return [
      { video: { ...shared, ...withDevice }, audio: false },
      { video: withDevice.deviceId ? withDevice : true, audio: false },
    ];
  }

  #audioConstraints(deviceId) {
    const withDevice = deviceId ? { deviceId: { exact: deviceId } } : {};

    return [
      {
        audio: {
          ...withDevice,
          channelCount: { ideal: 2 },
          sampleRate: { ideal: 48000 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      },
      {
        audio: {
          ...withDevice,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      },
      { audio: withDevice.deviceId ? withDevice : true, video: false },
    ];
  }
}
