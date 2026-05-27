import {
  LANDMARK,
  MEDIAPIPE_MODULE_URL,
  MEDIAPIPE_WASM_ROOT,
  POSE_CONNECTIONS,
  POSE_MODEL_URL,
} from "./config.js";
import { averagePoint, clamp, distance } from "./utils.js";

let mediapipeModulePromise = null;

async function loadMediapipe() {
  if (!mediapipeModulePromise) {
    mediapipeModulePromise = import(MEDIAPIPE_MODULE_URL);
  }

  return mediapipeModulePromise;
}

export class PoseEngine {
  constructor({ intervalMs = 70 } = {}) {
    this.intervalMs = intervalMs;
    this.ready = false;
    this.landmarker = null;
    this.lastDetectionAt = 0;
    this.lastPose = this.#emptyPose();
    this.previousLandmarks = null;
  }

  async initialize() {
    if (this.ready) {
      return;
    }

    const { FilesetResolver, PoseLandmarker } = await loadMediapipe();
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);

    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.6,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
      outputSegmentationMasks: true,
    });

    this.ready = true;
  }

  detect(video, timestamp) {
    if (!this.ready || !this.landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return this.lastPose;
    }

    if (timestamp - this.lastDetectionAt < this.intervalMs) {
      return this.lastPose;
    }

    this.lastDetectionAt = timestamp;

    const result = this.landmarker.detectForVideo(video, timestamp);
    const landmarks = result.landmarks?.[0] ?? null;

    if (!landmarks?.length) {
      this.previousLandmarks = null;
      this.lastPose = this.#emptyPose();
      return this.lastPose;
    }

    const visibleLandmarks = landmarks.filter((landmark) => (landmark.visibility ?? 1) > 0.45);
    const shoulders = averagePoint([
      landmarks[LANDMARK.LEFT_SHOULDER],
      landmarks[LANDMARK.RIGHT_SHOULDER],
    ]);
    const hips = averagePoint([landmarks[LANDMARK.LEFT_HIP], landmarks[LANDMARK.RIGHT_HIP]]);
    const center = averagePoint([shoulders, hips]);
    const bodyScale = clamp(
      Math.max(
        distance(landmarks[LANDMARK.LEFT_SHOULDER], landmarks[LANDMARK.RIGHT_SHOULDER]),
        distance(shoulders, hips) * 1.25,
      ),
      0.12,
      0.62,
    );

    let motion = 0;

    if (this.previousLandmarks) {
      for (let index = 0; index < landmarks.length; index += 1) {
        motion += distance(landmarks[index], this.previousLandmarks[index]);
      }

      motion = clamp((motion / landmarks.length) * 7.5, 0, 1);
    }

    const mask = result.segmentationMasks?.[0];
    const copiedMask =
      mask && mask.width && mask.height
        ? {
            width: mask.width,
            height: mask.height,
            data: Float32Array.from(mask.getAsFloat32Array()),
          }
        : null;

    const bounds = visibleLandmarks.reduce(
      (accumulator, landmark) => {
        accumulator.minX = Math.min(accumulator.minX, landmark.x);
        accumulator.minY = Math.min(accumulator.minY, landmark.y);
        accumulator.maxX = Math.max(accumulator.maxX, landmark.x);
        accumulator.maxY = Math.max(accumulator.maxY, landmark.y);
        return accumulator;
      },
      { minX: 1, minY: 1, maxX: 0, maxY: 0 },
    );

    const segments = POSE_CONNECTIONS.filter(([start, end]) => {
      const a = landmarks[start];
      const b = landmarks[end];
      return (a?.visibility ?? 1) > 0.35 && (b?.visibility ?? 1) > 0.35;
    });

    this.previousLandmarks = landmarks.map((landmark) => ({ x: landmark.x, y: landmark.y }));
    this.lastPose = {
      detected: true,
      landmarks,
      segments,
      center,
      shoulders,
      hips,
      wrists: {
        left: landmarks[LANDMARK.LEFT_WRIST],
        right: landmarks[LANDMARK.RIGHT_WRIST],
      },
      bodyScale,
      motion,
      bounds,
      mask: copiedMask,
    };

    return this.lastPose;
  }

  #emptyPose() {
    return {
      detected: false,
      landmarks: [],
      segments: [],
      center: { x: 0.5, y: 0.5 },
      shoulders: { x: 0.5, y: 0.42 },
      hips: { x: 0.5, y: 0.62 },
      wrists: { left: null, right: null },
      bodyScale: 0.26,
      motion: 0,
      bounds: { minX: 0.32, minY: 0.18, maxX: 0.68, maxY: 0.88 },
      mask: null,
    };
  }
}
