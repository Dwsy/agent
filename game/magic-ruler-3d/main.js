/* Magic Ruler 3D — a dependency-free spatial folding puzzle. */

const LEVELS = [
  {
    name: "初次折叠",
    mission: "先熟悉关节的四向旋转。紫色虚线是唯一正确的答案。",
    turns: [1, 2, 0, 3, 1, 2, 0],
  },
  {
    name: "偏转轨道",
    mission: "让链节离开平面，在上下与前后之间找到新的节奏。",
    turns: [2, 1, 3, 0, 2, 3, 1, 0],
  },
  {
    name: "回声廊道",
    mission: "连续的折向会制造回环。观察深度，不要只看屏幕平面。",
    turns: [1, 3, 2, 0, 2, 1, 3, 0, 1],
  },
  {
    name: "三维脉冲",
    mission: "每一次 90° 都会重写后半段的空间位置，保持耐心。",
    turns: [3, 0, 1, 2, 3, 1, 0, 2, 1, 3],
  },
  {
    name: "镜像花园",
    mission: "目标开始出现镜像感。拖动视角，寻找隐藏在背面的关节。",
    turns: [2, 0, 3, 1, 2, 0, 1, 3, 2, 1, 0, 3],
  },
  {
    name: "折线潮汐",
    mission: "更长的魔尺需要更好的记忆。先校准近端，再处理远端。",
    turns: [1, 2, 3, 1, 0, 2, 3, 0, 1, 3, 2, 0, 2],
  },
  {
    name: "悬浮结构",
    mission: "空间方向不断切换。每个圆环都是一个独立的决定。",
    turns: [3, 1, 0, 2, 1, 3, 2, 0, 3, 1, 2, 0, 1, 2, 3],
  },
  {
    name: "无重力结",
    mission: "最后两关没有捷径：旋转、观察、再旋转。",
    turns: [2, 3, 1, 0, 3, 2, 0, 1, 3, 2, 1, 0, 2, 3, 0, 1, 2],
  },
  {
    name: "终极折叠",
    mission: "完成九次空间校准，成为真正的魔尺构型师。",
    turns: [1, 0, 2, 3, 1, 3, 0, 2, 1, 0, 3, 2, 0, 1, 3, 2, 1, 0, 3],
  },
];

const DIRECTIONS = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

const STORAGE_KEY = "magic-ruler-3d-progress-v1";
const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");
const levelGrid = document.getElementById("level-grid");
const modal = document.getElementById("completion-modal");
const toast = document.getElementById("toast");

if (!ctx) {
  throw new Error("Magic Ruler 3D requires a 2D canvas context.");
}

const state = {
  levelIndex: 0,
  turns: [],
  selectedJoint: 0,
  moves: 0,
  hints: 0,
  elapsed: 0,
  startedAt: performance.now(),
  solved: false,
  levelScore: 0,
  camera: { yaw: 0.62, pitch: 0.48, zoom: 1 },
  view: { width: 0, height: 0, dpr: 1 },
  pointer: { active: false, moved: false, x: 0, y: 0 },
};

let progress = loadProgress();
let toastTimer = 0;

