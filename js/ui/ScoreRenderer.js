export default class ScoreRenderer {
    constructor(containerId, ticksPerMeasure) {
        this.container = document.getElementById(containerId);
        this.ticksPerMeasure = ticksPerMeasure || 1920;
        this.injectStyles();
    }

    injectStyles() {
        // [FIX] 针对液体玻璃风格(大字体)调整定位参数
        // 增加行间距 row-gap: 65px (原45px)，防止八度点重叠
        // 调整 dots-top bottom: 32px (原22px)，避开大号数字
        // 调整 bottom-wrapper top: 34px (原26px)
        if(!document.getElementById('score-fix-style')) {
            const style = document.createElement('style');
            style.id = 'score-fix-style';
            style.textContent = `
                .score-notes { 
                    align-items: baseline !important; 
                    row-gap: 70px !important; 
                }
                .bar-line { 
                    align-self: auto !important; 
                    margin-bottom: 0 !important; 
                    vertical-align: baseline; 
                    font-weight: 300; 
                }
                .note-unit { 
                    position: relative; 
                    overflow: visible !important; 
                    vertical-align: baseline;
                    margin-right: 4px; /* 增加一点横向间距 */
                }
                .note-content { 
                    display: inline-block; 
                    line-height: 1; /* 收紧行高 */
                }
                .dots-top { 
                    position: absolute; 
                    bottom: 24px; /* [FIX] 提高位置 */
                    left: 0; 
                    width: 100%; 
                    pointer-events: none; 
                }
                .bottom-wrapper { 
                    position: absolute; 
                    top: 22px; /* [FIX] 降低位置 */
                    left: 0; 
                    width: 100%; 
                    display: flex; 
                    flex-direction: column; 
                    align-items: center; 
                    pointer-events: none; 
                }
                .rhythm-dot { 
                    position: absolute; 
                    right: -10px; 
                    bottom: 2px; 
                }
            `;
            document.head.appendChild(style);
        }
    }

    setTicksPerMeasure(val) {
        this.ticksPerMeasure = val;
    }

    render(noteEvents, keySignature, transpose, tempo, bpmMultiplier = 1.0) {
        this.container.innerHTML = '';
        if (noteEvents.length === 0) { 
            this.container.innerHTML = '<div class="no-notes" style="color:var(--text-sub);text-align:center;">No notes found</div>'; 
            return; 
        }
        
        const keyInfo = document.createElement('div');
        keyInfo.className = 'score-info';
        const transInfo = transpose !== 0 ? ` | Transpose: ${transpose > 0 ? '+' : ''}${transpose}` : '';
        keyInfo.innerHTML = `Key: 1=${keySignature}${transInfo} | BPM: <span id="bpm-display"></span> | Notes: ${noteEvents.length}`;
        this.container.appendChild(keyInfo);
        
        // 更新 BPM
        this.updateBPMDisplay(tempo, bpmMultiplier);
        
        const scoreDiv = document.createElement('div');
        scoreDiv.className = 'score-notes';
        
        const groups = this.groupNotes(noteEvents);
        
        let lastMeasureIndex = 0; 
        groups.forEach((group) => {
            const measureIndex = Math.floor(group.startTick / this.ticksPerMeasure);
            if (measureIndex > lastMeasureIndex) {
                const barLine = document.createElement('span'); 
                barLine.className = 'bar-line'; 
                barLine.textContent = '|';
                scoreDiv.appendChild(barLine); 
                lastMeasureIndex = measureIndex;
            }
            
            group.notes.sort((a, b) => (b.note + transpose) - (a.note + transpose));
            
            if (group.notes.length > 1) {
                const chordDiv = document.createElement('div'); 
                chordDiv.className = 'chord-group';
                group.notes.forEach(note => { chordDiv.appendChild(this.createNoteSpan(note)); });
                scoreDiv.appendChild(chordDiv);
            } else { 
                scoreDiv.appendChild(this.createNoteSpan(group.notes[0])); 
            }
        });
        this.container.appendChild(scoreDiv);
    }

    updateBPMDisplay(baseTempo, multiplier) {
        const bpmDisplay = document.getElementById('bpm-display');
        if (bpmDisplay && baseTempo) {
            // [FIX] 简单的 BPM 计算：60,000,000 / MPQ
            // 如果显示的数值是实际听感的2倍，通常是因为 TimeSignature 导致的（例如把八分音符当成一拍）
            // 这里我们保持标准 MIDI 定义：BPM = Quarter Notes Per Minute
            const baseBPM = Math.round(60000000 / baseTempo);
            const currentBPM = Math.round(baseBPM * multiplier);
            
            // 显示当前速度，并显示倍率
            const percent = Math.round(multiplier * 100);
            bpmDisplay.textContent = `${currentBPM} (${percent}%)`;
        }
    }

    groupNotes(noteEvents) {
        const groups = [];
        if (noteEvents.length > 0) {
            let currentGroup = { startTick: noteEvents[0].startTick, startTime: noteEvents[0].startTime, notes: [noteEvents[0]] };
            for (let i = 1; i < noteEvents.length; i++) {
                const note = noteEvents[i];
                if (Math.abs(note.startTime - currentGroup.startTime) < 0.05) { 
                    currentGroup.notes.push(note); 
                } else { 
                    groups.push(currentGroup); 
                    currentGroup = { startTick: note.startTick, startTime: note.startTime, notes: [note] }; 
                }
            }
            groups.push(currentGroup);
        }
        return groups;
    }

    createNoteSpan(noteEvent) {
        const octaveOffset = noteEvent.octave - 3; 
        const beats = noteEvent.beats;
        let lineCount = 0;
        let dashCount = 0;
        let hasDot = false;

        if (beats >= 1.0) {
            dashCount = Math.floor(beats) - 1;
            const remainder = beats % 1;
            if (remainder >= 0.375 && remainder <= 0.75) {
                if (dashCount < 0) dashCount = 0;
                hasDot = true; 
            }
        } else {
            let baseBeat = beats;
            if (beats >= 0.65 && beats < 0.9) {
                baseBeat = 0.5; hasDot = true;
            } else if (beats >= 0.3 && beats < 0.45) {
                baseBeat = 0.25; hasDot = true;
            }

            if (baseBeat < 0.9) {
                lineCount = Math.round(Math.log2(1 / baseBeat));
                if (lineCount < 0) lineCount = 0;
            }
        }

        const container = document.createElement('span');
        container.className = 'note-unit';
        container.id = `note-${noteEvent.index}`;
        
        const noteCol = document.createElement('div');
        noteCol.className = 'note-column';
        noteCol.style.position = 'relative';

        if (octaveOffset > 0) {
            const dotsTop = document.createElement('div');
            dotsTop.className = 'dots-container dots-top';
            for(let i=0; i<octaveOffset; i++) {
                const dot = document.createElement('span'); 
                dot.className = 'dot-mark'; 
                dotsTop.appendChild(dot);
            }
            noteCol.appendChild(dotsTop);
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'note-content';
        contentDiv.textContent = noteEvent.displayNumber;
        
        if (hasDot) {
            const dotSpan = document.createElement('span');
            dotSpan.className = 'rhythm-dot';
            dotSpan.textContent = '\u2022'; 
            contentDiv.appendChild(dotSpan);
        }
        noteCol.appendChild(contentDiv);

        if (octaveOffset < 0 || lineCount > 0) {
            const bottomWrapper = document.createElement('div');
            bottomWrapper.className = 'bottom-wrapper';

            if (octaveOffset < 0) {
                const dotsBottom = document.createElement('div');
                dotsBottom.className = 'dots-container dots-bottom';
                const count = Math.abs(octaveOffset);
                for(let i=0; i<count; i++) {
                    const dot = document.createElement('span'); 
                    dot.className = 'dot-mark'; 
                    dotsBottom.appendChild(dot);
                }
                bottomWrapper.appendChild(dotsBottom);
            }

            if (lineCount > 0) {
                const linesDiv = document.createElement('div');
                linesDiv.className = 'duration-lines';
                for(let i=0; i<lineCount; i++) {
                    const line = document.createElement('div');
                    line.className = 'd-line';
                    linesDiv.appendChild(line);
                }
                bottomWrapper.appendChild(linesDiv);
            }
            
            noteCol.appendChild(bottomWrapper);
        }

        container.appendChild(noteCol);

        if (dashCount > 0) {
            const dashSpan = document.createElement('span');
            dashSpan.className = 'extension-dash';
            let dashes = '';
            for(let i=0; i<dashCount; i++) dashes += ' -';
            dashSpan.textContent = dashes;
            container.appendChild(dashSpan);
        }

        return container;
    }

    highlightNotes(scoreNotes, currentTime) {
        const prevHighlights = document.querySelectorAll('.current-note');
        prevHighlights.forEach(el => { el.classList.remove('current-note'); });
        
        let firstActiveElement = null;
        for (const note of scoreNotes) {
            if (note.startTime > currentTime + 0.5) break; 
            const visualDuration = Math.max(0.3, note.duration); 
            if (currentTime >= note.startTime && currentTime <= note.startTime + visualDuration) {
                const el = document.getElementById(`note-${note.index}`);
                if (el) { 
                    el.classList.add('current-note'); 
                    if (!firstActiveElement) firstActiveElement = el; 
                }
            }
        }
        if (firstActiveElement) {
            firstActiveElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
    }
}