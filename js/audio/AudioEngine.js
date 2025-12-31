export default class AudioEngine {
    constructor() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContextClass();
        
        // [新增] 默认波形类型
        this.oscType = 'triangle'; 
        
        // --- 1. 构建主效果链路 ---
        
        // 主音量
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.5;

        // 全局滤波器 (X轴效果)
        this.masterFilter = this.audioContext.createBiquadFilter();
        this.masterFilter.type = 'lowpass';
        this.masterFilter.frequency.value = 20000; 
        this.masterFilter.Q.value = 1;

        // 颤音节点 (Y轴上半部分效果)
        this.tremoloGainNode = this.audioContext.createGain();
        this.tremoloGainNode.gain.value = 1.0;

        // 链路连接
        this.masterFilter.connect(this.tremoloGainNode);
        this.tremoloGainNode.connect(this.masterGain);
        this.masterGain.connect(this.audioContext.destination);

        // --- 2. 初始化 LFO ---
        
        // A. 音量 LFO
        this.ampLfo = this.audioContext.createOscillator();
        this.ampLfo.frequency.value = 0; 
        this.ampLfoDepth = this.audioContext.createGain();
        this.ampLfoDepth.gain.value = 0;
        
        this.ampLfo.connect(this.ampLfoDepth);
        this.ampLfoDepth.connect(this.tremoloGainNode.gain);
        this.ampLfo.start();

        // B. 音高 LFO
        this.pitchLfo = this.audioContext.createOscillator();
        this.pitchLfo.frequency.value = 0;
        this.pitchLfoDepth = this.audioContext.createGain();
        this.pitchLfoDepth.gain.value = 0;

        this.pitchLfo.connect(this.pitchLfoDepth);
        this.pitchLfo.start();

        // --- 其他属性 ---
        this.currentNotes = new Map();
        this.adsr = { attack: 0.05, decay: 0.2, sustain: 0.6, sustainTime: 0.5, release: 0.3 };
        this.onNoteStart = null;
    }

    // [新增] 设置波形类型
    // [修改] 设置波形类型：不仅影响新音符，也立即改变当前正在播放的音符
    setOscType(type) {
        // 1. 更新全局设置，供未来音符使用
        this.oscType = type;
        
        // 2. 遍历当前所有活跃的音符，实时切换波形
        // (Map 的 value 结构是 { osc, gainNode })
        this.currentNotes.forEach(note => {
            if (note.osc) {
                try {
                    note.osc.type = type;
                } catch (e) {
                    console.warn("无法切换波形:", e);
                }
            }
        });
    }

    updateXYEffects(x, y, maxW, maxH) {
        const now = this.audioContext.currentTime;

        // --- X轴：滤波器处理 ---
        const normX = x / maxW; 
        // 中心点(0)时不应用强烈效果，或应用中性效果
        if (normX === 0 && y === 0) {
            // 特殊逻辑：完全复位
            this.masterFilter.frequency.setTargetAtTime(20000, now, 0.1);
            this.ampLfoDepth.gain.setTargetAtTime(0, now, 0.1);
            this.pitchLfoDepth.gain.setTargetAtTime(0, now, 0.1);
            return;
        }

        if (normX >= 0) {
            this.masterFilter.type = 'lowpass';
            const minFreq = 100;
            const maxFreq = 20000;
            const freq = maxFreq * Math.pow(minFreq / maxFreq, normX);
            this.masterFilter.frequency.setTargetAtTime(freq, now, 0.1);
        } else {
            this.masterFilter.type = 'highpass';
            const freq = Math.abs(normX) * 500;
            this.masterFilter.frequency.setTargetAtTime(Math.max(10, freq), now, 0.1);
        }

        // --- Y轴：LFO处理 ---
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
        
        // [修改] 使用当前选择的波形
        osc.type = this.oscType; 
        
        osc.frequency.value = frequency;

        // 连接音高 LFO
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
        
        osc.connect(gainNode); 
        gainNode.connect(this.masterFilter); 

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
        
        this.masterFilter.frequency.value = 20000;
        this.ampLfoDepth.gain.value = 0;
        this.pitchLfoDepth.gain.value = 0;
    }
}