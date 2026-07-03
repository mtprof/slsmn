// Interactive visualizer rendering helper using 2D canvas context

/**
 * Draws the organic oscillating visualizer ring.
 * @param {HTMLCanvasElement} canvas
 * @param {number} time - Animation timestamp
 * @param {string} callStatus - 'idle' | 'connecting' | 'active' | 'error' | 'closed'
 * @param {string} activeSpeaker - 'none' | 'salesman' | 'customer'
 * @param {{ userVolume: number, salesmanVolume: number }} state - Mutable volumes state
 */
export function drawVisualizer(canvas, time, callStatus, activeSpeaker, state) {
  // Smoothly decay volumes in place
  state.userVolume *= 0.88;
  state.salesmanVolume *= 0.88;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width = canvas.clientWidth * window.devicePixelRatio;
  const height = canvas.height = canvas.clientHeight * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const logicalWidth = canvas.clientWidth;
  const logicalHeight = canvas.clientHeight;
  ctx.clearRect(0, 0, logicalWidth, logicalHeight);

  const centerX = logicalWidth / 2;
  const centerY = logicalHeight / 2;
  const baseRadius = Math.min(logicalWidth, logicalHeight) / 3.4;

  const activeVol = activeSpeaker === "customer" ? state.userVolume : state.salesmanVolume;
  const ringScale = 1 + activeVol * 1.6;
  const currentRadius = baseRadius * ringScale;

  // Draw ambient glow gradient
  const glow = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.8, centerX, centerY, currentRadius * 1.5);
  if (callStatus === "connecting") {
    glow.addColorStop(0, "rgba(217, 119, 6, 0.06)");
    glow.addColorStop(1, "rgba(217, 119, 6, 0.0)");
  } else {
    if (activeSpeaker === "customer") {
      glow.addColorStop(0, "rgba(14, 165, 233, 0.10)");
      glow.addColorStop(1, "rgba(14, 165, 233, 0.0)");
    } else if (activeSpeaker === "salesman") {
      glow.addColorStop(0, "rgba(16, 185, 129, 0.10)");
      glow.addColorStop(1, "rgba(16, 185, 129, 0.0)");
    } else {
      glow.addColorStop(0, "rgba(99, 102, 241, 0.03)");
      glow.addColorStop(1, "rgba(99, 102, 241, 0.0)");
    }
  }
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(centerX, centerY, currentRadius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Draw organic oscillating visualizer ring
  ctx.beginPath();
  const segments = 120;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const offsetMultiplier = activeVol > 0.01 ? activeVol * 28 : 2;
    const offset = Math.sin(angle * 12 + time * 0.004) * Math.cos(angle * 5 + time * 0.002) * offsetMultiplier;
    const r = currentRadius + offset;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();

  ctx.lineWidth = 2.5;
  if (callStatus === "connecting") {
    ctx.strokeStyle = "rgba(217, 119, 6, 0.8)";
  } else {
    if (activeSpeaker === "customer") {
      ctx.strokeStyle = "rgba(14, 165, 233, 0.9)";
    } else if (activeSpeaker === "salesman") {
      ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
    } else {
      ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
    }
  }
  ctx.stroke();

  // Center hub circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, baseRadius * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.stroke();
}
