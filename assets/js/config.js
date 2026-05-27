export const MEDIAPIPE_VERSION = "0.10.35";
export const MEDIAPIPE_CDN_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
export const MEDIAPIPE_MODULE_URL = `${MEDIAPIPE_CDN_ROOT}/vision_bundle.mjs`;
export const MEDIAPIPE_WASM_ROOT = `${MEDIAPIPE_CDN_ROOT}/wasm`;
export const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export const LANDMARK = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

export const POSE_CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

export const EFFECT_PRESETS = [
  {
    id: "lattice",
    label: "Aurora Lattice",
    short: "Neon pose rig",
    description:
      "A luminous skeletal mesh with bass-linked bars, wrist trails, and crystalline body halos. Best when you want clear performer recognition without showing raw camera footage.",
    tags: ["pose", "peaks", "glow"],
    accent: "#84e7ff",
  },
  {
    id: "aura",
    label: "Silhouette Bloom",
    short: "Masked body aura",
    description:
      "Builds a segmented body silhouette, then blooms it into chromatic echoes that flare with transients. Strong for booth backdrops and slow-build intros.",
    tags: ["mask", "silhouette", "cinematic"],
    accent: "#93ffd6",
  },
  {
    id: "prism",
    label: "Prism Stage",
    short: "Mirrored lens shards",
    description:
      "Splits the performer into mirrored shards around the torso center while audio energy drives flare width, rotation, and spectral highlights.",
    tags: ["mirror", "shards", "movement"],
    accent: "#90a7ff",
  },
  {
    id: "tunnel",
    label: "Pulse Tunnel",
    short: "Reactive geometry",
    description:
      "A low-distraction, high-impact tunnel of rings, scan lines, and pressure waves. Ideal when you want the room to feel like it is breathing with the kick drum.",
    tags: ["geometry", "bass", "fullscreen"],
    accent: "#ffc38c",
  },
  {
    id: "afterglow",
    label: "Afterglow Particles",
    short: "Bursting trails",
    description:
      "Particles erupt from hands, shoulders, and torso on beat hits, then drag into warm afterimages. Best for bigger peaks and more theatrical body motion.",
    tags: ["particles", "motion", "bursts"],
    accent: "#ffb494",
  },
];

export const DEFAULT_STATE = {
  activeEffect: EFFECT_PRESETS[0].id,
  intensity: 0.72,
  sensitivity: 0.68,
  trail: 0.64,
  threshold: 0.52,
  monitorEnabled: false,
  monitorLevel: 0.6,
  mirror: true,
  showHud: true,
  sessionActive: false,
  wakeLockEnabled: false,
  isRecording: false,
  videoDeviceId: "",
  audioDeviceId: "",
};