function loadProgress() {
  const fallback = { completed: [], scores: [], bestTimes: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      completed: Array.isArray(parsed.completed) ? parsed.completed.filter(Number.isInteger) : [],
      scores: Array.isArray(parsed.scores) ? parsed.scores.map((value) => Number(value) || 0) : [],
      bestTimes: Array.isArray(parsed.bestTimes) ? parsed.bestTimes.map((value) => Number(value) || 0) : [],
    };
  } catch {
    return fallback;
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function subtract(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function scale(vector, amount) { return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function length(vector) { return Math.hypot(vector.x, vector.y, vector.z); }
function normalize(vector) {
  const magnitude = length(vector);
  if (magnitude === 0) return { x: 0, y: 1, z: 0 };
  return scale(vector, 1 / magnitude);
}

function perpendicularDirections(previous) {
  return DIRECTIONS.filter((candidate) => dot(previous, candidate) === 0);
}

function buildDirections(turns) {
  const directions = [{ ...DIRECTIONS[0] }];
  for (const turn of turns) {
    const options = perpendicularDirections(directions[directions.length - 1]);
    directions.push({ ...options[turn % options.length] });
  }
  return directions;
}

function buildPoints(turns) {
  const directions = buildDirections(turns);
  const points = [{ x: 0, y: 0, z: 0 }];
  directions.forEach((direction) => {
    points.push(add(points[points.length - 1], direction));
  });
  return points;
}

function getLevel() { return LEVELS[state.levelIndex]; }
function isCompleted(index) { return progress.completed.includes(index); }
function isUnlocked(index) { return index === 0 || isCompleted(index - 1); }

function firstMismatch() {
  const target = getLevel().turns;
  return target.findIndex((value, index) => state.turns[index] !== value);
}

function matchesCount() {
  const target = getLevel().turns;
  return target.reduce((count, value, index) => count + (state.turns[index] === value ? 1 : 0), 0);
}

function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60).toString().padStart(2, "0");
  const remainder = (whole % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function currentElapsed(now = performance.now()) {
  if (state.solved) return state.elapsed;
  return state.elapsed + (now - state.startedAt) / 1000;
}

function loadLevel(index, announce = true) {
  if (index < 0 || index >= LEVELS.length || !isUnlocked(index)) {
    showToast("先完成前一个折叠，解锁新的挑战");
    return;
  }

  state.levelIndex = index;
  const target = getLevel().turns;
  // A deterministic scramble keeps every level playable and reproducible.
  state.turns = target.map((value, joint) => (value + (joint % 3) + 1) % 4);
  state.selectedJoint = firstMismatch() === -1 ? 0 : firstMismatch();
  state.moves = 0;
  state.hints = 0;
  state.elapsed = 0;
  state.startedAt = performance.now();
  state.solved = false;
  state.levelScore = 0;
  modal.hidden = true;
  updateLevelButtons();
  updateHud();
  if (announce) showToast(`已载入第 ${String(index + 1).padStart(2, "0")} 关 · ${getLevel().name}`);
}

function resetLevel(showMessage = true) {
  const index = state.levelIndex;
  loadLevel(index);
  if (showMessage) showToast("本关已重置，重新寻找折向");
}

function rotateSelected(amount) {
  if (state.solved) return;
  const joint = state.selectedJoint;
  if (joint < 0 || joint >= state.turns.length) return;
  state.turns[joint] = (state.turns[joint] + amount + 4) % 4;
  state.moves += 1;
  if (firstMismatch() === -1) {
    finishLevel();
    return;
  }
  const nextMismatch = firstMismatch();
  if (state.turns[joint] === getLevel().turns[joint] && nextMismatch !== -1) {
    state.selectedJoint = nextMismatch;
  }
  updateHud();
}

function selectJoint(joint) {
  if (joint < 0 || joint >= state.turns.length) return;
  state.selectedJoint = joint;
  updateHud();
  showToast(`已选择关节 ${String(joint + 1).padStart(2, "0")}`);
}

function useHint() {
  if (state.solved) return;
  const mismatch = firstMismatch();
  if (mismatch === -1) return;
  state.selectedJoint = mismatch;
  state.turns[mismatch] = getLevel().turns[mismatch];
  state.moves += 1;
  state.hints += 1;
  showToast(`关节 ${String(mismatch + 1).padStart(2, "0")} 已自动校准 · 计入提示`);
  if (firstMismatch() === -1) finishLevel();
  updateHud();
}

function finishLevel() {
  if (state.solved) return;
  state.solved = true;
  state.elapsed = currentElapsed();
  const level = getLevel();
  const base = 900 + state.levelIndex * 125;
  const score = Math.max(100, Math.round(base - state.moves * 14 - state.elapsed * 3 - state.hints * 100));
  state.levelScore = score;
  progress.completed = [...new Set([...progress.completed, state.levelIndex])].sort((a, b) => a - b);
  progress.scores[state.levelIndex] = Math.max(progress.scores[state.levelIndex] || 0, score);
  const oldBest = progress.bestTimes[state.levelIndex] || Infinity;
  progress.bestTimes[state.levelIndex] = Math.min(oldBest, state.elapsed);
  saveProgress();
  updateHud();
  updateLevelButtons();

  document.getElementById("round-score").textContent = String(score).padStart(3, "0");
  document.getElementById("round-time").textContent = formatTime(state.elapsed);
  document.getElementById("round-moves").textContent = String(state.moves).padStart(2, "0");
  const isFinal = state.levelIndex === LEVELS.length - 1;
  document.getElementById("completion-title").textContent = isFinal ? "九重折叠完成" : `${level.name} · 已锁定`;
  document.getElementById("completion-copy").textContent = isFinal
    ? "你完成了全部空间校准，魔尺实验室向你开放。"
    : "每一节都找到了自己的位置，继续挑战下一种空间结构。";
  document.getElementById("next-button").textContent = isFinal ? "重新观察 →" : "下一关 →";
  modal.hidden = false;
}

function updateHud(now = performance.now()) {
  const level = getLevel();
  const elapsed = currentElapsed(now);
  const matches = matchesCount();
  const percentage = Math.round((matches / level.turns.length) * 100);
  const selected = state.selectedJoint + 1;
  const selectedValue = state.turns[state.selectedJoint] ?? 0;
  const selectedTarget = level.turns[state.selectedJoint] ?? 0;
  const totalScore = progress.scores.reduce((sum, score) => sum + (Number(score) || 0), 0);

  document.getElementById("level-number").textContent = String(state.levelIndex + 1).padStart(2, "0");
  document.getElementById("level-name").textContent = level.name;
  document.getElementById("move-count").textContent = String(state.moves).padStart(2, "0");
  document.getElementById("time-count").textContent = formatTime(elapsed);
  document.getElementById("total-score").textContent = String(totalScore).padStart(4, "0");
  document.getElementById("completed-count").textContent = String(progress.completed.length);
  document.getElementById("journey-progress").style.width = `${(progress.completed.length / LEVELS.length) * 100}%`;
  document.getElementById("mission-title").textContent = state.solved ? "构型已锁定" : level.name;
  document.getElementById("mission-copy").textContent = state.solved ? "这一关已经完成，可以继续探索或回看最佳时间。" : level.mission;
  document.getElementById("difficulty-badge").textContent = `LEVEL ${String(state.levelIndex + 1).padStart(2, "0")}`;
  document.getElementById("fact-joints").textContent = String(level.turns.length).padStart(2, "0");
  document.getElementById("fact-best").textContent = progress.bestTimes[state.levelIndex] ? formatTime(progress.bestTimes[state.levelIndex]) : "—";
  document.getElementById("fact-match").textContent = `${percentage}%`;
  document.getElementById("selected-joint").textContent = `关节 ${String(selected).padStart(2, "0")} / ${String(level.turns.length).padStart(2, "0")}`;
  document.getElementById("selected-direction").textContent = state.solved ? "形状已完成" : `折向 ${selectedValue + 1} · 目标 ${selectedTarget + 1}`;
  document.getElementById("scene-segment-count").textContent = `${String(level.turns.length + 1).padStart(2, "0")} SEGMENTS`;
  document.getElementById("coord-x").textContent = state.camera.yaw.toFixed(2);
  document.getElementById("coord-y").textContent = state.camera.pitch.toFixed(2);

  const status = document.getElementById("scene-status");
  status.classList.toggle("solved", state.solved);
  status.innerHTML = `<i></i>${state.solved ? "形状已锁定" : "调整中"}`;
  document.getElementById("solve-chip").hidden = !state.solved;
  document.getElementById("rotate-left").disabled = state.solved;
  document.getElementById("rotate-right").disabled = state.solved;
  document.getElementById("hint-button").disabled = state.solved || firstMismatch() === -1;
}

function updateLevelButtons() {
  levelGrid.querySelectorAll("button").forEach((button) => {
    const index = Number(button.dataset.level);
    button.classList.toggle("current", index === state.levelIndex);
    button.classList.toggle("completed", isCompleted(index));
    button.disabled = !isUnlocked(index);
    button.setAttribute("aria-label", `第 ${index + 1} 关：${LEVELS[index].name}${isCompleted(index) ? "，已完成" : ""}`);
  });
}

function buildLevelButtons() {
  levelGrid.innerHTML = LEVELS.map((level, index) => `
    <button class="level-button" type="button" data-level="${index}">
      <b>${String(index + 1).padStart(2, "0")}</b>
      <small>${level.name}</small>
    </button>
  `).join("");
  levelGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-level]");
    if (!button) return;
    loadLevel(Number(button.dataset.level));
  });
  updateLevelButtons();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2200);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    state.view = { width, height, dpr };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return state.view;
}

