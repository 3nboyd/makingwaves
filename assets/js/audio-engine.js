import { clamp } from "./utils.js";

export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.sourceNode = null;
    this.inputGain = null;
    this.monitorGain = null;
    this.analyser = null;
    this.recordDestination = null;
    this.monitorEnabled = false;
    this.frequencyData = null;
    this.timeData = null;
    this.history = [];
    this.metrics = this.#emptyMetrics();
    this.lastBeatAt = 0;
    this.beatPulse = 0;
    this.previousEnergy = 0;
  }

  async connectStream(stream) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ latencyHint: "interactive" });
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    this.disconnect();

    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.inputGain = this.audioContext.createGain();
    this.monitorGain = this.audioContext.createGain();
    this.analyser = this.audioContext.createAnalyser();
    this.recordDestination = this.audioContext.createMediaStreamDestination();

    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.monitorGain.gain.value = this.monitorEnabled ? 0.85 : 0;

    this.sourceNode.connect(this.inputGain);
    this.inputGain.connect(this.analyser);
    this.inputGain.connect(this.recordDestination);
    this.inputGain.connect(this.monitorGain);
    this.monitorGain.connect(this.audioContext.destination);

    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeData = new Uint8Array(this.analyser.fftSize);
  }

  disconnect() {
    this.sourceNode?.disconnect();
    this.inputGain?.disconnect();
    this.monitorGain?.disconnect();
    this.analyser?.disconnect();
    this.recordDestination?.disconnect();

    this.sourceNode = null;
    this.inputGain = null;
    this.monitorGain = null;
    this.analyser = null;
    this.recordDestination = null;
    this.frequencyData = null;
    this.timeData = null;
    this.metrics = this.#emptyMetrics();
  }

  setMonitorEnabled(enabled) {
    this.monitorEnabled = enabled;

    if (this.monitorGain) {
      this.monitorGain.gain.value = enabled ? 0.85 : 0;
    }
  }

  update(sensitivity = 0.68) {
    if (!this.analyser || !this.frequencyData || !this.timeData) {
      this.metrics = this.#emptyMetrics();
      return this.metrics;
    }

    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.timeData);

    const rms = this.#calculateRms(this.timeData);
    const level = clamp(rms * 2.65, 0, 1);
    const bass = this.#averageRange(0.0, 0.1);
    const mid = this.#averageRange(0.1, 0.35);
    const treble = this.#averageRange(0.35, 0.72);
    const brilliance = this.#averageRange(0.72, 1);
    const energy = bass * 0.58 + mid * 0.26 + treble * 0.16;
    const rise = energy - this.previousEnergy;
    const now = performance.now();
    const triggerThreshold = 0.14 + (1 - sensitivity) * 0.2;
    const beat =
      rise > triggerThreshold && energy > 0.15 && now - this.lastBeatAt > 140;

    if (beat) {
      this.lastBeatAt = now;
      this.beatPulse = 1;
    } else {
      this.beatPulse = Math.max(0, this.beatPulse - 0.055);
    }

    this.previousEnergy = energy;
    this.history.push(level);

    if (this.history.length > 96) {
      this.history.shift();
    }

    const centroid = this.#centroid();
    const waveform = this.#downsample(this.timeData, 96).map((value) => (value - 128) / 128);

    this.metrics = {
      level,
      bass,
      mid,
      treble,
      brilliance,
      energy,
      centroid,
      waveform,
      history: [...this.history],
      beat,
      beatPulse: this.beatPulse,
      peak: clamp(energy * 0.58 + this.beatPulse * 0.42, 0, 1),
    };

    return this.metrics;
  }

  getRecordingStream() {
    return this.recordDestination?.stream ?? null;
  }

  #averageRange(startRatio, endRatio) {
    const start = Math.floor(this.frequencyData.length * startRatio);
    const end = Math.max(start + 1, Math.floor(this.frequencyData.length * endRatio));
    let total = 0;

    for (let index = start; index < end; index += 1) {
      total += this.frequencyData[index];
    }

    return total / ((end - start) * 255);
  }

  #centroid() {
    let weighted = 0;
    let total = 0;

    for (let index = 0; index < this.frequencyData.length; index += 1) {
      const value = this.frequencyData[index] / 255;
      weighted += index * value;
      total += value;
    }

    if (!total) {
      return 0;
    }

    return weighted / total / this.frequencyData.length;
  }

  #calculateRms(values) {
    let sum = 0;

    for (const value of values) {
      const centered = (value - 128) / 128;
      sum += centered * centered;
    }

    return Math.sqrt(sum / values.length);
  }

  #downsample(values, size) {
    const bucket = values.length / size;
    const samples = [];

    for (let index = 0; index < size; index += 1) {
      samples.push(values[Math.floor(index * bucket)]);
    }

    return samples;
  }

  #emptyMetrics() {
    return {
      level: 0,
      bass: 0,
      mid: 0,
      treble: 0,
      brilliance: 0,
      energy: 0,
      centroid: 0,
      waveform: Array.from({ length: 96 }, () => 0),
      history: Array.from({ length: 96 }, () => 0),
      beat: false,
      beatPulse: 0,
      peak: 0,
    };
  }
}
