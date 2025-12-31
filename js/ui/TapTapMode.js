import MidiProcessor from '../midi/MidiProcessor.js';

export default class TapTapMode {
    constructor(controller) {
        this.controller = controller;
        this.isActive = false;
        this.cursorTime = 0;
        
        // [NEW] Lens Parameters
        this.lensRadius = 0; 

        // Create Overlay
        this.overlay = document.createElement('div');
        this.overlay.id = 'taptap-overlay';
        this.overlay.innerHTML = `
            <div id="center-lens"></div> <div class="taptap-hint">TAP / CLICK / SPACE<br><span>to play the beat</span></div>
            <button class="taptap-exit">&times;</button>
        `;
        document.body.appendChild(this.overlay);
        
        this.lensElement = this.overlay.querySelector('#center-lens');
        
        this.bindEvents();
    }

    bindEvents() {
        const exitBtn = this.overlay.querySelector('.taptap-exit');
        exitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.exit();
        });

        this.overlay.addEventListener('mousedown', (e) => this.handleTap(e));
        this.overlay.addEventListener('touchstart', (e) => {
            e.preventDefault(); 
            this.handleTap(e.touches[0]);
        }, { passive: false });

        window.addEventListener('mousemove', (e) => {
            if (this.isActive) {
                this.updateAudioParams(e.clientX, e.clientY);
            }
        });

        window.addEventListener('keydown', (e) => {
            if (this.isActive && e.code === 'Space') {
                e.preventDefault(); 
                this.handleTap(); 
            }
            if (this.isActive && e.code === 'Escape') {
                this.exit();
            }
        });
        
        // [NEW] Recalculate lens size on resize
        window.addEventListener('resize', () => {
            if(this.isActive) this.calculateLensSize();
        });
    }

    // [NEW] Calculate 1/20th of the screen area
    calculateLensSize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const area = width * height;
        const targetArea = area / 40;
        
        // Area = pi * r^2  =>  r = sqrt(Area / pi)
        this.lensRadius = Math.sqrt(targetArea / Math.PI);
        
        // Update CSS
        const diameter = this.lensRadius * 2;
        this.lensElement.style.width = `${diameter}px`;
        this.lensElement.style.height = `${diameter}px`;
    }

    updateAudioParams(mouseX, mouseY) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const centerX = width / 2;
        const centerY = height / 2;

        // [NEW] Logic: Check if inside the Neutral Zone
        const dx = mouseX - centerX;
        const dy = mouseY - centerY;
        const distance = Math.sqrt(dx*dx + dy*dy);

        // If inside the circle (Concave Lens), do NOT apply effects
        if (distance < this.lensRadius) {
            // Send "Neutral" params to Audio Engine
            // (0,0 relative coords usually result in open filters and 0 LFO depth in your AudioEngine logic)
            if (this.controller.audio.updateXYEffects) {
                this.controller.audio.updateXYEffects(0, 0, centerX, centerY);
            }
            return; 
        }

        // --- Standard Logic (Outside the circle) ---
        const relX = mouseX - centerX;
        const relY = centerY - mouseY;

        if (this.controller.audio.updateXYEffects) {
            this.controller.audio.updateXYEffects(relX, relY, centerX, centerY);
        }
    }

    enter() {
        if (!this.controller.scheduledNotes || this.controller.scheduledNotes.length === 0) {
            alert("Please load a MIDI file or write a score first!");
            return;
        }

        this.isActive = true;
        this.cursorTime = 0; 
        
        if (this.controller.isPlaying) {
            this.controller.stop();
        }

        this.controller.visualizer.setIsPlaying(true);

        document.querySelector('.dashboard').style.opacity = '0';
        document.querySelector('.dashboard').style.pointerEvents = 'none';
        document.getElementById('scoreDisplay').style.opacity = '0';
        
        this.overlay.classList.add('active');
        
        // [NEW] Activate Lens
        this.calculateLensSize();
        this.lensElement.classList.add('active');
        
        this.overlay.style.backgroundColor = this.getRandomPastelColor();
    }

    exit() {
        this.isActive = false;
        this.overlay.classList.remove('active');
        
        // [NEW] Deactivate Lens
        this.lensElement.classList.remove('active');
        
        this.controller.visualizer.setIsPlaying(false);
        
        document.querySelector('.dashboard').style.opacity = '1';
        document.querySelector('.dashboard').style.pointerEvents = 'auto';
        document.getElementById('scoreDisplay').style.opacity = '1';

        if (this.controller.audio.stopAll) {
            this.controller.audio.stopAll();
        }
    }

    handleTap(e) {
        if (!this.isActive) return;

        this.overlay.style.backgroundColor = this.getRandomPastelColor();
        
        if (e && (e.clientX !== undefined || (e.touches && e.touches[0]))) {
            const x = e.clientX || e.touches[0].clientX;
            const y = e.clientY || e.touches[0].clientY;
            
            if (this.controller.visualizer.triggerZoneAttraction) {
                this.controller.visualizer.triggerZoneAttraction(x, y);
            } else {
                this.controller.visualizer.triggerNoteImpact();
            }
            
            this.createRipple(x, y);
            this.updateAudioParams(x, y);
        } else {
            this.controller.visualizer.triggerNoteImpact();
            this.createRipple(window.innerWidth / 2, window.innerHeight / 2);
        }

        const hint = this.overlay.querySelector('.taptap-hint');
        if (hint) hint.style.opacity = 0;

        const secondsPerBeat = (this.controller.baseTempo / 1000000) / this.controller.tempoMultiplier;
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