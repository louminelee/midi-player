import MidiProcessor from '../midi/MidiProcessor.js';

export default class TapTapMode {
    constructor(controller) {
        this.controller = controller;
        this.isActive = false;
        
        // 播放游标（单位：秒）
        this.cursorTime = 0;
        
        // 创建全屏覆盖层
        this.overlay = document.createElement('div');
        this.overlay.id = 'taptap-overlay';
        this.overlay.innerHTML = `
            <div class="taptap-hint">TAP / CLICK / SPACE<br><span>to play the beat</span></div>
            <button class="taptap-exit">×</button>
        `;
        document.body.appendChild(this.overlay);
        
        this.bindEvents();
    }

    bindEvents() {
        // 退出按钮
        const exitBtn = this.overlay.querySelector('.taptap-exit');
        exitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.exit();
        });

        // 鼠标/触摸点击主逻辑
        this.overlay.addEventListener('mousedown', (e) => this.handleTap(e));
        this.overlay.addEventListener('touchstart', (e) => {
            e.preventDefault(); 
            this.handleTap(e.touches[0]);
        }, { passive: false });

        // 键盘逻辑 (空格键)
        window.addEventListener('keydown', (e) => {
            if (this.isActive && e.code === 'Space') {
                e.preventDefault(); // 防止滚动
                this.handleTap();
            }
            if (this.isActive && e.code === 'Escape') {
                this.exit();
            }
        });
    }

    enter() {
        if (!this.controller.scheduledNotes || this.controller.scheduledNotes.length === 0) {
            alert("Please load a MIDI file or write a score first!");
            return;
        }

        this.isActive = true;
        this.cursorTime = 0; // 每次进入重置从头开始
        
        // 如果正在播放，先停止
        if (this.controller.isPlaying) {
            this.controller.stop();
        }

        // 隐藏主界面，显示 Tap 界面
        document.querySelector('.dashboard').style.opacity = '0';
        document.querySelector('.dashboard').style.pointerEvents = 'none';
        document.getElementById('scoreDisplay').style.opacity = '0';
        
        this.overlay.classList.add('active');
        this.overlay.style.backgroundColor = this.getRandomPastelColor();
    }

    exit() {
        this.isActive = false;
        this.overlay.classList.remove('active');
        
        // 恢复主界面
        document.querySelector('.dashboard').style.opacity = '1';
        document.querySelector('.dashboard').style.pointerEvents = 'auto';
        document.getElementById('scoreDisplay').style.opacity = '1';
    }

    handleTap(e) {
        if (!this.isActive) return;

        // 1. 视觉反馈：变色 + 物理球爆炸 + 波纹
        this.overlay.style.backgroundColor = this.getRandomPastelColor();
        this.controller.visualizer.triggerNoteImpact(); // 复用原来的物理球效果
        
        if (e) {
            this.createRipple(e.clientX, e.clientY);
        } else {
            // 如果是空格键触发，在屏幕中心生成波纹
            this.createRipple(window.innerWidth / 2, window.innerHeight / 2);
        }

        // 2. 隐藏提示文字
        const hint = this.overlay.querySelector('.taptap-hint');
        if (hint) hint.style.opacity = 0;

        // 3. 计算一拍的时间长度 (秒)
        // BPM = 60,000,000 / baseTempo (微秒)
        // SecPerBeat = baseTempo / 1,000,000
        // 还要除以倍率
        const secondsPerBeat = (this.controller.baseTempo / 1000000) / this.controller.tempoMultiplier;

        // 4. 定义当前拍的时间窗口 [start, end)
        const startTime = this.cursorTime;
        const endTime = this.cursorTime + secondsPerBeat;

        // 5. 找出在这个时间窗口内开始的所有音符
        const notesToPlay = this.controller.scheduledNotes.filter(note => 
            note.startTime >= startTime && note.startTime < endTime
        );

        // 6. 播放音符
        notesToPlay.forEach(note => {
            const frequency = MidiProcessor.midiNoteToFrequency(note.note + this.controller.transpose);
            // 持续时间也受速度倍率影响
            const duration = note.originalDuration / this.controller.tempoMultiplier;
            
            // 为了保留切分音的感觉，计算相对于这一拍起点的微小延迟
            // 如果想要纯粹的“打击感”齐奏，可以把 relativeDelay 设为 0
            const relativeDelay = (note.startTime - startTime) / this.controller.tempoMultiplier;
            
            this.controller.audio.playTone(frequency, duration, note.velocity, relativeDelay);
        });

        // 7. 更新游标，推进到下一拍
        this.cursorTime += secondsPerBeat;

        // 8. 循环逻辑
        const lastNote = this.controller.scheduledNotes[this.controller.scheduledNotes.length - 1];
        const totalDuration = lastNote ? (lastNote.startTime + lastNote.originalDuration) : 0;

        // 如果超出了乐曲总长度，重置回开头
        if (this.cursorTime > totalDuration + 0.5) {
            this.cursorTime = 0;
            // 循环时给个特殊的闪光提示 (白色背景闪一下)
            this.overlay.style.backgroundColor = '#ffffff';
            setTimeout(() => {
                this.overlay.style.backgroundColor = this.getRandomPastelColor();
            }, 100);
        }
    }

    getRandomPastelColor() {
        // Mikutap 风格：高饱和度、高亮度，但加了透明度以便看到背后的物理球
        const hue = Math.floor(Math.random() * 360);
        return `hsla(${hue}, 80%, 75%, 0.85)`;
    }

    createRipple(x, y) {
        const ripple = document.createElement('div');
        ripple.className = 'tap-ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        this.overlay.appendChild(ripple);

        // 动画结束后移除 DOM
        setTimeout(() => ripple.remove(), 600);
    }
}