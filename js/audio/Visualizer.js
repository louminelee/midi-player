export default class Visualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.balls = [];
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.mouse = { x: -1000, y: -1000 };
        this.isMusicPlaying = false; 

        this.resize();
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        this.initBalls(12); 
        this.animate();
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    setIsPlaying(status) {
        this.isMusicPlaying = status;
    }

    initBalls(count) {
        this.balls = [];
        const colors = [
            'rgba(0, 122, 255, 0.4)', 'rgba(52, 199, 89, 0.4)', 
            'rgba(255, 59, 48, 0.4)', 'rgba(255, 149, 0, 0.4)', 'rgba(175, 82, 222, 0.4)' 
        ];

        for (let i = 0; i < count; i++) {
            const r = Math.random() * 60 + 60;
            this.balls.push({
                x: Math.random() * (this.width - 2 * r) + r,
                y: Math.random() * (this.height - 2 * r) + r,
                vx: (Math.random() - 0.5) * 0.2, 
                vy: (Math.random() - 0.5) * 0.2,
                baseR: r, r: r, scale: 1.0, targetScale: 1.0,
                color: colors[Math.floor(Math.random() * colors.length)],
                mass: r,
                isStopped: false, stopTime: 0, wakeTime: 0
            });
        }
    }

    triggerNoteImpact() {
        if(!this.isMusicPlaying) return;
        this.balls.forEach(ball => {
            if (Math.random() < 0.2) {
                ball.targetScale = 1.3;
                ball.isStopped = false;
                setTimeout(() => { ball.targetScale = 1.0; }, 100);
            }
        });
    }

    updatePhysics() {
        const mouseInfluenceRadius = Math.min(this.width, this.height) / 3;
        const now = Date.now();

        for (let i = 0; i < this.balls.length; i++) {
            const ball = this.balls[i];
            const k = 0.2;
            ball.scale += (ball.targetScale - ball.scale) * k;
            ball.r = ball.baseR * ball.scale;

            if (!this.isMusicPlaying) {
                const dx = this.mouse.x - ball.x;
                const dy = this.mouse.y - ball.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < mouseInfluenceRadius) {
                    const force = 0.001; 
                    ball.vx += dx * force; ball.vy += dy * force;
                }
            }

            const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
            if (speed < 0.1) {
                if (!ball.isStopped) {
                    ball.isStopped = true; ball.stopTime = now;
                    ball.wakeTime = now + 1000 + Math.random() * 5000;
                } else if (now > ball.wakeTime) {
                    const angle = Math.random() * Math.PI * 2;
                    const wakeForce = 0.3;
                    ball.vx = Math.cos(angle) * wakeForce;
                    ball.vy = Math.sin(angle) * wakeForce;
                    ball.isStopped = false;
                }
            } else {
                ball.isStopped = false;
            }

            ball.x += ball.vx; ball.y += ball.vy;
            ball.vx *= 0.99; ball.vy *= 0.99;

            if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -1; ball.isStopped = false; }
            if (ball.x + ball.r > this.width) { ball.x = this.width - ball.r; ball.vx *= -1; ball.isStopped = false; }
            if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; ball.isStopped = false; }
            if (ball.y + ball.r > this.height) { ball.y = this.height - ball.r; ball.vy *= -1; ball.isStopped = false; }
        }

        // ¼ò»¯µÄÅö×²Âß¼­
        for (let i = 0; i < this.balls.length; i++) {
            for (let j = i + 1; j < this.balls.length; j++) {
                const b1 = this.balls[i];
                const b2 = this.balls[j];
                const dx = b2.x - b1.x;
                const dy = b2.y - b1.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const minDist = b1.r + b2.r;

                if (dist < minDist) {
                    b1.isStopped = false; b2.isStopped = false;
                    const angle = Math.atan2(dy, dx);
                    const tx = b1.x + Math.cos(angle) * minDist;
                    const ty = b1.y + Math.sin(angle) * minDist;
                    const ax = (tx - b2.x) * 0.05; 
                    const ay = (ty - b2.y) * 0.05;
                    b1.vx -= ax; b1.vy -= ay; b2.vx += ax; b2.vy += ay;
                    b1.vx *= 0.95; b1.vy *= 0.95; b2.vx *= 0.95; b2.vy *= 0.95;
                }
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        for (const ball of this.balls) {
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
            this.ctx.fillStyle = ball.color;
            this.ctx.shadowBlur = 30; this.ctx.shadowColor = ball.color;
            this.ctx.fill(); this.ctx.shadowBlur = 0;
        }
    }

    animate() {
        this.updatePhysics();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}