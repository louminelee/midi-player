import AudioEngine from './audio/AudioEngine.js';
import Visualizer from './audio/Visualizer.js';
import MidiProcessor from './midi/MidiProcessor.js';
import ScoreRenderer from './ui/ScoreRenderer.js';
import AdsrControl from './ui/AdsrControl.js';
import HandwritingRecogniser from './ai/Handwriting.js';
import TapTapMode from './ui/TapTapMode.js'; 
import LiquidSlider from './ui/LiquidSlider.js'; 

class MIDIPlayerController {
    constructor() {
        this.checkDependencies();

        // 模块初始化
        this.audio = new AudioEngine();
        this.visualizer = new Visualizer('bgCanvas');
        this.renderer = new ScoreRenderer('scoreContainer');
        
        // 链接 ADSR UI 到音频引擎
        this.adsrControl = new AdsrControl((prop, val) => {
            this.audio.setAdsr(prop, val);
        });

        // 链接手写识别
        this.handwriting = new HandwritingRecogniser((digits, key) => {
            this.loadManualScore(digits, key);
        });
        
        // 初始化 TapTap 模式
        this.taptap = new TapTapMode(this);

        // 链接视觉反馈
        this.audio.onNoteStart = () => {
            this.visualizer.triggerNoteImpact();
        };

        // 播放状态
        this.isPlaying = false;
        this.scheduledNotes = [];
        this.midiData = null;
        
        this.tempoMultiplier = 1.0;
        this.baseTempo = 500000;
        this.transpose = 0;
        this.keySignature = 'C';
        this.ticksPerMeasure = 1920;

        // 动画循环变量
        this.animationFrameId = null;
        this.currentScoreTime = 0;
        this.nextNoteIndex = 0;
        this.lastFrameTime = 0;
        this.lookAhead = 0.1;

        // [新增] 滚动控制相关的计时器
        this.lastMouseMoveTime = 0;   
        this.lastAutoScrollTime = 0;  

        this.initDOMEvents();
        
        // 初始化液态滑块动效 (必须在 DOM 解析后)
        this.initLiquidSliders();
    }

    checkDependencies() {
        if (typeof MidiParser === 'undefined') {
            console.error('MidiParser library failed to load.');
            document.getElementById('status').textContent = 'Error: MidiParser library missing.';
        }
    }

    initLiquidSliders() {
        new LiquidSlider('volume', 'volume');
        new LiquidSlider('tempo', 'tempo');
    }

    initDOMEvents() {
        document.getElementById('midiFile').addEventListener('change', (e) => this.loadMIDIFile(e));
        document.getElementById('playBtn').addEventListener('click', () => this.play());
        document.getElementById('stopBtn').addEventListener('click', () => this.stop());
        
        // 绑定 TapTap 按钮事件
        document.getElementById('taptapBtn').addEventListener('click', () => {
            console.log("TapTap mode requested");
            this.taptap.enter();
        });

        document.getElementById('keySignature').addEventListener('change', (e) => {
            this.keySignature = e.target.value;
            if (this.scheduledNotes.length > 0 || this.midiData) this.refreshScore();
        });
        
        document.getElementById('transpose').addEventListener('change', (e) => {
            this.transpose = parseInt(e.target.value) || 0;
            if (this.scheduledNotes.length > 0 || this.midiData) {
                if (this.isPlaying) this.stop(); 
                this.refreshScore();
            }
        });
        
        document.getElementById('volume').addEventListener('input', (e) => {
            this.audio.setMasterVolume(e.target.value / 100);
            document.getElementById('volumeValue').textContent = e.target.value;
        });
        
        document.getElementById('tempo').addEventListener('input', (e) => {
            this.tempoMultiplier = e.target.value / 100;
            document.getElementById('tempoValue').textContent = e.target.value;
            this.renderer.updateBPMDisplay(this.baseTempo, this.tempoMultiplier);
        });

        // [新增] 监听振荡器类型切换
        const oscSelect = document.getElementById('oscillatorType');
        if (oscSelect) {
            oscSelect.addEventListener('change', (e) => {
                this.audio.setOscType(e.target.value);
            });
        }

        // [新增] 悬浮停止按钮逻辑
        this.floatingStopBtn = document.getElementById('floatingStopBtn');
        this.floatingStopBtn.addEventListener('click', () => {
            this.stopWithEffect(); 
        });

        // [新增] 页面滚动监听 (控制悬浮按钮显隐)
        window.addEventListener('scroll', () => {
            this.checkFloatingButtonVisibility();
        }, { passive: true });

        // [新增] 全局监听鼠标移动 (用于防抖滚动)
        window.addEventListener('mousemove', () => {
            this.lastMouseMoveTime = performance.now();
        });
    }

