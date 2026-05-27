import { EFFECT_PRESETS } from "./config.js";
import { renderEffect } from "./effects.js";
import { clamp, lerp } from "./utils.js";

export class VisualizerEngine {
  constructor({ canvas, video, audioEngine, poseEngine, getState, onFrame }) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.video = video;
    this.audioEngine = audioEngine;
    this.poseEngine = poseEngine;
    this.getState = getState;
    this.onFrame = onFrame;
    this.animationFrameId = 0;
    this.lastTime = 0;
    this.fps = 0;
    this.frameCanvas = document.createElement("canvas");
    this.frameContext = this.frameCanvas.getContext("2d");
    this.maskCanvas = document.createElement("canvas");
    this.maskContext = this.maskCanvas.getContext("2d");
    this.maskImageData = null;
    this.silhouetteCanvas = document.createElement("canvas");
    this.silhouetteContext = this.silhouetteCanvas.getContext("2d");
    this.trailCanvas = document.createElement("canvas");
    this.trailContext = this.trailCanvas.getContext("2d");
    this.particles = [];
  }

  start() {
    if (this.animationFrameId) {
      return;
    }

    this.animationFrameId = requestAnimationFrame((time) => this.#render(time));
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  #render(time) {
    const state = this.getState();
    const width = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const height = this.canvas.clientHeight || 460;
    const ratio = window.devicePixelRatio || 1;

    if (!width || !height) {
      this.animationFrameId = requestAnimationFrame((nextTime) => this.#render(nextTime));
      return;
    }

    if (this.canvas.width !== Math.floor(width * ratio) || this.canvas.height !== Math.floor(height * ratio)) {
      this.canvas.width = Math.floor(width * ratio);
      this.canvas.height = Math.floor(height * ratio);
    }

    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);

    this.#resizeOffscreen(this.frameCanvas, width, height);
    this.#resizeOffscreen(this.silhouetteCanvas, width, height);
    this.#resizeOffscreen(this.trailCanvas, width, height);

    const dt = this.lastTime ? (time - this.lastTime) / 1000 : 1 / 60;
    this.lastTime = time;
    this.fps = Math.round(lerp(this.fps || 60, 1 / Math.max(dt, 0.001), 0.14));

    this.#drawFrameSource(width, height, state.mirror);

    const audioMetrics = this.audioEngine.update(state.sensitivity);
    const poseMetrics = state.sessionActive ? this.poseEngine.detect(this.video, time) : this.poseEngine.lastPose;

    this.#buildMaskAndSilhouette(poseMetrics, state.threshold, width, height);
    this.#updateParticles(poseMetrics, audioMetrics, state, dt);

    renderEffect(this.context, {
      width,
      height,
      time,
      dt,
      state,
      audio: audioMetrics,
      pose: poseMetrics,
      effect: EFFECT_PRESETS.find((effect) => effect.id === state.activeEffect) ?? EFFECT_PRESETS[0],
      frameCanvas: this.frameCanvas,
      maskCanvas: this.maskCanvas,
      silhouetteCanvas: this.silhouetteCanvas,
      trailCanvas: this.trailCanvas,
      particles: this.particles,
    });

    this.#storeTrail(width, height);

    this.onFrame?.({
      audio: audioMetrics,
      pose: poseMetrics,
      fps: this.fps,
    });

    this.animationFrameId = requestAnimationFrame((nextTime) => this.#render(nextTime));
  }

  #drawFrameSource(width, height, mirror) {
    this.frameContext.clearRect(0, 0, width, height);

    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !this.video.videoWidth) {
      return;
    }

    const videoAspect = this.video.videoWidth / this.video.videoHeight;
    const canvasAspect = width / height;
    let drawWidth = width;
    let drawHeight = height;
    let offsetX = 0;
    let offsetY = 0;

    if (videoAspect > canvasAspect) {
      drawWidth = height * videoAspect;
      offsetX = (width - drawWidth) * 0.5;
    } else {
      drawHeight = width / videoAspect;
      offsetY = (height - drawHeight) * 0.5;
    }

    this.frameContext.save();

    if (mirror) {
      this.frameContext.translate(width, 0);
      this.frameContext.scale(-1, 1);
      this.frameContext.drawImage(this.video, width - drawWidth - offsetX, offsetY, drawWidth, drawHeight);
    } else {
      this.frameContext.drawImage(this.video, offsetX, offsetY, drawWidth, drawHeight);
    }

    this.frameContext.restore();
  }

  #buildMaskAndSilhouette(pose, threshold, width, height) {
    this.silhouetteContext.clearRect(0, 0, width, height);

    if (!pose?.mask) {
      return;
    }

    const { mask } = pose;
    this.#resizeOffscreen(this.maskCanvas, mask.width, mask.height);

    if (!this.maskImageData || this.maskImageData.width !== mask.width || this.maskImageData.height !== mask.height) {
      this.maskImageData = this.maskContext.createImageData(mask.width, mask.height);
    }

    for (let index = 0; index < mask.data.length; index += 1) {
      const alpha = mask.data[index] > threshold ? clamp(mask.data[index], 0, 1) * 255 : 0;
      const base = index * 4;
      this.maskImageData.data[base] = 255;
      this.maskImageData.data[base + 1] = 255;
      this.maskImageData.data[base + 2] = 255;
      this.maskImageData.data[base + 3] = alpha;
    }

    this.maskContext.putImageData(this.maskImageData, 0, 0);
    this.silhouetteContext.drawImage(this.frameCanvas, 0, 0, width, height);
    this.silhouetteContext.globalCompositeOperation = "destination-in";
    this.silhouetteContext.drawImage(this.maskCanvas, 0, 0, width, height);
    this.silhouetteContext.globalCompositeOperation = "source-over";
  }

  #updateParticles(pose, audio, state, dt) {
    if (audio.beat) {
      const anchors = [pose.center, pose.wrists.left, pose.wrists.right, pose.shoulders].filter(Boolean);
      const effect = EFFECT_PRESETS.find((item) => item.id === state.activeEffect) ?? EFFECT_PRESETS[0];
      const spawnCount = 10 + Math.round(state.intensity * 10);

      anchors.forEach((anchor) => {
        for (let index = 0; index < spawnCount; index += 1) {
          const angle = (Math.PI * 2 * index) / spawnCount + Math.random() * 0.24;
          const speed = 0.02 + Math.random() * 0.12 + state.intensity * 0.08;
          this.particles.push({
            x: anchor.x,
            y: anchor.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            alpha: 0.26 + Math.random() * 0.42,
            size: 0.8 + Math.random() * 2.6 + audio.peak * 2.8,
            life: 0.7 + Math.random() * 0.8,
            color: effect.accent,
          });
        }
      });
    }

    this.particles = this.particles
      .map((particle) => {
        const drift = (0.22 + state.trail * 0.34) * dt;
        return {
          ...particle,
          x: particle.x + particle.vx * dt * 3.8,
          y: particle.y + particle.vy * dt * 3.8 - drift * 0.18,
          vx: particle.vx * 0.985,
          vy: particle.vy * 0.985,
          alpha: particle.alpha * 0.985,
          life: particle.life - dt * (0.8 + state.trail),
        };
      })
      .filter((particle) => particle.life > 0 && particle.alpha > 0.02);
  }

  #storeTrail(width, height) {
    this.trailContext.clearRect(0, 0, width, height);
    this.trailContext.drawImage(this.canvas, 0, 0, width, height);
  }

  #resizeOffscreen(canvas, width, height) {
    if (canvas.width !== Math.floor(width) || canvas.height !== Math.floor(height)) {
      canvas.width = Math.floor(width);
      canvas.height = Math.floor(height);
    }
  }
}
