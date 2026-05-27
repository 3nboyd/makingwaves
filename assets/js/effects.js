import { clamp, lerp, mapRange } from "./utils.js";

const PALETTES = {
  lattice: ["#84e7ff", "#93ffd6", "#ffc38c"],
  aura: ["#93ffd6", "#84e7ff", "#90a7ff"],
  prism: ["#90a7ff", "#84e7ff", "#ffc38c"],
  tunnel: ["#ffc38c", "#84e7ff", "#93ffd6"],
  afterglow: ["#ffb494", "#ffc38c", "#84e7ff"],
};

function withAlpha(hex, alpha) {
  const sanitized = hex.replace("#", "");
  const normalized =
    sanitized.length === 3
      ? sanitized
          .split("")
          .map((segment) => segment + segment)
          .join("")
      : sanitized;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function pointToPixels(point, width, height) {
  return {
    x: point.x * width,
    y: point.y * height,
  };
}

function drive(audio, state) {
  return clamp(audio.impact * (0.72 + state.intensity * 0.85) + audio.peak * 0.45, 0, 1.4);
}

function drawBackdrop(context, scene, primary, secondary) {
  const { width, height, audio, pose } = scene;
  const center = pointToPixels(pose.center, width, height);
  const musicDrive = drive(audio, scene.state);

  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#07101f");
  background.addColorStop(1, "#03060d");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(
    center.x,
    center.y * 0.92,
    0,
    center.x,
    center.y * 0.92,
    width * (0.34 + musicDrive * 0.34),
  );
  glow.addColorStop(0, withAlpha(primary, 0.16 + audio.peak * 0.24 + musicDrive * 0.08));
  glow.addColorStop(0.45, withAlpha(secondary, 0.08 + audio.level * 0.12 + musicDrive * 0.06));
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function drawTrailLayer(context, scene, options = {}) {
  const {
    opacity = 0.18,
    scale = 1.008,
    blur = 0,
    composite = "screen",
    rotation = 0,
    offsetX = 0,
    offsetY = 0,
  } = options;
  const { width, height, trailCanvas } = scene;

  if (!trailCanvas.width || !opacity) {
    return;
  }

  context.save();
  context.globalAlpha = opacity;
  context.globalCompositeOperation = composite;
  context.filter = blur ? `blur(${blur}px)` : "none";
  context.translate(width * 0.5 + offsetX, height * 0.5 + offsetY);
  context.rotate(rotation);
  context.scale(scale, scale);
  context.drawImage(trailCanvas, -width * 0.5, -height * 0.5, width, height);
  context.restore();
}

function drawVideoLayer(context, scene, options = {}) {
  const { frameCanvas } = scene;
  const { opacity = 0.1, composite = "screen", blur = 0, scale = 1 } = options;

  if (!frameCanvas.width || !opacity) {
    return;
  }

  context.save();
  context.globalAlpha = opacity;
  context.globalCompositeOperation = composite;
  context.filter = blur ? `blur(${blur}px)` : "none";
  context.translate(scene.width * 0.5, scene.height * 0.5);
  context.scale(scale, scale);
  context.drawImage(frameCanvas, -scene.width * 0.5, -scene.height * 0.5, scene.width, scene.height);
  context.restore();
}

function drawSilhouetteLayer(context, scene, options = {}) {
  const { silhouetteCanvas } = scene;
  const {
    opacity = 0.24,
    composite = "screen",
    blur = 18,
    hueRotation = 0,
    scale = 1,
    offsetX = 0,
    offsetY = 0,
  } = options;

  if (!silhouetteCanvas.width || !opacity) {
    return;
  }

  context.save();
  context.globalAlpha = opacity;
  context.globalCompositeOperation = composite;
  context.filter = `blur(${blur}px) saturate(1.35) hue-rotate(${hueRotation}deg)`;
  context.translate(scene.width * 0.5 + offsetX, scene.height * 0.5 + offsetY);
  context.scale(scale, scale);
  context.drawImage(
    silhouetteCanvas,
    -scene.width * 0.5,
    -scene.height * 0.5,
    scene.width,
    scene.height,
  );
  context.restore();
}

function drawSpectrumBars(context, scene, colorA, colorB) {
  const { audio, width, height } = scene;
  const history = audio.history;
  const musicDrive = drive(audio, scene.state);
  const chartHeight = height * (0.18 + musicDrive * 0.1);
  const baseline = height - 18;
  const barWidth = width / history.length;
  const gradient = context.createLinearGradient(0, baseline - chartHeight, 0, baseline);
  gradient.addColorStop(0, withAlpha(colorA, 0.86));
  gradient.addColorStop(1, withAlpha(colorB, 0.24));

  context.save();
  context.globalCompositeOperation = "screen";
  context.fillStyle = gradient;

  history.forEach((value, index) => {
    const barHeight = Math.max(4, value * chartHeight * (0.95 + musicDrive * 1.45));
    context.fillRect(index * barWidth, baseline - barHeight, Math.max(2, barWidth - 2), barHeight);
  });

  context.restore();
}

function drawSkeleton(context, scene, color, jointColor) {
  const { pose, width, height, audio, state } = scene;
  const musicDrive = drive(audio, state);

  if (!pose.detected) {
    return;
  }

  context.save();
  context.globalCompositeOperation = "screen";
  context.strokeStyle = withAlpha(color, 0.72);
  context.lineWidth = 1.8 + state.intensity * 3.4 + musicDrive * 4.6;
  context.shadowBlur = 28 + musicDrive * 44;
  context.shadowColor = withAlpha(color, 0.45);

  pose.segments.forEach(([start, end]) => {
    const a = pose.landmarks[start];
    const b = pose.landmarks[end];
    context.beginPath();
    context.moveTo(a.x * width, a.y * height);
    context.lineTo(b.x * width, b.y * height);
    context.stroke();
  });

  pose.landmarks.forEach((landmark) => {
    if ((landmark.visibility ?? 1) < 0.45) {
      return;
    }

    const radius = 2.2 + state.intensity * 4.6 + audio.bass * 10 + musicDrive * 3.8;
    context.beginPath();
    context.fillStyle = withAlpha(jointColor, 0.88);
    context.arc(landmark.x * width, landmark.y * height, radius, 0, Math.PI * 2);
    context.fill();
  });

  context.restore();
}

function drawPoseHalo(context, scene, fillColor) {
  const { pose, width, height, audio } = scene;
  const musicDrive = drive(audio, scene.state);

  if (!pose.detected) {
    return;
  }

  const leftShoulder = pose.landmarks[11];
  const rightShoulder = pose.landmarks[12];
  const leftHip = pose.landmarks[23];
  const rightHip = pose.landmarks[24];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return;
  }

  context.save();
  context.globalCompositeOperation = "screen";
  context.fillStyle = withAlpha(fillColor, 0.08 + audio.peak * 0.12 + musicDrive * 0.08);
  context.beginPath();
  context.moveTo(leftShoulder.x * width, leftShoulder.y * height);
  context.lineTo(rightShoulder.x * width, rightShoulder.y * height);
  context.lineTo(rightHip.x * width, rightHip.y * height);
  context.lineTo(leftHip.x * width, leftHip.y * height);
  context.closePath();
  context.fill();
  context.restore();
}

function drawEnergyRings(context, scene, color) {
  const { pose, audio, width, height, time } = scene;
  const center = pointToPixels(pose.center, width, height);
  const musicDrive = drive(audio, scene.state);
  const baseRadius = Math.max(width, height) * (0.06 + pose.bodyScale * 0.4 + musicDrive * 0.03);

  context.save();
  context.globalCompositeOperation = "screen";
  context.strokeStyle = withAlpha(color, 0.28 + musicDrive * 0.06);

  for (let index = 0; index < 5; index += 1) {
    const radius =
      baseRadius +
      index * (30 + musicDrive * 18) +
      Math.sin(time * 0.0012 + index) * (8 + musicDrive * 10) +
      audio.beatPulse * 42;
    context.lineWidth = 1.2 + index * 0.35 + musicDrive * 0.9;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
  }

  context.restore();
}

function drawWristComets(context, scene, color) {
  const wrists = [scene.pose.wrists.left, scene.pose.wrists.right].filter(Boolean);
  const musicDrive = drive(scene.audio, scene.state);

  if (!wrists.length) {
    return;
  }

  context.save();
  context.globalCompositeOperation = "lighter";

  wrists.forEach((wrist, index) => {
    const x = wrist.x * scene.width;
    const y = wrist.y * scene.height;
    const gradient = context.createRadialGradient(x, y, 0, x, y, 90 + scene.audio.peak * 120 + musicDrive * 55);
    gradient.addColorStop(0, withAlpha(color, 0.48));
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, 58 + index * 22 + scene.audio.beatPulse * 60 + musicDrive * 24, 0, Math.PI * 2);
    context.fill();
  });

  context.restore();
}

