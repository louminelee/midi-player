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
        // [修复] 使用 &times; 替代直接的字符，防止乱码
        this.overlay.innerHTML = `
            <div class="taptap-hint">TAP / CLICK / SPACE<br><span>to play the beat</span></div>
            <button class="taptap-exit">&times;</button>
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

        // [关键] 必须手动激活视觉引擎
        this.controller.visualizer.setIsPlaying(true);

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
        
        // 退出时关闭视觉引擎
        this.controller.visualizer.setIsPlaying(false);
        
        // 恢复主界面
        document.querySelector('.dashboard').style.opacity = '1';
        document.querySelector('.dashboard').style.pointerEvents = 'auto';
        document.getElementById('scoreDisplay').style.opacity = '1';
    }

    handleTap(e) {
        if (!this.isActive) return;

        // 1. 视觉反馈
        this.overlay.style.backgroundColor = this.getRandomPastelColor();
        
        // [修改开始] -------------
        if (e && (e.clientX !== undefined || (e.touches && e.touches[0]))) {
            // 获取坐标 (兼容鼠标和触摸)
            const x = e.clientX || e.touches[0].clientX;
            const y = e.clientY || e.touches[0].clientY;
            
            // 调用新的区域吸引特效
            this.controller.visualizer.triggerZoneAttraction(x, y);
            
            // 生成波纹
            this.createRipple(x, y);
        } else {
            // 如果是空格键 (没有坐标 e)，则保持原来的全屏随机效果
            this.controller.visualizer.triggerNoteImpact();
            this.createRipple(window.innerWidth / 2, window.innerHeight / 2);
        }
        // [修改结束] -------------

        // 2. 隐藏提示文字 (以下代码保持不变)
        const hint = this.overlay.querySelector('.taptap-hint');
        if (hint) hint.style.opacity = 0;

        // ... 后续播放逻辑保持不变 ...
        // 3. 计算一拍的时间长度 (秒)
        const secondsPerBeat = (this.controller.baseTempo / 1000000) / this.controller.tempoMultiplier;
        
        // ... (原有的播放逻辑代码) ...
        const startTime = this.cursorTime;
        const endTime = this.cursorTime + secondsPerBeat;

        const notesToPlay = this.controller.scheduledNotes.filter(note => 
            note.startTime >= startTime && note.startTime < endTime
        );

        notesToPlay.forEach(note => {
            const frequency = MidiProcessor.midiNoteToFrequency(note.note + this.controller.transpose);
            const duration = note.originalDuration / this.controller.tempoMultiplier;
            const relativeDelay = (note.startTime - startTime) / this.controller.tempoMultiplier;
            this.controller.audio.playTone(frequency, duration, note.velocity, relativeDelay);
        });

        this.cursorTime += secondsPerBeat;

        const lastNote = this.controller.scheduledNotes[this.controller.scheduledNotes.length - 1];
        const totalDuration = lastNote ? (lastNote.startTime + lastNote.originalDuration) : 0;

        if (this.cursorTime > totalDuration + 0.5) {
            this.cursorTime = 0;
            this.overlay.style.backgroundColor = '#ffffff';
            setTimeout(() => {
                this.overlay.style.backgroundColor = this.getRandomPastelColor();
            }, 100);
        }
    }

    getRandomPastelColor() {
        // 保持低透明度以便看到背景
        const hue = Math.floor(Math.random() * 360);
        return `hsla(${hue}, 80%, 75%, 0.25)`;
    }

    createRipple(x, y) {
        const ripple = document.createElement('div');
        ripple.className = 'tap-ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        this.overlay.appendChild(ripple);

        setTimeout(() => ripple.remove(), 600);
    }
}