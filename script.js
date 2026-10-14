// --- MATH EXPRESSION PARSER ---
function parseVerticalLineX(exprStr) {
  let clean = exprStr.replace(/\s+/g, '').toLowerCase();
  const match = clean.match(/^x=([+-]?\d*\.?\d+)$/);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

function evaluateMath(exprStr, xVal) {
  try {
    let clean = exprStr.replace(/\s+/g, '').toLowerCase();
    if (clean.startsWith('y=')) clean = clean.substring(2);

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
let car = { x: -6, y: -2, vx: 1.5, vy: 0, rotation: 0, grounded: true, crashed: false, won: false };
let particles = [];

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
          <input type="text" class="math-input" value="${exprStr}" placeholder="typ een functie, bijv. y = x of x = 2" data-index="${index}" />
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
    vx: 1.5,
    vy: 0,
    rotation: 0,
    grounded: true,
    crashed: false,
    won: false
  };
  particles = [];

  const startBtn = document.getElementById('startDriveBtn');
  startBtn.classList.remove('reset-state');
  document.getElementById('startText').innerText = 'Start';
  document.getElementById('startIcon').className = 'fa-solid fa-play';
}

function triggerConfetti(targetX, targetY) {
  const cx = toCanvasX(targetX);
  const cy = toCanvasY(targetY);
  const particleColors = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#e67e22'];

  for (let i = 0; i < 100; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 8;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      color: particleColors[Math.floor(Math.random() * particleColors.length)],
      size: 4 + Math.random() * 6,
      alpha: 1.0,
      decay: 0.015 + Math.random() * 0.02
    });
  }
}

// --- PHYSICS ENGINE (ANTI-PHASING / ANTI-TUNNELING) ---
function physicsTick() {
  if (car.crashed) return;

  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.2;
    p.alpha -= p.decay;
  });
  particles = particles.filter(p => p.alpha > 0);

  if (!isDriving || car.won) return;

  const lvl = LEVELS[currentLevelIdx];
  const dt = 1 / 60;
  const gravity = -16;
  const enginePower = 3.5;

  const substeps = 8; // Meer substeps om phasen absoluut te voorkomen
  const subDt = dt / substeps;

  for (let step = 0; step < substeps; step++) {
    // 1. Stricte botsing met verticale muren (x = getal)
    let hitVerticalWall = false;
    let wallX = 0;
    functionsList.forEach(expr => {
      if (!expr.trim()) return;
      const vertX = parseVerticalLineX(expr);
      if (vertX !== null) {
        if (Math.abs(car.x - vertX) <= 0.45) {
          hitVerticalWall = true;
          wallX = vertX;
        }
      }
    });

    if (hitVerticalWall) {
      if (car.vx > 0) {
        car.x = wallX - 0.46;
        car.vx = -Math.abs(car.vx) * 0.7;
      } else {
        car.x = wallX + 0.46;
        car.vx = Math.abs(car.vx) * 0.7;
      }
      car.vy = Math.max(Math.abs(car.vx) * 0.8, 3.5);
      car.grounded = false;
      car.vy += gravity * subDt;
      car.x += car.vx * subDt;
      car.y += car.vy * subDt;
      car.rotation = Math.atan2(car.vy, car.vx);
      continue;
    }

    let targetSurfaceY = null;
    let surfaceAngle = 0;

    // 2. Check start platform
    if (Math.abs(car.x - lvl.start.x) <= 1.2 && Math.abs(car.y - lvl.start.y) <= 0.6) {
      targetSurfaceY = lvl.start.y;
      surfaceAngle = 0;
    }

    // 3. Check target platform
    if (Math.abs(car.x - lvl.target.x) <= 1.2 && Math.abs(car.y - lvl.target.y) <= 0.6) {
      targetSurfaceY = lvl.target.y;
      surfaceAngle = 0;
    }

    // 4. Check functies nabij de auto om doorheen vallen (phasing) te blokkeren
    if (targetSurfaceY === null) {
      functionsList.forEach(expr => {
        if (!expr.trim()) return;
        const vertX = parseVerticalLineX(expr);
        if (vertX !== null) return;

        const yVal = evaluateMath(expr, car.x);
        if (yVal !== null) {
          // Als de auto op of net boven/onder de lijn is, vang hem op
          if (car.y >= yVal - 0.35 && car.y <= yVal + 0.5) {
            if (targetSurfaceY === null || Math.abs(yVal - car.y) < Math.abs(targetSurfaceY - car.y)) {
              const delta = 0.001;
              const y2 = evaluateMath(expr, car.x + delta);
              if (y2 !== null) {
                const slope = (y2 - yVal) / delta;
                surfaceAngle = Math.atan(slope);
              }
              targetSurfaceY = yVal;
            }
          }
        }
      });
    }

    if (targetSurfaceY !== null && car.y <= targetSurfaceY + 0.35 && car.vy <= 0) {
      car.y = targetSurfaceY;
      car.vy = 0;
      car.grounded = true;

      const angleDeg = surfaceAngle * (180 / Math.PI);

      if (angleDeg > 45) {
        const excessSteepness = (angleDeg - 45) / 45;
        car.vx -= (1.5 + excessSteepness * 5.0) * subDt;
        
        if (car.vx < 0) {
          car.vx -= 2.0 * subDt;
        }
      } else if (Math.abs(angleDeg) < 1) {
        car.vx = Math.min(car.vx + 0.5 * subDt, 6.0);
      } else if (angleDeg > 0 && angleDeg <= 45) {
        const slopeFactor = Math.cos(surfaceAngle);
        car.vx = Math.min(car.vx + enginePower * subDt * slopeFactor, 4.5);
      } else {
        car.vx = Math.min(car.vx + 2.0 * enginePower * subDt, 5.5);
      }

      car.rotation = surfaceAngle;
      car.x += car.vx * Math.cos(surfaceAngle) * subDt;
      car.y += car.vx * Math.sin(surfaceAngle) * subDt;

    } else {
      car.grounded = false;
      car.vy += gravity * subDt;
      car.x += car.vx * subDt;
      car.y += car.vy * subDt;
      car.rotation = Math.atan2(car.vy, car.vx || 0.1);

      // Extra vangnet om phasing tegen te gaan tijdens vallen
      if (targetSurfaceY !== null && car.y <= targetSurfaceY && car.vy <= 0) {
        car.y = targetSurfaceY;
        car.vy = 0;
        car.grounded = true;
      }
    }
  }

  const distToTarget = Math.hypot(car.x - lvl.target.x, car.y - lvl.target.y);
  if (distToTarget < 0.8 && !car.won) {
    car.won = true;
    triggerConfetti(lvl.target.x, lvl.target.y);
  }

  if (car.y < -12) {
    car.crashed = true;
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
  drawConfetti();
  drawVersionText();

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

    const vertX = parseVerticalLineX(expr);
    if (vertX !== null) {
      const cx = toCanvasX(vertX);
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, canvas.height);
      ctx.stroke();
      return;
    }

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

function drawConfetti() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.restore();
  });
}

function drawVersionText() {
  ctx.save();
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#888888';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('v0.1.0.17', canvas.width - 16, canvas.height - 16);
  ctx.restore();
}

window.onload = initApp;