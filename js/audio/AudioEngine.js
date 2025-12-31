export default class AudioEngine {
    constructor() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContextClass();
        
        // --- 1. 构建主效果链路 ---
        
        // 主音量
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.5;

        // 全局滤波器 (X轴效果)
        this.masterFilter = this.audioContext.createBiquadFilter();
        this.masterFilter.type = 'lowpass';
        this.masterFilter.frequency.value = 20000; // 默认全通
        this.masterFilter.Q.value = 1; // 稍微一点共振增加听感

        // 颤音节点 (Y轴上半部分效果 - Tremolo)
        // 用于承载 LFO 对音量的调制
        this.tremoloGainNode = this.audioContext.createGain();
        this.tremoloGainNode.gain.value = 1.0;

        // 链路连接: Filter -> Tremolo -> Master -> Out
        this.masterFilter.connect(this.tremoloGainNode);
        this.tremoloGainNode.connect(this.masterGain);
        this.masterGain.connect(this.audioContext.destination);

        // --- 2. 初始化 LFO (低频振荡器) ---
        
        // A. 音量 LFO (控制 tremoloGainNode.gain)
        this.ampLfo = this.audioContext.createOscillator();
        this.ampLfo.frequency.value = 0; 
        this.ampLfoDepth = this.audioContext.createGain(); // 控制调制深度
        this.ampLfoDepth.gain.value = 0;
        
        this.ampLfo.connect(this.ampLfoDepth);
        this.ampLfoDepth.connect(this.tremoloGainNode.gain);
        this.ampLfo.start();

        // B. 音高 LFO (控制 note source.detune)
        this.pitchLfo = this.audioContext.createOscillator();
        this.pitchLfo.frequency.value = 0;
        this.pitchLfoDepth = this.audioContext.createGain(); // 控制调制深度 (cents)
        this.pitchLfoDepth.gain.value = 0;

        this.pitchLfo.connect(this.pitchLfoDepth);
        // 注意：pitchLfoDepth 需要连接到每个新生成的音符振荡器上
        this.pitchLfo.start();

        // --- 其他属性 ---
        this.currentNotes = new Map();
        this.adsr = { attack: 0.05, decay: 0.2, sustain: 0.6, sustainTime: 0.5, release: 0.3 };
        this.onNoteStart = null;
    }

    // [新增] 核心：根据坐标更新效果参数
    // x, y 为相对于屏幕中心的坐标 (px)
    // maxW, maxH 为屏幕宽高的一半
// [修改] 核心：根据坐标更新效果参数
    updateXYEffects(x, y, maxW, maxH) {
        const now = this.audioContext.currentTime;

        // --- X轴：滤波器处理 ---
        const normX = x / maxW; // 0 到 1 (右侧) 或 -1 到 0 (左侧)

        if (normX >= 0) {
            // [右侧] 高切 (Low Pass): 20000Hz -> 100Hz
            this.masterFilter.type = 'lowpass';
            
            // --- 修改点：使用指数曲线代替线性插值 ---
            // 使得频率在鼠标移动初期就快速下降，听感更明显
            // 公式：StartFreq * (EndFreq / StartFreq) ^ normX
            const minFreq = 100;
            const maxFreq = 20000;
            const freq = maxFreq * Math.pow(minFreq / maxFreq, normX);
            
            this.masterFilter.frequency.setTargetAtTime(freq, now, 0.1);
        } else {
            // [左侧] 低切 (High Pass): 0Hz -> 2000Hz
            // 左侧保持线性或者也稍微改一下曲线体验会更好，这里稍微优化了一下起始点
            this.masterFilter.type = 'highpass';
            
            // 左侧线性通常是可以的，因为低频区(0-500Hz)本来就很敏感
            // 限制最大值为 2000Hz
            const freq = Math.abs(normX) * 500;
            
            // 为了防止在中心点附近产生爆音，确保频率平滑过渡
            this.masterFilter.frequency.setTargetAtTime(Math.max(10, freq), now, 0.1);
        }

        // --- Y轴：LFO处理 (保持不变) ---
        const normY = y / maxH; 

        if (normY > 0) {
            // 上半屏：音量调制 (Tremolo)
            const lfoFreq = normY * 10;
            const depth = normY * 0.5;

            this.ampLfo.frequency.setTargetAtTime(lfoFreq, now, 0.1);
            this.ampLfoDepth.gain.setTargetAtTime(depth, now, 0.1);
            this.pitchLfoDepth.gain.setTargetAtTime(0, now, 0.1);

        } else {
            // 下半屏：音高调制 (Vibrato)
            const absY = Math.abs(normY);
            const lfoFreq = absY * 10;
            const depth = absY * 50;

            this.pitchLfo.frequency.setTargetAtTime(lfoFreq, now, 0.1);
            this.pitchLfoDepth.gain.setTargetAtTime(depth, now, 0.1);
            this.ampLfoDepth.gain.setTargetAtTime(0, now, 0.1);
        }
    }

    setMasterVolume(val) {
        this.masterGain.gain.value = val;
    }

    setAdsr(prop, value) {
        this.adsr[prop] = value;
    }

    resume() {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    playTone(frequency, duration, velocity = 1.0, startTimeOffset = 0) {
        if (frequency <= 0) return;
        
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        osc.type = 'triangle'; 
        osc.frequency.value = frequency;

        // [关键] 将全局 Vibrato LFO 连接到这个新音符的 detune
        this.pitchLfoDepth.connect(osc.detune);
        
        const now = this.audioContext.currentTime;
        const noteStart = now + startTimeOffset;
        
        const { attack, decay, sustain, sustainTime, release } = this.adsr;
        const peakGain = velocity * 0.8;
        const sustainGain = peakGain * sustain;
        const holdEnd = noteStart + attack + decay + sustainTime;

        // ADSR Envelope
        gainNode.gain.setValueAtTime(0, noteStart);
        gainNode.gain.linearRampToValueAtTime(peakGain, noteStart + attack);
        gainNode.gain.setTargetAtTime(sustainGain, noteStart + attack, decay / 3);
        gainNode.gain.setTargetAtTime(0, holdEnd, release / 3);
        
        // [关键] 路由改变：连接到 Filter 而不是直接 Master
        osc.connect(gainNode); 
        gainNode.connect(this.masterFilter); // 连接到全局 Filter 链

        osc.start(noteStart);
        
        const stopTime = holdEnd + (release * 5);
        osc.stop(stopTime);
        
        if (this.onNoteStart) {
            if (startTimeOffset < 0.1) {
                this.onNoteStart();
            } else {
                setTimeout(() => { this.onNoteStart(); }, startTimeOffset * 1000);
            }
        }
        
        const noteId = Date.now() + Math.random();
        this.currentNotes.set(noteId, { osc, gainNode });
        
        setTimeout(() => { 
            if (this.currentNotes.has(noteId)) { 
                this.currentNotes.delete(noteId); 
            } 
        }, (stopTime - now) * 1000 + 100); 
    }

    stopAll() {
        // ... (保持原有 stopAll 逻辑)
        const now = this.audioContext.currentTime;
        for (const [id, note] of this.currentNotes) {
            try {
                note.gainNode.gain.cancelScheduledValues(now);
                note.gainNode.gain.setValueAtTime(note.gainNode.gain.value, now);
                note.gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
                note.osc.stop(now + 0.05);
            } catch (e) { console.warn(e); }
        }
        this.currentNotes.clear();
        
        // 重置 LFO 和 Filter
        this.masterFilter.frequency.value = 20000;
        this.ampLfoDepth.gain.value = 0;
        this.pitchLfoDepth.gain.value = 0;
    }
}