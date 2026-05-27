export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

export function mapRange(value, inMin, inMax, outMin, outMax) {
  if (inMax - inMin === 0) {
    return outMin;
  }

  const ratio = (value - inMin) / (inMax - inMin);
  return outMin + ratio * (outMax - outMin);
}

export function distance(a, b) {
  if (!a || !b) {
    return 0;
  }

  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function averagePoint(points) {
  const valid = points.filter(Boolean);

  if (!valid.length) {
    return { x: 0.5, y: 0.5 };
  }

  const sum = valid.reduce(
    (accumulator, point) => {
      accumulator.x += point.x;
      accumulator.y += point.y;
      return accumulator;
    },
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / valid.length,
    y: sum.y / valid.length,
  };
}

export function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (textContent !== undefined) {
    element.textContent = textContent;
  }

  return element;
}

export function formatPercent(value) {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

export function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

export function supportsMediaDevices() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

export function pickSupportedMimeType(candidates) {
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}