function drawScanlines(context, scene) {
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.04)";
  context.lineWidth = 1;

  for (let y = 0; y < scene.height; y += 10) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(scene.width, y);
    context.stroke();
  }

  context.restore();
}

function drawTunnel(context, scene, primary, secondary) {
  const anchor = scene.pose.detected
    ? scene.pose.wrists.left && scene.pose.wrists.right
      ? {
          x: (scene.pose.wrists.left.x + scene.pose.wrists.right.x) * 0.5,
          y: (scene.pose.wrists.left.y + scene.pose.wrists.right.y) * 0.5,
        }
      : scene.pose.center
    : { x: 0.5, y: 0.5 };
  const center = pointToPixels(anchor, scene.width, scene.height);
  const maxRadius = Math.max(scene.width, scene.height) * 0.7;
  const musicDrive = drive(scene.audio, scene.state);

  context.save();
  context.globalCompositeOperation = "screen";

  for (let index = 0; index < 18; index += 1) {
    const progress = index / 18;
    const radius =
      maxRadius * progress +
      (scene.time * (0.12 + musicDrive * 0.08) + index * 24) % (28 + musicDrive * 18) +
      scene.audio.beatPulse * 56;
    context.strokeStyle =
      index % 2 === 0
        ? withAlpha(primary, 0.32 - progress * 0.18 + musicDrive * 0.06)
        : withAlpha(secondary, 0.26 - progress * 0.14 + musicDrive * 0.05);
    context.lineWidth = 1.3 + (1 - progress) * 2.8 + musicDrive * 0.8;
    context.beginPath();
    context.ellipse(center.x, center.y, radius, radius * 0.62, 0, 0, Math.PI * 2);
    context.stroke();
  }

  context.restore();
}

