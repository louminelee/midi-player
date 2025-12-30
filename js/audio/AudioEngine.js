export default class AudioEngine {
    constructor() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContextClass();
        
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.audioContext.destination);
        
        this.currentNotes = new Map();
        // 默认 ADSR
        this.adsr = { attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.3 };
        
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
        
        const { attack, decay, sustain, release } = this.adsr;
        
        const peakGain = velocity * 0.8;
        const sustainGain = peakGain * sustain;
        
        gainNode.gain.setValueAtTime(0, noteStart);
        gainNode.gain.linearRampToValueAtTime(peakGain, noteStart + attack);
        gainNode.gain.setTargetAtTime(sustainGain, noteStart + attack, decay / 3);

        const noteOffTime = Math.max(noteStart + duration, noteStart + attack);
        gainNode.gain.setTargetAtTime(0, noteOffTime, release / 3);
        
        osc.connect(gainNode); 
        gainNode.connect(this.masterGain);
        osc.start(noteStart);
        
        const stopTime = noteOffTime + (release * 5);
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