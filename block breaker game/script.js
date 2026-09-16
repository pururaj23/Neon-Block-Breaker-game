window.requestAnimationFrame =
  window.requestAnimationFrame ||
  window.webkitRequestAnimationFrame ||
  window.mozRequestAnimationFrame ||
  function (callback) {
    window.setTimeout(callback, 1000 / 60);
  };

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreDisplay = document.getElementById("score-display");
const levelDisplay = document.getElementById("level-display");
const livesDisplay = document.getElementById("lives-display");
const highScoreDisplay = document.getElementById("highscore-display");
const messageDisplay = document.getElementById("message");
const pauseBtn = document.getElementById("pause-btn");

let isPlaying = false;
let isPaused = false;
let isGameOver = true;
let stateLock = false;
let score = 0;
let highScore = localStorage.getItem("neonBreakerHighScore") || 0;
highScoreDisplay.innerText = `HIGH: ${highScore}`;
let lives = 3;
let level = 1;
const maxLevel = 3;
const neonColors = [
  "#ff0055",
  "#00ffaa",
  "#00aaff",
  "#ffff00",
  "#ffaa00",
  "#ff00ff",
  "#00ffff",
];

let isMobile = false;
let brickRowCount, brickColumnCount;
let brickWidth, brickHeight;
let brickPadding = 10;
let brickOffsetTop = 85;
let brickOffsetLeft = 35;
let bricks = [];
let balls = [];
let powerUps = [];

const paddle = {
  widthMultiplier: 1,
  width: 120,
  height: 16,
  x: 0,
  y: 0,
  speed: 8,
  dx: 0,
  color: "#0aa",
};

const safeDrawRect =
  typeof ctx.roundRect === "function"
    ? function (x, y, w, h, r) {
        ctx.roundRect(x, y, w, h, r);
      }
    : function (x, y, w, h, r) {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
      };

let hazardPattern;
function initHazardPattern() {
  const pCanv = document.createElement("canvas");
  pCanv.width = 24;
  pCanv.height = 24;
  const pCtx = pCanv.getContext("2d");
  pCtx.fillStyle = "#333";
  pCtx.fillRect(0, 0, 24, 24);
  pCtx.strokeStyle = "#111";
  pCtx.lineWidth = 4;
  pCtx.beginPath();
  pCtx.moveTo(-12, 12);
  pCtx.lineTo(12, -12);
  pCtx.moveTo(0, 24);
  pCtx.lineTo(24, 0);
  pCtx.moveTo(12, 36);
  pCtx.lineTo(36, 12);
  pCtx.stroke();
  hazardPattern = ctx.createPattern(pCanv, "repeat");
}
initHazardPattern();

function updateBrickPositions() {
  if (!bricks || bricks.length === 0) return;
  for (let c = 0; c < brickColumnCount; c++) {
    if (!bricks[c]) continue; 
    for (let r = 0; r < brickRowCount; r++) {
      if (bricks[c][r]) {
        bricks[c][r].x = c * (brickWidth + brickPadding) + brickOffsetLeft;
        bricks[c][r].y = r * (brickHeight + brickPadding) + brickOffsetTop;
      }
    }
  }
}

function applyResponsiveLayout() {
  isMobile = window.innerWidth <= 600;
  canvas.width = isMobile ? 600 : 800;
  canvas.height = isMobile ? 800 : 600;

  paddle.width = (isMobile ? 100 : 120) * paddle.widthMultiplier;
  paddle.y = canvas.height - 40;
  paddle.speed = isMobile ? 6 : 8;
  if (paddle.x + paddle.width > canvas.width)
    paddle.x = canvas.width - paddle.width;

  brickPadding = isMobile ? 6 : 10;
  brickOffsetTop = isMobile ? 100 : 85;
  brickOffsetLeft = isMobile ? 20 : 35;

  if (brickColumnCount) {
    brickWidth =
      (canvas.width -
        brickOffsetLeft * 2 -
        (brickColumnCount - 1) * brickPadding) /
      brickColumnCount;
    brickHeight = isMobile ? brickWidth : 22;
    updateBrickPositions();
  }
}
window.addEventListener("resize", applyResponsiveLayout);


