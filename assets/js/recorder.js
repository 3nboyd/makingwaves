import { pickSupportedMimeType } from "./utils.js";

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export class RecorderController {
  constructor() {
    this.recorder = null;
    this.recordingStream = null;
    this.audioClone = null;
    this.chunks = [];
  }

  start(canvas, audioStream) {
    if (typeof MediaRecorder === "undefined") {
      return false;
    }

    if (this.recorder?.state === "recording") {
      return false;
    }

    const canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks()];
    const audioTrack = audioStream?.getAudioTracks?.()[0];

    if (audioTrack) {
      this.audioClone = audioTrack.clone();
      tracks.push(this.audioClone);
    }

    this.recordingStream = new MediaStream(tracks);
    const mimeType = pickSupportedMimeType(MIME_CANDIDATES);
    const options = mimeType ? { mimeType, videoBitsPerSecond: 7_500_000 } : undefined;

    this.chunks = [];
    this.recorder = new MediaRecorder(this.recordingStream, options);
    this.recorder.ondataavailable = (event) => {
      if (event.data.size) {
        this.chunks.push(event.data);
      }
    };
    this.recorder.start(1000);
    return true;
  }

  stop() {
    if (!this.recorder || this.recorder.state !== "recording") {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.recorder.mimeType || "video/webm" });
        this.recordingStream?.getTracks().forEach((track) => track.stop());
        this.audioClone?.stop();
        this.recordingStream = null;
        this.audioClone = null;
        this.recorder = null;
        this.chunks = [];
        resolve(blob);
      };

      this.recorder.stop();
    });
  }

  download(blob) {
    if (!blob) {
      return;
    }

    const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\..+/, "");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `auralith-live-${timestamp}.webm`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
