// --- AUDIO SYSTEM ---
class SoundManager {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  playEngine(speedRatio) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(40 + speedRatio * 80, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }
  playSuccess() {
    this.init();
    const notes = [261.63, 329.63, 392.00, 523.25];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.1);
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.1 + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + idx * 0.1);
      osc.stop(this.ctx.currentTime + idx * 0.1 + 0.3);
    });
  }
  playCrash() {
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
}

const sounds = new SoundManager();

// --- MATH EXPRESSION PARSER ---
function evaluateMath(exprStr, xVal) {
  try {
    let clean = exprStr.replace(/\s+/g, '').toLowerCase();
    if (clean.startsWith('y=')) clean = clean.substring(2);

    // Extract domain restriction e.g. {x<2}
    let domainMin = -Infinity;
    let domainMax = Infinity;
    const domainMatch = clean.match(/\{([^}]+)\}/);
    if (domainMatch) {
      const dStr = domainMatch[1];
      clean = clean.replace(/\{([^}]+)\}/, '');
      if (dStr.includes('<')) {
        const parts = dStr.split('<');
        if (parts[0] === 'x') domainMax = parseFloat(parts[1]);
        else if (parts[1] === 'x') domainMin = parseFloat(parts[0]);
      } else if (dStr.includes('>')) {
        const parts = dStr.split('>');
        if (parts[0] === 'x') domainMin = parseFloat(parts[1]);
        else if (parts[1] === 'x') domainMax = parseFloat(parts[0]);
      }
    }

    if (xVal < domainMin || xVal > domainMax) return null;

    clean = clean.replace(/(\d)(x)/g, '$1*$2');
    clean = clean.replace(/x\^2/g, '(x*x)');
    clean = clean.replace(/\^/g, '**');

    const fn = new Function('x', `return ${clean};`);
    const res = fn(xVal);
    return isNaN(res) || !isFinite(res) ? null : res;
  } catch (e) {
    return null;
  }
}

// --- GAME LEVELS ---
const LEVELS = [
  {
    id: 1,
    start: { x: -6, y: -2 },
    target: { x: 4, y: 4 },
    defaultFunctions: ["y = x"]
  },
  {
    id: 2,
    start: { x: -5, y: -1 },
    target: { x: 5, y: 3 },
    defaultFunctions: [""]
  },
  {
    id: 3,
    start: { x: -6, y: 4 },
    target: { x: 4, y: -1 },
    defaultFunctions: [""]
  },
  {
    id: 4,
    start: { x: -6, y: 1 },
    target: { x: 6, y: 1 },
    defaultFunctions: [""]
  },
  {
    id: 5,
    start: { x: -6, y: 5 },
    target: { x: 6, y: 2 },
    defaultFunctions: [""]
  }
];

// --- MAIN APPLICATION STATE ---
let currentLevelIdx = 0;
let functionsList = [];
let isDriving = false;
let car = { x: -6, y: -2, vx: 0, vy: 0, rotation: 0, grounded: false, crashed: false, won: false };

// Canvas Geometry
const canvas = document.getElementById('graphCanvas');
const ctx = canvas.getContext('2d');
let scale = 40;
let originX = 0;
let originY = 0;

// Colors
const COLORS = ['#2d70b3', '#388c46', '#fa7e19', '#c84b4b', '#6042a6'];

// --- UI MANAGERS ---
function initApp() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  loadLevel(currentLevelIdx);

  document.getElementById('addExprBtn').addEventListener('click', () => addFunctionRow(''));
  document.getElementById('addExprRowBtn').addEventListener('click', () => addFunctionRow(''));
  document.getElementById('prevLevelBtn').addEventListener('click', () => changeLevel(-1));
  document.getElementById('nextLevelBtn').addEventListener('click', () => changeLevel(1));
  document.getElementById('startDriveBtn').addEventListener('click', toggleDrive);
  document.getElementById('resetBtn').addEventListener('click', () => resetCarState());

  setInterval(physicsTick, 1000 / 60);
  requestAnimationFrame(renderLoop);
}

function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  originX = canvas.width / 2;
  originY = canvas.height / 2;
}

function loadLevel(idx) {
  currentLevelIdx = idx;
  const lvl = LEVELS[idx];
  document.getElementById('levelIndicator').innerText = `Level ${idx + 1} / ${LEVELS.length}`;
  
  functionsList = [...lvl.defaultFunctions];
  ensureTrailingEmptyExpression();
  resetCarState();
}