function drawPrismCopies(context, scene, color) {
  if (!scene.frameCanvas.width) {
    return;
  }

  const center = pointToPixels(scene.pose.center, scene.width, scene.height);
  const musicDrive = drive(scene.audio, scene.state);

  context.save();
  context.globalCompositeOperation = "screen";

  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8 + scene.audio.centroid * 1.2 + musicDrive * 0.16;
    const pulse = 1 + scene.audio.beatPulse * 0.16 + musicDrive * 0.08;
    context.save();
    context.translate(center.x, center.y);
    context.rotate(angle);
    context.scale(index % 2 === 0 ? pulse : -pulse, pulse);
    context.globalAlpha = 0.09 + scene.audio.level * 0.09 + musicDrive * 0.04;
    context.filter = `blur(${scene.state.trail * 10 + musicDrive * 8}px) saturate(1.38) hue-rotate(${index * 16 + musicDrive * 30}deg)`;
    context.drawImage(
      scene.frameCanvas,
      -scene.width * 0.37,
      -scene.height * 0.39,
      scene.width * 0.74,
      scene.height * 0.78,
    );
    context.restore();
  }

  context.fillStyle = withAlpha(color, 0.08 + musicDrive * 0.05);
  context.beginPath();
  context.arc(center.x, center.y, scene.width * 0.12 + scene.audio.beatPulse * 64 + musicDrive * 24, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawParticles(context, scene) {
  const { particles } = scene;

  if (!particles.length) {
    return;
  }

  context.save();
  context.globalCompositeOperation = "lighter";

  particles.forEach((particle) => {
    const x = particle.x * scene.width;
    const y = particle.y * scene.height;
    const glow = context.createRadialGradient(x, y, 0, x, y, particle.size * 5);
    glow.addColorStop(0, withAlpha(particle.color, particle.alpha));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, particle.size * 5, 0, Math.PI * 2);
    context.fill();
  });

  context.restore();
}