const SoundEngine = {
  ctx: null,
  scale: [
    261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0,
    1046.5, 1174.66,
  ],
  init: function () {
    if (!this.ctx)
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  playTone: function (freq, type, duration, vol = 0.1, slideFreq = null) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slideFreq)
      osc.frequency.exponentialRampToValueAtTime(
        slideFreq,
        this.ctx.currentTime + duration,
      );
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      this.ctx.currentTime + duration,
    );
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },
  bounceWall: function () {
    this.playTone(196, "sine", 0.1, 0.15);
  },
  bouncePaddle: function () {
    this.playTone(130.81, "triangle", 0.15, 0.2);
  },
  hitUnbreakable: function () {
    this.playTone(100, "sawtooth", 0.15, 0.15);
  },
  crackBrick: function (c) {
    this.playTone(this.scale[c % this.scale.length] / 2, "square", 0.1, 0.05);
  },
  hitBrick: function (c) {
    this.playTone(this.scale[c % this.scale.length], "square", 0.15, 0.08);
  },
  loseLife: function () {
    this.playTone(200, "sawtooth", 0.6, 0.2, 50);
  },
  powerUp: function () {
    this.playTone(659.25, "sine", 0.2, 0.15, 1046.5);
  },
  levelUp: function () {
    [261.63, 329.63, 392.0, 523.25].forEach((freq, i) =>
      setTimeout(() => this.playTone(freq, "square", 0.2, 0.1), i * 120),
    );
  },
};

function createBall(x, y, dx, dy, radius) {
  const trail = Array.from({ length: 10 }, () => ({
    x: 0,
    y: 0,
    active: false,
  }));
  return { radius, x, y, dx, dy, color: "#fff", trail, trailIdx: 0 };
}

function initBricks() {
  if (level === 1) {
    brickRowCount = 5;
    brickColumnCount = 8;
  } else if (level === 2) {
    brickRowCount = 7;
    brickColumnCount = 10;
  } else if (level === 3) {
    brickRowCount = 9;
    brickColumnCount = 12;
  }

  applyResponsiveLayout();
  bricks = [];

  for (let c = 0; c < brickColumnCount; c++) {
    bricks[c] = [];
    let unbreakableCountCol = 0;
    for (let r = 0; r < brickRowCount; r++) {
      let status = 1;
      let baseColor = neonColors[r % neonColors.length];
      let displayColor = baseColor;
      let rand = Math.random();

      if (rand < 0.1 && r < brickRowCount - 1 && unbreakableCountCol < 2) {
        status = -1;
        unbreakableCountCol++;
      } else if (rand < 0.35) {
        status = 2;
        displayColor = "#ffffff";
      }
      bricks[c][r] = {
        x: 0,
        y: 0,
        status: status,
        color: displayColor,
        baseColor: baseColor,
      };
    }
  }
  updateBrickPositions();
}

function spawnPowerUp(x, y) {
  const types = ["EXPAND", "MULTIBALL"];
  const type = types[Math.floor(Math.random() * types.length)];
  const size = isMobile ? 22 : 28;
  powerUps.push({
    x: x - size / 2,
    y: y,
    size: size,
    dy: isMobile ? 2 : 2.5,
    type: type,
    color: type === "EXPAND" ? "#00aaff" : "#00ffaa",
    symbol: type === "EXPAND" ? "↔" : "x3",
  });
}

function updatePowerUps() {
  for (let i = powerUps.length - 1; i >= 0; i--) {
    let p = powerUps[i];
    p.y += p.dy;
    if (
      p.y + p.size > paddle.y &&
      p.y < paddle.y + paddle.height &&
      p.x + p.size > paddle.x &&
      p.x < paddle.x + paddle.width
    ) {
      SoundEngine.powerUp();
      if (p.type === "EXPAND") {
        paddle.widthMultiplier = 1.5;
        applyResponsiveLayout();
      } else if (
        p.type === "MULTIBALL" &&
        balls.length > 0 &&
        balls.length < 15
      ) {
        let ref = balls[0];
        let speed = Math.sqrt(ref.dx * ref.dx + ref.dy * ref.dy);
        balls.push(
          createBall(ref.x, ref.y, speed * 0.7, -speed * 0.7, ref.radius),
        );
        balls.push(
          createBall(ref.x, ref.y, -speed * 0.7, -speed * 0.7, ref.radius),
        );
      }
      powerUps.splice(i, 1);
    } else if (p.y > canvas.height) powerUps.splice(i, 1);
  }
}