function changeLevel(delta) {
  let newIdx = currentLevelIdx + delta;
  if (newIdx >= 0 && newIdx < LEVELS.length) {
    loadLevel(newIdx);
  }
}

function ensureTrailingEmptyExpression() {
  const hasEmptyAtEnd = functionsList.length > 0 && functionsList[functionsList.length - 1].trim() === '';
  if (!hasEmptyAtEnd) {
    functionsList.push('');
    renderExpressionList();
  }
}

function renderExpressionList() {
  const container = document.getElementById('expressionList');
  
  const oldRows = container.querySelectorAll('.function-row');
  oldRows.forEach(r => r.remove());

  functionsList.forEach((exprStr, index) => {
    const row = document.createElement('div');
    row.className = 'expr-row function-row';
    const color = COLORS[index % COLORS.length];

    row.innerHTML = `
      <div class="expr-gutter">
        <span class="expr-num">${index + 2}</span>
        <div class="desmos-icon-wrapper">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="${color}" />
            <path d="M 5 12 Q 9 4, 12 12 T 19 12" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" />
          </svg>
        </div>
      </div>
      <div class="expr-content">
        <div class="math-input-wrapper">
          <input type="text" class="math-input" value="${exprStr}" placeholder="typ een functie, bijv. y = x" data-index="${index}" />
        </div>
        <button class="delete-row-btn" data-index="${index}"><i class="fa-solid fa-xmark"></i></button>
      </div>
    `;

    container.appendChild(row);
  });

  container.querySelectorAll('.math-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.index);
      functionsList[idx] = e.target.value;
      ensureTrailingEmptyExpression();
    });
  });

  container.querySelectorAll('.delete-row-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.closest('.delete-row-btn').dataset.index);
      functionsList.splice(idx, 1);
      ensureTrailingEmptyExpression();
      renderExpressionList();
    });
  });
}

function addFunctionRow(initialVal = '') {
  functionsList.push(initialVal);
  renderExpressionList();
}

function toggleDrive() {
  sounds.init();
  if (isDriving) {
    resetCarState();
  } else {
    isDriving = true;
    const startBtn = document.getElementById('startDriveBtn');
    startBtn.classList.add('reset-state');
    document.getElementById('startText').innerText = 'Reset';
    document.getElementById('startIcon').className = 'fa-solid fa-rotate-left';
  }
}

function resetCarState() {
  const lvl = LEVELS[currentLevelIdx];
  isDriving = false;
  car = {
    x: lvl.start.x,
    y: lvl.start.y,
    vx: 0,
    vy: 0,
    rotation: 0,
    grounded: true,
    crashed: false,
    won: false
  };

  const startBtn = document.getElementById('startDriveBtn');
  startBtn.classList.remove('reset-state');
  document.getElementById('startText').innerText = 'Start';
  document.getElementById('startIcon').className = 'fa-solid fa-play';
}

// --- PHYSICS ENGINE (60 TICKS/SEC) ---
function physicsTick() {
  if (!isDriving || car.crashed || car.won) return;

  const lvl = LEVELS[currentLevelIdx];
  const dt = 1 / 60;
  const gravity = -18;
  const enginePower = 3.5; // Continue continue aandrijfkracht

  let highestY = -Infinity;
  let surfaceAngle = 0;

  if (Math.abs(car.x - lvl.start.x) <= 1.2) {
    highestY = lvl.start.y;
    surfaceAngle = 0;
  }

  if (Math.abs(car.x - lvl.target.x) <= 1.2) {
    if (lvl.target.y > highestY) {
      highestY = lvl.target.y;
      surfaceAngle = 0;
    }
  }

  functionsList.forEach(expr => {
    if (!expr.trim()) return;
    const yVal = evaluateMath(expr, car.x);
    if (yVal !== null && yVal > highestY) {
      const delta = 0.001;
      const y2 = evaluateMath(expr, car.x + delta);
      if (y2 !== null) {
        const slope = (y2 - yVal) / delta;
        surfaceAngle = Math.atan(slope);
      }
      highestY = yVal;
    }
  });

  const onGround = (car.y <= highestY + 0.1) && (car.y >= highestY - 0.4) && (car.vy <= 0);

  if (onGround) {
    car.y = highestY;
    car.vy = 0;
    car.grounded = true;

    // Altijd blijven rijden: minimale voorwaartse snelheid garanderen zodat de auto nooit permanent stilvalt
    if (car.vx < 0.8) {
      car.vx = 0.8; 
    }

    const angleDeg = surfaceAngle * (180 / Math.PI);

    if (angleDeg > 55) {
      // Zeer steile wanden remmen af, maar stoppen nooit volledig
      car.vx = Math.max(0.5, car.vx * 0.92);
    } else {
      const slopeFactor = Math.cos(surfaceAngle);
      car.vx = Math.min(car.vx + enginePower * dt * slopeFactor, 5.0);
      sounds.playEngine(car.vx / 5.0);
    }

    car.rotation = surfaceAngle;
    car.x += car.vx * Math.cos(surfaceAngle) * dt;
    car.y += car.vx * Math.sin(surfaceAngle) * dt;

  } else {
    car.grounded = false;
    car.vy += gravity * dt;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.rotation = Math.atan2(car.vy, car.vx || 0.1);
  }

  const distToTarget = Math.hypot(car.x - lvl.target.x, car.y - lvl.target.y);
  if (distToTarget < 0.8) {
    car.won = true;
    sounds.playSuccess();
  }

  if (car.y < -12) {
    car.crashed = true;
    sounds.playCrash();
  }
}

