const canvas = document.querySelector('#pig-game');
const ctx = canvas.getContext('2d');
const overlay = document.querySelector('#game-overlay');
const scoreNode = document.querySelector('#game-score');
const bestNode = document.querySelector('#game-best');
const groundY = 338;
const pig = { x: 105, y: groundY - 62, width: 78, height: 58, velocity: 0 };
let obstacles = [];
let particles = [];
let score = 0;
let best = Number(localStorage.getItem('pig-runner-best')) || 0;
let speed = 7;
let spawnIn = 110;
let running = false;
let lastTime = 0;
let frame = 0;

bestNode.textContent = best;

function startGame() {
  obstacles = [];
  particles = [];
  score = 0;
  speed = 7;
  spawnIn = 95;
  pig.y = groundY - pig.height;
  pig.velocity = 0;
  running = true;
  lastTime = performance.now();
  overlay.hidden = true;
  scoreNode.textContent = '0';
  requestAnimationFrame(loop);
}

function jump() {
  if (!running) return startGame();
  if (pig.y >= groundY - pig.height - 2) {
    pig.velocity = -16.5;
    for (let i = 0; i < 6; i += 1) particles.push({ x: pig.x + 20, y: groundY - 5, vx: -Math.random() * 3, vy: -Math.random() * 2, life: 25 });
  }
}

function loop(now) {
  if (!running) return;
  if (document.querySelector('#pig-game-page').hidden) {
    running = false;
    overlay.querySelector('strong').textContent = 'Game paused';
    overlay.querySelector('span').textContent = 'Press start when you return';
    document.querySelector('#game-start').textContent = 'Start again';
    overlay.hidden = false;
    return;
  }
  const delta = Math.min(1.8, (now - lastTime) / 16.67);
  lastTime = now;
  update(delta);
  draw();
  if (running) requestAnimationFrame(loop);
}