    checkFloatingButtonVisibility() {
        if (!this.isPlaying) {
            this.toggleFloatingBtn(false);
            return;
        }

        const mainStopBtn = document.getElementById('stopBtn');
        const rect = mainStopBtn.getBoundingClientRect();
        // 如果原始 Stop 按钮看不到了
        const isMainBtnHidden = rect.top < -50; 

        if (isMainBtnHidden) {
            this.toggleFloatingBtn(true);
        } else {
            this.toggleFloatingBtn(false);
        }
    }

    toggleFloatingBtn(show) {
        if (show) {
            this.floatingStopBtn.classList.add('visible');
            this.floatingStopBtn.classList.remove('vanishing');
        } else {
            if (this.floatingStopBtn.classList.contains('visible') && !this.floatingStopBtn.classList.contains('vanishing')) {
                this.floatingStopBtn.classList.remove('visible');
            }
        }
    }

    stopWithEffect() {
        this.floatingStopBtn.classList.add('vanishing');
        this.stop();
        setTimeout(() => {
            this.floatingStopBtn.classList.remove('visible');
            this.floatingStopBtn.classList.remove('vanishing');
        }, 500);
    }

    loadMIDIFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (file.name === "write score" && file.size === 0) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.midiData = MidiProcessor.parseMidiFile(e.target.result);
                this.displayMIDIInfo();
                
                this.baseTempo = MidiProcessor.extractTempo(this.midiData);
                const timeSig = MidiProcessor.extractTimeSignature(this.midiData);
                const tpq = this.midiData.timeDivision || 480;
                this.ticksPerMeasure = (tpq * 4 / timeSig.denominator) * timeSig.numerator;
                this.renderer.setTicksPerMeasure(this.ticksPerMeasure);

                this.refreshScore();
                