function drawPowerUps() {
  if (powerUps.length === 0) return;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  powerUps.forEach((p) => {
    ctx.beginPath();
    safeDrawRect(p.x, p.y, p.size, p.size, 4);
    ctx.fillStyle = "#111";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = p.color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = p.color;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = p.color;
    ctx.font = `bold ${p.size * 0.5}px Orbitron, sans-serif`;
    ctx.fillText(p.symbol, p.x + p.size / 2, p.y + p.size / 2);
    ctx.closePath();
  });
}

function drawPaddle() {
  ctx.beginPath();
  safeDrawRect(paddle.x, paddle.y, paddle.width, paddle.height, 8);
  ctx.fillStyle = paddle.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#0ff";
  ctx.stroke();
  ctx.closePath();
}

function drawBall() {
  balls.forEach((ball) => {
    for (let i = 0; i < 10; i++) {
      let idx = (ball.trailIdx + i) % 10;
      let pt = ball.trail[idx];
      if (!pt.active) continue;

      let alpha = (i / 10) * 0.4;
      let size = ball.radius * (0.4 + (i / 10) * 0.6);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
      ctx.closePath();
    }
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#fff";
    ctx.fill();
    ctx.closePath();
    ctx.shadowBlur = 0;
  });
}

function drawBricks() {
  const cornerRadius = isMobile ? 8 : 4;
  for (let c = 0; c < brickColumnCount; c++) {
    for (let r = 0; r < brickRowCount; r++) {
      let b = bricks[c][r];
      if (b.status !== 0) {
        ctx.beginPath();
        safeDrawRect(b.x, b.y, brickWidth, brickHeight, cornerRadius);

        if (b.status === -1) {
          ctx.fillStyle = hazardPattern;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#777";
          ctx.stroke();
        } else {
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = b.color;
          ctx.fill();
          ctx.globalAlpha = 1.0;
          ctx.lineWidth = 2;
          ctx.strokeStyle = b.color;
          ctx.shadowBlur = 12;
          ctx.shadowColor = b.color;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.closePath();
      }
    }
  }
}

function checkLevelComplete() {
  let activeBreakableBricks = 0;
  for (let c = 0; c < brickColumnCount; c++) {
    for (let r = 0; r < brickRowCount; r++) {
      if (bricks[c][r].status > 0) activeBreakableBricks++;
    }
  }
  if (activeBreakableBricks === 0) {
    isPlaying = false;
    stateLock = true;
    setTimeout(() => {
      stateLock = false;
    }, 800);
    SoundEngine.levelUp();

    if (level < maxLevel) {
      level++;
      messageDisplay.innerHTML = `LEVEL ${level}<br><span style="font-size: clamp(0.8rem, 2vw, 1rem); color:#aaa;">TAP TO CONTINUE</span>`;
      initBricks();
    } else {
      isGameOver = true;
      messageDisplay.innerHTML = `YOU WIN!<br><span style="font-size: clamp(0.8rem, 2vw, 1rem); color:#aaa;">TAP TO RESTART</span>`;
    }
    messageDisplay.classList.remove("hidden");
    levelDisplay.innerText = `LEVEL: ${level}`;
  }
}

function collisionDetection() {
  let hitRegistered = false;

  for (let i = 0; i < balls.length; i++) {
    let ball = balls[i];

    let startC = Math.max(
      0,
      Math.floor(
        (ball.x - ball.radius - brickOffsetLeft) / (brickWidth + brickPadding),
      ),
    );
    let endC = Math.min(
      brickColumnCount - 1,
      Math.floor(
        (ball.x + ball.radius - brickOffsetLeft) / (brickWidth + brickPadding),
      ),
    );
    let startR = Math.max(
      0,
      Math.floor(
        (ball.y - ball.radius - brickOffsetTop) / (brickHeight + brickPadding),
      ),
    );
    let endR = Math.min(
      brickRowCount - 1,
      Math.floor(
        (ball.y + ball.radius - brickOffsetTop) / (brickHeight + brickPadding),
      ),
    );

    for (let c = startC; c <= endC; c++) {
      for (let r = startR; r <= endR; r++) {
        let b = bricks[c][r];
        if (b.status !== 0) {
          if (
            ball.x + ball.radius > b.x &&
            ball.x - ball.radius < b.x + brickWidth &&
            ball.y + ball.radius > b.y &&
            ball.y - ball.radius < b.y + brickHeight
          ) {
            let overlapLeft = ball.x + ball.radius - b.x;
            let overlapRight = b.x + brickWidth - (ball.x - ball.radius);
            let overlapTop = ball.y + ball.radius - b.y;
            let overlapBottom = b.y + brickHeight - (ball.y - ball.radius);
            let minOverlap = Math.min(
              overlapLeft,
              overlapRight,
              overlapTop,
              overlapBottom,
            );

            if (minOverlap === overlapLeft) {
              ball.dx = -Math.abs(ball.dx);
              ball.x = b.x - ball.radius;
            } else if (minOverlap === overlapRight) {
              ball.dx = Math.abs(ball.dx);
              ball.x = b.x + brickWidth + ball.radius;
            } else if (minOverlap === overlapTop) {
              ball.dy = -Math.abs(ball.dy);
              ball.y = b.y - ball.radius;
            } else if (minOverlap === overlapBottom) {
              ball.dy = Math.abs(ball.dy);
              ball.y = b.y + brickHeight + ball.radius;
            }

            if (b.status > 0) {
              b.status--;
              if (b.status === 1) {
                b.color = b.baseColor;
                score += 5;
                SoundEngine.crackBrick(c);
              } else if (b.status === 0) {
                score += 10;
                SoundEngine.hitBrick(c);
                if (Math.random() < 0.15)
                  spawnPowerUp(b.x + brickWidth / 2, b.y + brickHeight / 2);
              }
              scoreDisplay.innerText = `SCORE: ${score}`;
              if (score > highScore) {
                highScore = score;
                localStorage.setItem("neonBreakerHighScore", highScore); // Saves to browser memory
                highScoreDisplay.innerText = `HIGH: ${highScore}`;
              }
            } else if (b.status === -1) {
              SoundEngine.hitUnbreakable();
            }

            hitRegistered = true;
            break;
          }
        }
      }
      if (hitRegistered) break;
    }
  }
  if (hitRegistered) checkLevelComplete();
}

function update() {
  paddle.x += paddle.dx;
  if (paddle.x < 0) paddle.x = 0;
  if (paddle.x + paddle.width > canvas.width)
    paddle.x = canvas.width - paddle.width;

  for (let i = balls.length - 1; i >= 0; i--) {
    let ball = balls[i];

    ball.trail[ball.trailIdx].x = ball.x;
    ball.trail[ball.trailIdx].y = ball.y;
    ball.trail[ball.trailIdx].active = true;
    ball.trailIdx = (ball.trailIdx + 1) % 10;

    ball.x += ball.dx;
    ball.y += ball.dy;

    if (
      ball.x + ball.dx > canvas.width - ball.radius ||
      ball.x + ball.dx < ball.radius
    ) {
      ball.dx = -ball.dx;
      SoundEngine.bounceWall();
    }
    if (ball.y + ball.dy < ball.radius) {
      ball.dy = -ball.dy;
      SoundEngine.bounceWall();
    } else if (ball.y + ball.dy > canvas.height - ball.radius) {
      balls.splice(i, 1);
      continue;
    }

    if (
      ball.dy > 0 &&
      ball.y + ball.radius >= paddle.y &&
      ball.y - ball.radius < paddle.y + paddle.height &&
      ball.x + ball.radius >= paddle.x &&
      ball.x - ball.radius <= paddle.x + paddle.width
    ) {
      SoundEngine.bouncePaddle();
      let hitPoint = ball.x - (paddle.x + paddle.width / 2);
      let angle = (hitPoint / (paddle.width / 2)) * (Math.PI / 3);
      let currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
      ball.dx = currentSpeed * Math.sin(angle);
      ball.dy = -currentSpeed * Math.cos(angle);
      ball.y = paddle.y - ball.radius;
    }
  }

  if (balls.length === 0 && isPlaying && !stateLock) {
    lives--;
    livesDisplay.innerText = `LIVES: ${lives}`;
    isPlaying = false;
    stateLock = true;
    setTimeout(() => {
      stateLock = false;
    }, 500);
    SoundEngine.loseLife();

    if (lives <= 0) {
      isGameOver = true;
      messageDisplay.innerHTML = `GAME OVER<br><span style="font-size: clamp(0.8rem, 2vw, 1rem); color:#aaa;">TAP TO RESTART</span>`;
    } else {
      messageDisplay.innerHTML = `BALL LOST!<br><span style="font-size: clamp(0.8rem, 2vw, 1rem); color:#aaa;">TAP TO CONTINUE</span>`;
    }
    messageDisplay.classList.remove("hidden");
  }

  updatePowerUps();
  collisionDetection();
}

function gameLoop() {
  requestAnimationFrame(gameLoop);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBricks();
  drawPowerUps();
  drawPaddle();
  drawBall();

  if (isPlaying) update();
}

function resetBall() {
  paddle.widthMultiplier = 1;
  powerUps = [];
  applyResponsiveLayout();

  let speedMultiplier = 1 + (level - 1) * 0.2;
  let baseSpeed = isMobile ? 3.5 : 4;

  balls = [
    createBall(
      canvas.width / 2,
      paddle.y - (isMobile ? 7 : 8) - 2,
      baseSpeed * speedMultiplier * (Math.random() > 0.5 ? 1 : -1),
      -baseSpeed * speedMultiplier,
      isMobile ? 7 : 8,
    ),
  ];

  paddle.x = canvas.width / 2 - paddle.width / 2;
}

function togglePause() {
  if (isGameOver || stateLock || (!isPlaying && !isPaused)) return;
  if (isPaused) {
    isPaused = false;
    isPlaying = true;
    messageDisplay.classList.add("hidden");
    pauseBtn.innerHTML = "⏸";
  } else {
    isPaused = true;
    isPlaying = false;
    messageDisplay.innerHTML = `PAUSED<br><span style="font-size: clamp(0.8rem, 2vw, 1rem); color:#aaa;">TAP OR PRESS SPACE TO RESUME</span>`;
    messageDisplay.classList.remove("hidden");
    pauseBtn.innerHTML = "▶";
  }
}

function startGame() {
  SoundEngine.init();
  if (stateLock) return;
  if (isPaused) {
    togglePause();
    return;
  }
  if (isPlaying) return;

  if (isGameOver) {
    score = 0;
    lives = 3;
    level = 1;
    isGameOver = false;
    initBricks();
  }

  scoreDisplay.innerText = `SCORE: ${score}`;
  livesDisplay.innerText = `LIVES: ${lives}`;
  levelDisplay.innerText = `LEVEL: ${level}`;

  resetBall();
  messageDisplay.classList.add("hidden");
  isPlaying = true;
}

pauseBtn.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  togglePause();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Right" || e.key === "ArrowRight") paddle.dx = paddle.speed;
  else if (e.key === "Left" || e.key === "ArrowLeft") paddle.dx = -paddle.speed;
  else if (e.key === " " || e.key === "Enter") startGame();
  else if (e.key === "p" || e.key === "P" || e.key === "Escape") togglePause();
});

document.addEventListener("keyup", (e) => {
  if (
    e.key === "Right" ||
    e.key === "ArrowRight" ||
    e.key === "Left" ||
    e.key === "ArrowLeft"
  )
    paddle.dx = 0;
});

function handlePointerMove(clientX) {
  const rect = canvas.getBoundingClientRect();
  let relativeX = (clientX - rect.left) * (canvas.width / rect.width);
  let newX = relativeX - paddle.width / 2;
  if (newX < 0) newX = 0;
  if (newX + paddle.width > canvas.width) newX = canvas.width - paddle.width;
  paddle.x = newX;
}

document.addEventListener("pointerdown", (e) => {
  if (e.target === pauseBtn) return;
  if (!isPlaying) startGame();
  else handlePointerMove(e.clientX);
});

document.addEventListener("pointermove", (e) => {
  if (isPlaying) handlePointerMove(e.clientX);
});
document.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
  },
  { passive: false },
);

applyResponsiveLayout();
initBricks();
gameLoop();