function renderLattice(context, scene) {
  const [primary, secondary, tertiary] = PALETTES.lattice;
  drawBackdrop(context, scene, primary, secondary);
  drawTrailLayer(context, scene, {
    opacity: 0.18 + scene.state.trail * 0.2 + scene.audio.impact * 0.1,
    scale: 1.008 + scene.audio.impact * 0.04,
    blur: scene.state.trail * 6 + scene.audio.impact * 6,
  });
  drawVideoLayer(context, scene, {
    opacity: 0.08 + scene.state.intensity * 0.08 + scene.audio.impact * 0.06,
    blur: 4 + scene.audio.impact * 5,
  });
  drawPoseHalo(context, scene, primary);
  drawSkeleton(context, scene, primary, secondary);
  drawWristComets(context, scene, tertiary);
  drawEnergyRings(context, scene, primary);
  drawSpectrumBars(context, scene, primary, tertiary);
}

function renderAura(context, scene) {
  const [primary, secondary, tertiary] = PALETTES.aura;
  drawBackdrop(context, scene, primary, tertiary);
  drawVideoLayer(context, scene, {
    opacity: 0.06 + scene.audio.level * 0.07 + scene.audio.impact * 0.04,
    blur: 8 + scene.audio.impact * 8,
    composite: "screen",
  });
  drawSilhouetteLayer(context, scene, {
    opacity: 0.24 + scene.audio.peak * 0.2 + scene.audio.impact * 0.08,
    blur: 28 + scene.state.trail * 24 + scene.audio.impact * 18,
    hueRotation: scene.audio.centroid * 220 + scene.audio.impact * 35,
    scale: 1.02 + scene.audio.beatPulse * 0.04 + scene.audio.impact * 0.02,
    offsetX: -12 - scene.audio.beatPulse * 34 - scene.audio.impact * 14,
  });
  drawSilhouetteLayer(context, scene, {
    opacity: 0.18 + scene.audio.level * 0.14 + scene.audio.impact * 0.06,
    blur: 20 + scene.state.trail * 18 + scene.audio.impact * 16,
    hueRotation: 180 + scene.audio.centroid * 120 + scene.audio.impact * 24,
    scale: 0.995 + scene.audio.impact * 0.015,
    offsetX: 10 + scene.audio.beatPulse * 30 + scene.audio.impact * 12,
  });
  drawSkeleton(context, scene, secondary, primary);
  drawEnergyRings(context, scene, tertiary);
}

function renderPrism(context, scene) {
  const [primary, secondary, tertiary] = PALETTES.prism;
  drawBackdrop(context, scene, primary, tertiary);
  drawTrailLayer(context, scene, {
    opacity: 0.18 + scene.state.trail * 0.18 + scene.audio.impact * 0.08,
    scale: 1.018 + scene.audio.impact * 0.05,
    blur: 10 + scene.audio.impact * 10,
    rotation: scene.audio.centroid * 0.08 + scene.audio.impact * 0.05,
  });
  drawPrismCopies(context, scene, primary);
  drawVideoLayer(context, scene, {
    opacity: 0.07 + scene.audio.level * 0.07 + scene.audio.impact * 0.04,
    blur: 3 + scene.audio.impact * 4,
    composite: "lighter",
  });
  drawSkeleton(context, scene, secondary, tertiary);
  drawWristComets(context, scene, tertiary);
}