// --- CANVAS RENDERING LOOP ---
function toCanvasX(x) { return originX + x * scale; }
function toCanvasY(y) { return originY - y * scale; }

function renderLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  drawPlatforms();
  drawFlags();
  drawFunctions();
  drawCar();

  requestAnimationFrame(renderLoop);
}

function drawGrid() {
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#e0e0e0';
  ctx.fillStyle = '#888888';
  ctx.font = '12px sans-serif';

  for (let x = -30; x <= 30; x++) {
    const cx = toCanvasX(x);
    if (cx >= 0 && cx <= canvas.width) {
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, canvas.height);
      ctx.stroke();
      if (x !== 0) ctx.fillText(x, cx + 4, originY + 16);
    }
  }

  for (let y = -20; y <= 20; y++) {
    const cy = toCanvasY(y);
    if (cy >= 0 && cy <= canvas.height) {
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(canvas.width, cy);
      ctx.stroke();
      if (y !== 0) ctx.fillText(y, originX + 4, cy - 4);
    }
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#333333';
  ctx.beginPath();
  ctx.moveTo(0, originY); ctx.lineTo(canvas.width, originY);
  ctx.moveTo(originX, 0); ctx.lineTo(originX, canvas.height);
  ctx.stroke();
}

function drawPlatforms() {
  const lvl = LEVELS[currentLevelIdx];
  ctx.fillStyle = '#666';
  ctx.fillRect(toCanvasX(lvl.start.x - 1), toCanvasY(lvl.start.y), scale * 2, 8);
  ctx.fillRect(toCanvasX(lvl.target.x - 1), toCanvasY(lvl.target.y), scale * 2, 8);
}

function drawFlags() {
  const lvl = LEVELS[currentLevelIdx];
  drawFlag(lvl.start.x, lvl.start.y, '#f1c40f');
  drawFlag(lvl.target.x, lvl.target.y, '#e74c3c');
}

function drawFlag(x, y, color) {
  const cx = toCanvasX(x);
  const cy = toCanvasY(y);

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - 35);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 35);
  ctx.lineTo(cx + 18, cy - 26);
  ctx.lineTo(cx, cy - 17);
  ctx.closePath();
  ctx.fill();
}

function drawFunctions() {
  functionsList.forEach((expr, index) => {
    if (!expr.trim()) return;
    const color = COLORS[index % COLORS.length];

    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.beginPath();

    let started = false;

    for (let px = 0; px < canvas.width; px += 2) {
      const xVal = (px - originX) / scale;
      const yVal = evaluateMath(expr, xVal);

      if (yVal !== null) {
        const py = toCanvasY(yVal);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      } else {
        started = false;
      }
    }
    ctx.stroke();
  });
}

function drawCar() {
  const cx = toCanvasX(car.x);
  const cy = toCanvasY(car.y);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-car.rotation);

  ctx.fillStyle = '#2d70b3';
  ctx.fillRect(-18, -12, 36, 10);

  ctx.fillStyle = '#1e5288';
  ctx.fillRect(-10, -18, 20, 7);

  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(-10, -2, 5, 0, Math.PI * 2);
  ctx.arc(10, -2, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

window.onload = initApp;