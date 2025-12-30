export default class AudioEngine {
    constructor() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContextClass();
        
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.audioContext.destination);
        
        this.currentNotes = new Map();
        // 默认 ADSR: 增加了 sustainTime (单位:秒)
        this.adsr = { attack: 0.05, decay: 0.2, sustain: 0.6, sustainTime: 0.5, release: 0.3 };
        
        // 回调：当音符开始时触发（用于视觉效果）
        this.onNoteStart = null;
    }

    setMasterVolume(val) {
        this.masterGain.gain.value = val;
    }

    setAdsr(prop, value) {
        this.adsr[prop] = value;
    }

    getAdsr() {
        return this.adsr;
    }

    resume() {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    getCurrentTime() {
        return this.audioContext.currentTime;
    }

    playTone(frequency, duration, velocity = 1.0, startTimeOffset = 0) {
        if (frequency <= 0) return;
        
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        osc.type = 'triangle'; 
        osc.frequency.value = frequency;
        
        const now = this.audioContext.currentTime;
        const noteStart = now + startTimeOffset;
        
        // 获取所有参数，包括新的 sustainTime
        const { attack, decay, sustain, sustainTime, release } = this.adsr;
        
        const peakGain = velocity * 0.8;
        const sustainGain = peakGain * sustain;
        
        // 1. Attack 阶段 (上升到峰值)
        gainNode.gain.setValueAtTime(0, noteStart);
        gainNode.gain.linearRampToValueAtTime(peakGain, noteStart + attack);
        
        // 2. Decay 阶段 (下降到 Sustain Level)
        gainNode.gain.setTargetAtTime(sustainGain, noteStart + attack, decay / 3);

        // 3. Sustain / Hold 阶段
        // 在这里，我们将 Sustain 视为一段固定的时间，而不是一直保持到松开琴键
        // 这样可以让旋钮完全控制声音的形态。
        // 计算 Sustain 结束的时间点：
        const holdEnd = noteStart + attack + decay + sustainTime;

        // 4. Release 阶段 (从 Sustain Level 衰减到 0)
        gainNode.gain.setTargetAtTime(0, holdEnd, release / 3);
        
        osc.connect(gainNode); 
        gainNode.connect(this.masterGain);
        osc.start(noteStart);
        
        // 停止振荡器的时间 (留出足够的 Release 时间防止爆音)
        const stopTime = holdEnd + (release * 5);
        osc.stop(stopTime);
        
        // 触发视觉回调
        if (this.onNoteStart) {
            if (startTimeOffset < 0.1) {
                this.onNoteStart();
            } else {
                setTimeout(() => { this.onNoteStart(); }, startTimeOffset * 1000);
            }
        }
        
        const noteId = Date.now() + Math.random();
        this.currentNotes.set(noteId, { osc, gainNode });
        
        // 清理引用
        setTimeout(() => { 
            if (this.currentNotes.has(noteId)) { 
                this.currentNotes.delete(noteId); 
            } 
        }, (stopTime - now) * 1000 + 100); 
    }

    stopAll() {
        const now = this.audioContext.currentTime;
        for (const [id, note] of this.currentNotes) {
            try {
                note.gainNode.gain.cancelScheduledValues(now);
                note.gainNode.gain.setValueAtTime(note.gainNode.gain.value, now);
                note.gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
                note.osc.stop(now + 0.05);
            } catch (e) { console.warn(e); }
        }
        // 清理 timer
        let id = window.setTimeout(function() {}, 0);
        while (id--) window.clearTimeout(id);
        this.currentNotes.clear();
    }
}