function getSceneMetrics(current, target, view) {
  const points = [...current, ...target];
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  points.forEach((point) => {
    min.x = Math.min(min.x, point.x); min.y = Math.min(min.y, point.y); min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x); max.y = Math.max(max.y, point.y); max.z = Math.max(max.z, point.z);
  });
  const center = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };
  const extent = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 4) + 2;
  const scaleValue = Math.min(view.width, view.height) * 0.46 * state.camera.zoom / extent;
  return { center, scale: scaleValue };
}

function project(point, metrics, view) {
  const translated = subtract(point, metrics.center);
  const yaw = state.camera.yaw;
  const pitch = state.camera.pitch;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const x1 = translated.x * cosYaw - translated.z * sinYaw;
  const z1 = translated.x * sinYaw + translated.z * cosYaw;
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const y2 = translated.y * cosPitch - z1 * sinPitch;
  const z2 = translated.y * sinPitch + z1 * cosPitch;
  const focal = 17;
  const perspective = focal / Math.max(7, focal - z2);
  return {
    x: view.width / 2 + x1 * metrics.scale * perspective,
    y: view.height / 2 - y2 * metrics.scale * perspective,
    depth: z2,
    perspective,
  };
}

function drawPolygon(points, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawPolyline(points, style, width, dash = []) {
  if (points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.restore();
}

function drawGrid(metrics, view) {
  const extent = 11;
  const floorY = metrics.center.y - 2.6;
  ctx.save();
  for (let i = -extent; i <= extent; i += 1) {
    const a = project({ x: i, y: floorY, z: -extent }, metrics, view);
    const b = project({ x: i, y: floorY, z: extent }, metrics, view);
    const c = project({ x: -extent, y: floorY, z: i }, metrics, view);
    const d = project({ x: extent, y: floorY, z: i }, metrics, view);
    const opacity = i === 0 ? .18 : .065;
    drawPolyline([a, b], `rgba(100, 181, 196, ${opacity})`, i === 0 ? 1.2 : .7);
    drawPolyline([c, d], `rgba(100, 181, 196, ${opacity})`, i === 0 ? 1.2 : .7);
  }
  const horizon = project({ x: -extent, y: floorY, z: -extent }, metrics, view);
  const horizonEnd = project({ x: extent, y: floorY, z: -extent }, metrics, view);
  drawPolyline([horizon, horizonEnd], "rgba(98, 230, 208, .16)", 1.2);
  ctx.restore();
}

function drawTarget(points, metrics, view) {
  const projected = points.map((point) => project(point, metrics, view));
  ctx.save();
  ctx.shadowColor = "rgba(174, 139, 255, .55)";
  ctx.shadowBlur = 16;
  drawPolyline(projected, "rgba(174, 139, 255, .30)", 8, [3, 12]);
  ctx.shadowBlur = 0;
  drawPolyline(projected, "rgba(204, 181, 255, .9)", 1.35, [5, 8]);
  projected.forEach((point, index) => {
    if (index === 0 || index === projected.length - 1) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(174, 139, 255, .26)";
      ctx.fill();
      ctx.strokeStyle = "rgba(213, 197, 255, .85)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });
  ctx.restore();
}

function prismFaces(start, end, width) {
  const direction = normalize(subtract(end, start));
  const helper = Math.abs(direction.y) < .8 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const side = normalize(cross(direction, helper));
  const top = normalize(cross(direction, side));
  const half = width / 2;
  const startVertices = [
    add(add(start, scale(side, half)), scale(top, half)),
    add(add(start, scale(side, -half)), scale(top, half)),
    add(add(start, scale(side, -half)), scale(top, -half)),
    add(add(start, scale(side, half)), scale(top, -half)),
  ];
  const endVertices = [
    add(add(end, scale(side, half)), scale(top, half)),
    add(add(end, scale(side, -half)), scale(top, half)),
    add(add(end, scale(side, -half)), scale(top, -half)),
    add(add(end, scale(side, half)), scale(top, -half)),
  ];
  const vertices = [...startVertices, ...endVertices];
  return [
    { indices: [0, 1, 5, 4], shade: 0 },
    { indices: [1, 2, 6, 5], shade: 1 },
    { indices: [2, 3, 7, 6], shade: 2 },
    { indices: [3, 0, 4, 7], shade: 3 },
    { indices: [4, 5, 6, 7], shade: 4 },
    { indices: [0, 3, 2, 1], shade: 5 },
  ].map((face) => ({ ...face, vertices }));
}

function drawCurrentChain(points, metrics, view) {
  const projected = points.map((point) => project(point, metrics, view));
  ctx.save();
  ctx.shadowColor = "rgba(98, 230, 208, .6)";
  ctx.shadowBlur = 22;
  drawPolyline(projected, "rgba(98, 230, 208, .22)", 13);
  ctx.shadowBlur = 0;

  const faces = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    prismFaces(points[index], points[index + 1], index === state.selectedJoint || index === state.selectedJoint + 1 ? .58 : .46)
      .forEach((face) => faces.push({ ...face, segment: index }));
  }
  faces.sort((a, b) => {
    const depthA = a.indices.reduce((sum, index) => sum + project(a.vertices[index], metrics, view).depth, 0) / a.indices.length;
    const depthB = b.indices.reduce((sum, index) => sum + project(b.vertices[index], metrics, view).depth, 0) / b.indices.length;
    return depthA - depthB;
  });

  const palette = [
    ["rgba(142, 251, 228, .98)", "rgba(46, 190, 180, .92)", "rgba(20, 111, 127, .95)", "rgba(88, 224, 204, .92)", "rgba(104, 242, 219, .98)", "rgba(11, 67, 88, .98)"],
    ["rgba(255, 215, 143, .99)", "rgba(231, 143, 68, .94)", "rgba(139, 65, 65, .96)", "rgba(255, 179, 102, .94)", "rgba(255, 228, 163, .98)", "rgba(85, 42, 59, .98)"],
  ];
  faces.forEach((face) => {
    const points2d = face.indices.map((index) => project(face.vertices[index], metrics, view));
    const colors = face.segment === state.selectedJoint ? palette[1] : palette[0];
    drawPolygon(points2d, colors[face.shade]);
    ctx.strokeStyle = face.segment === state.selectedJoint ? "rgba(255, 229, 177, .62)" : "rgba(170, 255, 236, .26)";
    ctx.lineWidth = face.segment === state.selectedJoint ? 1.15 : .6;
    ctx.stroke();
  });

  projected.forEach((point, index) => {
    const isJoint = index > 0 && index < projected.length - 1;
    const isSelected = index === state.selectedJoint + 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, isSelected ? 7 : isJoint ? 4 : 5, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "#ffd38f" : index === 0 || index === projected.length - 1 ? "#d5fff4" : "#42cdbb";
    ctx.shadowColor = isSelected ? "rgba(255, 184, 102, .95)" : "rgba(98, 230, 208, .75)";
    ctx.shadowBlur = isSelected ? 18 : 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 14 + Math.sin(performance.now() / 240) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 190, 108, .72)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawAxisWidget(view) {
  const origin = { x: view.width - 58, y: view.height - 48 };
  const axisLength = 22;
  const axes = [
    { vector: { x: 1, y: 0, z: 0 }, color: "#e78b91", label: "X" },
    { vector: { x: 0, y: 1, z: 0 }, color: "#7ee2b7", label: "Y" },
    { vector: { x: 0, y: 0, z: 1 }, color: "#8da8ff", label: "Z" },
  ];
  ctx.save();
  ctx.globalAlpha = .75;
  axes.forEach((axis) => {
    const end = {
      x: origin.x + axis.vector.x * axisLength,
      y: origin.y - axis.vector.y * axisLength - axis.vector.z * 7,
    };
    drawPolyline([origin, end], axis.color, 1.3);
    ctx.fillStyle = axis.color;
    ctx.font = "9px DM Mono, monospace";
    ctx.fillText(axis.label, end.x + 4, end.y + 3);
  });
  ctx.restore();
}

function render(now = performance.now()) {
  const view = resizeCanvas();
  if (!view.width || !view.height) return;
  const current = buildPoints(state.turns);
  const target = buildPoints(getLevel().turns);
  const metrics = getSceneMetrics(current, target, view);

  const gradient = ctx.createLinearGradient(0, 0, 0, view.height);
  gradient.addColorStop(0, "rgba(8, 24, 43, .88)");
  gradient.addColorStop(1, "rgba(3, 11, 20, .98)");
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, view.width, view.height);

  const glow = ctx.createRadialGradient(view.width * .5, view.height * .43, 0, view.width * .5, view.height * .43, Math.max(view.width, view.height) * .5);
  glow.addColorStop(0, "rgba(31, 104, 119, .14)");
  glow.addColorStop(1, "rgba(4, 13, 23, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, view.width, view.height);

  drawGrid(metrics, view);
  drawTarget(target, metrics, view);
  drawCurrentChain(current, metrics, view);
  drawAxisWidget(view);

  // Keep the timer and the camera readout alive without requiring a separate loop.
  if (!state.solved && Math.floor(now / 250) !== Math.floor((now - 16) / 250)) updateHud(now);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function hitJoint(point) {
  const current = buildPoints(state.turns);
  const target = buildPoints(getLevel().turns);
  const metrics = getSceneMetrics(current, target, state.view);
  let nearest = -1;
  let nearestDistance = 24;
  current.forEach((item, index) => {
    if (index === 0 || index === current.length - 1) return;
    const projected = project(item, metrics, state.view);
    const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
    if (distance < nearestDistance) {
      nearest = index - 1;
      nearestDistance = distance;
    }
  });
  return nearest;
}

canvas.addEventListener("pointerdown", (event) => {
  const point = canvasPoint(event);
  state.pointer = { active: true, moved: false, x: point.x, y: point.y };
  canvas.classList.add("is-dragging");
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.pointer.active) return;
  const point = canvasPoint(event);
  const dx = point.x - state.pointer.x;
  const dy = point.y - state.pointer.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) state.pointer.moved = true;
  if (state.pointer.moved) {
    state.camera.yaw += dx * .009;
    state.camera.pitch = clamp(state.camera.pitch + dy * .007, -1.05, 1.05);
    state.pointer.x = point.x;
    state.pointer.y = point.y;
    updateHud();
  }
});

canvas.addEventListener("pointerup", (event) => {
  const point = canvasPoint(event);
  if (state.pointer.active && !state.pointer.moved) {
    const joint = hitJoint(point);
    if (joint !== -1) selectJoint(joint);
  }
  state.pointer.active = false;
  canvas.classList.remove("is-dragging");
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("pointercancel", () => {
  state.pointer.active = false;
  canvas.classList.remove("is-dragging");
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  state.camera.zoom = clamp(state.camera.zoom - event.deltaY * .001, .68, 1.55);
  updateHud();
}, { passive: false });

document.getElementById("rotate-left").addEventListener("click", () => rotateSelected(-1));
document.getElementById("rotate-right").addEventListener("click", () => rotateSelected(1));
document.getElementById("hint-button").addEventListener("click", useHint);
document.getElementById("reset-progress").addEventListener("click", () => {
  if (!window.confirm("确定要清除九关进度和记录吗？")) return;
  progress = { completed: [], scores: [], bestTimes: [] };
  saveProgress();
  loadLevel(0);
  showToast("进度已清除，从第一关重新开始");
});
document.getElementById("stay-button").addEventListener("click", () => { modal.hidden = true; });
document.getElementById("next-button").addEventListener("click", () => {
  modal.hidden = true;
  if (state.levelIndex < LEVELS.length - 1) loadLevel(state.levelIndex + 1);
  else showToast("九关全部完成 · 你已经掌握空间折叠");
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.hidden) {
    modal.hidden = true;
    return;
  }
  if (event.target.matches("input, textarea, select")) return;
  const key = event.key.toLowerCase();
  if (key === "q" || event.key === "ArrowLeft") {
    event.preventDefault();
    rotateSelected(-1);
  } else if (key === "e" || event.key === "ArrowRight") {
    event.preventDefault();
    rotateSelected(1);
  } else if (key === "r") {
    event.preventDefault();
    resetLevel();
  } else if (key === "h") {
    event.preventDefault();
    useHint();
  } else if (/^[1-9]$/.test(event.key)) {
    loadLevel(Number(event.key) - 1);
  }
});

buildLevelButtons();
loadLevel(0, false);
window.addEventListener("resize", () => { resizeCanvas(); });

function animationLoop(now) {
  render(now);
  window.requestAnimationFrame(animationLoop);
}
window.requestAnimationFrame(animationLoop);