function renderTunnelEffect(context, scene) {
  const [primary, secondary] = PALETTES.tunnel;
  drawBackdrop(context, scene, primary, secondary);
  drawTrailLayer(context, scene, {
    opacity: 0.14 + scene.state.trail * 0.14 + scene.audio.impact * 0.08,
    scale: 1.014 + scene.audio.impact * 0.05,
    blur: 6 + scene.audio.impact * 8,
    composite: "lighter",
  });
  drawTunnel(context, scene, primary, secondary);
  drawScanlines(context, scene);
  drawSpectrumBars(context, scene, primary, secondary);
  drawSkeleton(context, scene, secondary, primary);
}

function renderAfterglow(context, scene) {
  const [primary, secondary, tertiary] = PALETTES.afterglow;
  drawBackdrop(context, scene, primary, secondary);
  drawTrailLayer(context, scene, {
    opacity: 0.22 + scene.state.trail * 0.26 + scene.audio.impact * 0.08,
    scale: 1.014 + scene.audio.impact * 0.05,
    blur: 12 + scene.audio.impact * 10,
    composite: "screen",
  });
  drawVideoLayer(context, scene, {
    opacity: 0.08 + scene.audio.level * 0.08 + scene.audio.impact * 0.04,
    blur: 4 + scene.audio.impact * 5,
    composite: "screen",
  });
  drawSilhouetteLayer(context, scene, {
    opacity: 0.18 + scene.audio.peak * 0.14 + scene.audio.impact * 0.08,
    blur: 18 + scene.state.trail * 18 + scene.audio.impact * 12,
    hueRotation: 18 + scene.audio.impact * 16,
  });
  drawParticles(context, scene);
  drawWristComets(context, scene, tertiary);
  drawSkeleton(context, scene, secondary, primary);
}

function renderFallback(context, scene) {
  const pulse = 0.18 + Math.sin(scene.time * 0.0016) * 0.06;
  const center = {
    x: scene.width * 0.5,
    y: scene.height * 0.45,
  };

  const background = context.createLinearGradient(0, 0, 0, scene.height);
  background.addColorStop(0, "#08111f");
  background.addColorStop(1, "#04070f");
  context.fillStyle = background;
  context.fillRect(0, 0, scene.width, scene.height);

  for (let index = 0; index < 4; index += 1) {
    const radius = scene.width * (0.08 + index * 0.09) + pulse * 100;
    context.strokeStyle = withAlpha("#84e7ff", 0.18 - index * 0.03);
    context.lineWidth = 1 + index * 0.4;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
  }

  const baseline = scene.height * 0.78;
  const bandWidth = scene.width / 12;
  context.fillStyle = withAlpha("#84e7ff", 0.5);

  for (let index = 0; index < 12; index += 1) {
    const barHeight =
      mapRange(Math.sin(scene.time * 0.003 + index * 0.7), -1, 1, 16, scene.height * 0.22);
    context.fillRect(index * bandWidth + 6, baseline - barHeight, bandWidth - 12, barHeight);
  }
}

export function renderEffect(context, scene) {
  context.clearRect(0, 0, scene.width, scene.height);

  if (!scene.state.sessionActive) {
    renderFallback(context, scene);
    return;
  }

  switch (scene.state.activeEffect) {
    case "aura":
      renderAura(context, scene);
      break;
    case "prism":
      renderPrism(context, scene);
      break;
    case "tunnel":
      renderTunnelEffect(context, scene);
      break;
    case "afterglow":
      renderAfterglow(context, scene);
      break;
    case "lattice":
    default:
      renderLattice(context, scene);
      break;
  }
}