function update(delta) {
  frame += delta;
  pig.velocity += 0.88 * delta;
  pig.y = Math.min(groundY - pig.height, pig.y + pig.velocity * delta);
  if (pig.y === groundY - pig.height) pig.velocity = 0;
  spawnIn -= delta;
  if (spawnIn <= 0) {
    const kinds = ['fence', 'puddle', 'crate'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const sizes = { fence: [38, 72], puddle: [78, 22], crate: [49, 49] };
    obstacles.push({ kind, x: canvas.width + 20, width: sizes[kind][0], height: sizes[kind][1] });
    spawnIn = 78 + Math.random() * 62 - Math.min(25, score / 35);
  }
  for (const obstacle of obstacles) obstacle.x -= speed * delta;
  obstacles = obstacles.filter(obstacle => obstacle.x + obstacle.width > -10);
  for (const particle of particles) { particle.x += particle.vx * delta; particle.y += particle.vy * delta; particle.life -= delta; }
  particles = particles.filter(particle => particle.life > 0);
  score += 0.12 * delta;
  speed = Math.min(13, 7 + score / 120);
  scoreNode.textContent = Math.floor(score);
  const hitbox = { x: pig.x + 12, y: pig.y + 8, width: pig.width - 20, height: pig.height - 10 };
  if (obstacles.some(obstacle => intersects(hitbox, { x: obstacle.x + 3, y: groundY - obstacle.height + 3, width: obstacle.width - 6, height: obstacle.height - 3 }))) gameOver();
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function gameOver() {
  running = false;
  best = Math.max(best, Math.floor(score));
  localStorage.setItem('pig-runner-best', String(best));
  bestNode.textContent = best;
  overlay.querySelector('strong').textContent = 'Oops!';
  overlay.querySelector('span').textContent = `Score ${Math.floor(score)} · Tap to run again`;
  document.querySelector('#game-start').textContent = 'Play again';
  overlay.hidden = false;
}

function draw() {
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#78d5ef');
  sky.addColorStop(1, '#d9f4ef');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawSun();
  drawCloud(170 - (frame * 0.25) % 1100, 75, 1);
  drawCloud(610 - (frame * 0.17) % 1200, 120, .75);
  drawHills();
  ctx.fillStyle = '#70bb62';
  ctx.fillRect(0, groundY - 17, canvas.width, 60);
  ctx.fillStyle = '#b87942';
  ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
  ctx.fillStyle = '#d99b5e';
  for (let x = -(frame * speed * .8) % 56; x < canvas.width; x += 56) ctx.fillRect(x, groundY + 34, 28, 5);
  for (const particle of particles) { ctx.globalAlpha = particle.life / 25; ctx.fillStyle = '#a76739'; ctx.beginPath(); ctx.arc(particle.x, particle.y, 4, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const obstacle of obstacles) drawObstacle(obstacle);
  drawPig();
}

function drawSun() {
  ctx.fillStyle = '#ffd35a';
  ctx.beginPath(); ctx.arc(780, 72, 36, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffd35a'; ctx.lineWidth = 5;
  for (let i = 0; i < 8; i += 1) { const angle = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(780 + Math.cos(angle) * 48, 72 + Math.sin(angle) * 48); ctx.lineTo(780 + Math.cos(angle) * 59, 72 + Math.sin(angle) * 59); ctx.stroke(); }
}

function drawCloud(x, y, scale) {
  ctx.fillStyle = '#ffffffdd';
  ctx.beginPath(); ctx.arc(x, y, 25 * scale, 0, Math.PI * 2); ctx.arc(x + 28 * scale, y - 10 * scale, 31 * scale, 0, Math.PI * 2); ctx.arc(x + 60 * scale, y, 24 * scale, 0, Math.PI * 2); ctx.fill();
}

function drawHills() {
  ctx.fillStyle = '#87c978';
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.quadraticCurveTo(125, 190, 260, groundY); ctx.quadraticCurveTo(420, 175, 585, groundY); ctx.quadraticCurveTo(735, 205, 900, groundY); ctx.fill();
  ctx.fillStyle = '#65ad62';
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.quadraticCurveTo(190, 260, 370, groundY); ctx.quadraticCurveTo(610, 240, 900, groundY); ctx.fill();
}

function drawPig() {
  const x = pig.x, y = pig.y;
  ctx.save();
  ctx.translate(x, y);
  const bounce = pig.y >= groundY - pig.height ? Math.sin(frame * .5) * 2 : 0;
  ctx.translate(0, bounce);
  ctx.fillStyle = '#f58fa8';
  ctx.beginPath(); ctx.roundRect(5, 10, 62, 43, 20); ctx.fill();
  ctx.beginPath(); ctx.arc(61, 27, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e97897';
  ctx.beginPath(); ctx.moveTo(47, 10); ctx.lineTo(52, -5); ctx.lineTo(63, 10); ctx.fill();
  ctx.fillStyle = '#ffb0c0';
  ctx.beginPath(); ctx.ellipse(75, 32, 15, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#bc5575';
  ctx.beginPath(); ctx.arc(71, 32, 2.4, 0, Math.PI * 2); ctx.arc(79, 32, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#17212b'; ctx.beginPath(); ctx.arc(65, 20, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#dc6f8d';
  const leg = pig.y < groundY - pig.height ? 3 : Math.sin(frame * .65) * 5;
  ctx.fillRect(18 + leg, 47, 11, 15); ctx.fillRect(47 - leg, 47, 11, 15);
  ctx.strokeStyle = '#d96989'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(4, 27, 10, .5, 5.2); ctx.stroke();
  ctx.restore();
}

function drawObstacle(obstacle) {
  const y = groundY - obstacle.height;
  if (obstacle.kind === 'puddle') {
    ctx.fillStyle = '#3d8fbc'; ctx.beginPath(); ctx.ellipse(obstacle.x + 39, groundY - 5, 40, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6dc8e4'; ctx.beginPath(); ctx.ellipse(obstacle.x + 33, groundY - 8, 22, 4, 0, 0, Math.PI * 2); ctx.fill(); return;
  }
  if (obstacle.kind === 'crate') {
    ctx.fillStyle = '#d48b3f'; ctx.fillRect(obstacle.x, y, obstacle.width, obstacle.height); ctx.strokeStyle = '#8d5428'; ctx.lineWidth = 5; ctx.strokeRect(obstacle.x, y, obstacle.width, obstacle.height); ctx.beginPath(); ctx.moveTo(obstacle.x, y); ctx.lineTo(obstacle.x + obstacle.width, groundY); ctx.moveTo(obstacle.x + obstacle.width, y); ctx.lineTo(obstacle.x, groundY); ctx.stroke(); return;
  }
  ctx.fillStyle = '#f0eee5'; ctx.fillRect(obstacle.x + 3, y, 10, obstacle.height); ctx.fillRect(obstacle.x + 27, y, 10, obstacle.height); ctx.fillStyle = '#d95d4b'; ctx.fillRect(obstacle.x, y + 15, 38, 12); ctx.fillRect(obstacle.x, y + 43, 38, 12);
}

document.querySelector('#game-start').addEventListener('click', startGame);
document.querySelector('#game-jump').addEventListener('click', jump);
canvas.addEventListener('pointerdown', jump);
window.addEventListener('keydown', event => {
  if (document.querySelector('#pig-game-page').hidden || !['Space', 'ArrowUp'].includes(event.code)) return;
  event.preventDefault(); jump();
});

draw();