                const trackCount = (this.midiData.track) ? this.midiData.track.length : 0;
                document.getElementById('status').textContent = `Loaded: ${file.name} - ${trackCount} tracks`;
            } catch (error) {
                console.error(error);
                document.getElementById('status').textContent = `Error: ${error.message}`;
            }
        };
        reader.readAsArrayBuffer(file);
    }

    displayMIDIInfo() { 
        if (!this.midiData) return; 
        console.log('MIDI Info loaded'); 
    }

    refreshScore() {
        if (!this.midiData) return;
        const track = MidiProcessor.getMainTrack(this.midiData);
        const tpq = this.midiData.timeDivision || 480;
        
        // 预处理音符数据
        this.scheduledNotes = MidiProcessor.processTrackToEvents(
            track, tpq, this.baseTempo, this.transpose, this.keySignature
        );
        
        // 渲染
        this.renderer.render(
            this.scheduledNotes, 
            this.keySignature, 
            this.transpose, 
            this.baseTempo,
            this.tempoMultiplier
        );
    }

    loadManualScore(digits, key) {
        if (this.isPlaying) this.stop();
        
        this.midiData = null; 
        this.keySignature = key;
        document.getElementById('keySignature').value = key;
        
        const noteEvents = [];
        let currentTime = 0;
        const scaleIntervals = { 1:0, 2:2, 3:4, 4:5, 5:7, 6:9, 7:11 };
        const keyBaseMap = {
            'C': 60, 'G': 67, 'D': 62, 'A': 69, 'E': 64, 'B': 71, 'F#': 66,
            'F': 65, 'Bb': 70, 'Eb': 63, 'Ab': 68, 'Db': 61
        };
        const rootNote = keyBaseMap[key] || 60;

        digits.forEach((digit, index) => {
            if (digit > 0 && digit <= 7) {
                const interval = scaleIntervals[digit];
                const midiNote = rootNote + interval;
                let finalNote = midiNote;
                if (finalNote > 84) finalNote -= 12;
                if (finalNote < 48) finalNote += 12;

                const pitchInfo = MidiProcessor.midiNoteToPitchName(finalNote);
                
                noteEvents.push({
                    index: index,
                    note: finalNote,
                    displayNumber: digit.toString(),
                    beats: 1.0,
                    startTick: index * 480,
                    startTime: currentTime,
                    duration: 0.5,
                    originalDuration: 0.5,
                    velocity: 0.8,
                    pitchInfo: pitchInfo,
                    octave: pitchInfo.octave 
                });
            }
            currentTime += 0.5;
        });

        this.scheduledNotes = noteEvents;
        this.baseTempo = 500000;
        this.ticksPerMeasure = 1920;
        this.renderer.setTicksPerMeasure(1920);

        this.renderer.render(noteEvents, key, 0, this.baseTempo, 1.0);
        document.getElementById('status').textContent = `Loaded Handwritten Score: ${noteEvents.length} notes`;
        
        try {
            const dt = new DataTransfer();
            dt.items.add(new File([""], "write score", { type: "text/plain" }));
            document.getElementById('midiFile').files = dt.files;
        } catch(e){}
    }

    play() {
        if (this.isPlaying) this.stop();
        if (this.scheduledNotes.length === 0) return;

        this.isPlaying = true;
        this.visualizer.setIsPlaying(true);
        this.audio.resume();

        this.currentScoreTime = 0;
        this.nextNoteIndex = 0;
        this.lastFrameTime = performance.now();

        document.getElementById('status').textContent = 'Playing...';
        document.getElementById('playBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;

        this.checkFloatingButtonVisibility();

        this.playbackLoop();
    }

    playbackLoop() {
        if (!this.isPlaying) return;

        const now = performance.now();
        const deltaTime = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;

        this.currentScoreTime += deltaTime * this.tempoMultiplier;

        while (this.nextNoteIndex < this.scheduledNotes.length) {
            const note = this.scheduledNotes[this.nextNoteIndex];
            
            if (note.startTime <= this.currentScoreTime + this.lookAhead) {
                let playDelay = (note.startTime - this.currentScoreTime) / this.tempoMultiplier;
                if (playDelay < 0) playDelay = 0;

                const frequency = MidiProcessor.midiNoteToFrequency(note.note + this.transpose);
                const actualDuration = note.originalDuration / this.tempoMultiplier;
                
                this.audio.playTone(frequency, actualDuration, note.velocity, playDelay);
                
                this.nextNoteIndex++;
            } else {
                break;
            }
        }

        // --- [核心逻辑] 计算是否需要滚动 ---
        
        // 条件1: 鼠标已经静止超过 1秒
        const isMouseIdle = (now - this.lastMouseMoveTime) > 1000;
        // 条件2: 距离上次自动滚动已经超过 3秒
        const isTimeToScroll = (now - this.lastAutoScrollTime) > 3000;

        let shouldScroll = false;
        if (isMouseIdle && isTimeToScroll) {
            shouldScroll = true;
            this.lastAutoScrollTime = now;
        }

        // 传递 shouldScroll 给渲染器
        this.renderer.highlightNotes(this.scheduledNotes, this.currentScoreTime, shouldScroll);

        // --------------------------------

        const lastNote = this.scheduledNotes[this.scheduledNotes.length - 1];
        if (lastNote && this.currentScoreTime > lastNote.startTime + lastNote.originalDuration + 1.0) {
             this.stop();
        } else {
            this.animationFrameId = requestAnimationFrame(() => this.playbackLoop());
        }
    }

    stop() {
        this.isPlaying = false;
        this.visualizer.setIsPlaying(false);
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        this.audio.stopAll();
        
        document.querySelectorAll('.current-note').forEach(el => el.classList.remove('current-note'));
        
        document.getElementById('status').textContent = 'Stopped';
        document.getElementById('playBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;

        this.checkFloatingButtonVisibility();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new MIDIPlayerController();
});