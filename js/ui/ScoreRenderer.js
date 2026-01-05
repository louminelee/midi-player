export default class ScoreRenderer {
    constructor(containerId, ticksPerMeasure) {
        this.container = document.getElementById(containerId);
        this.ticksPerMeasure = ticksPerMeasure || 1920;
        this.injectStyles();
    }

    injectStyles() {
        if(!document.getElementById('score-fix-style')) {
            const style = document.createElement('style');
            style.id = 'score-fix-style';
            style.textContent = `
                .score-notes { 
                    display: flex; 
                    flex-wrap: wrap; 
                    align-items: baseline; 
                    gap: 0; 
                    row-gap: 80px !important; 
                    padding-bottom: 20px;
                }
                .bar-line { 
                    font-size: 28px;
                    font-weight: 300;
                    color: #ff3b30;
                    margin: 0 12px;
                    transform: translateY(4px); 
                }
                .note-unit, .extension-unit { 
                    position: relative; 
                    width: 40px; 
                    display: flex;
                    justify-content: center;
                    margin-right: 2px;
                    transition: margin-right 0.2s; 
                }
                .note-column { 
                    display: flex; 
                    flex-direction: column; 
                    align-items: center; 
                    position: relative; 
                    width: 100%;
                }
                .note-content { 
                    font-family: "SF Mono", "Menlo", monospace;
                    font-weight: 700; 
                    font-size: 24px; 
                    line-height: 1; 
                    color: #333;
                    position: relative;
                    z-index: 2;
                }
                .dash-symbol {
                    font-weight: 400;
                    font-size: 24px;
                    transform: scaleX(1.5); 
                    color: #333;
                }
                /* 节奏附点：CSS 绘制圆点 */
                .rhythm-dot { 
                    position: absolute; 
                    right: -7px;   
                    bottom: 5px;   
                    width: 4px;    
                    height: 4px;
                    background-color: #333;
                    border-radius: 50%;
                    pointer-events: none;
                    box-shadow: 0 0 1px rgba(0,0,0,0.1);
                }
                .dots-top { 
                    position: absolute; 
                    bottom: 28px; 
                    left: 0; 
                    width: 100%; 
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 3px;
                }
                .bottom-wrapper { 
                    position: absolute; 
                    top: 26px; 
                    left: 0; 
                    width: 100%; 
                    display: flex; 
                    flex-direction: column; 
                    align-items: center; 
                }
                .dots-bottom {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                    margin-bottom: 5px; 
                }
                .dot-mark { 
                    width: 4px; height: 4px; 
                    background-color: #333; 
                    border-radius: 50%; 
                }
                .duration-lines {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }
                .d-line { 
                    width: 100%; 
                    height: 2px; 
                    background: #333; 
                }
                .chord-group {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    border: 1px dashed rgba(0,0,0,0.1);
                    border-radius: 4px;
                    margin-right: 4px;
                }
                /* 高亮状态 */
                .current-note .note-content, 
                .current-note .dash-symbol { color: var(--accent-color); transform: scale(1.1); text-shadow: 0 0 15px var(--accent-color); }
                .current-note .dot-mark, 
                .current-note .rhythm-dot { background-color: var(--accent-color); box-shadow: 0 0 5px var(--accent-color); }
                .current-note .d-line { background: var(--accent-color); box-shadow: 0 0 5px var(--accent-color); }
            `;
            document.head.appendChild(style);
        }
    }

    setTicksPerMeasure(val) {
        this.ticksPerMeasure = val;
    }

    getLineCount(noteEvent) {
        let beats = noteEvent.beats;
        if (Math.abs((beats / 1.5) % 1) < 0.1 || Math.abs((beats / 1.5) % 0.5) < 0.1) {
             if (beats < 2.0) beats = beats / 1.5;
        }
        if (beats < 0.9) {
            let count = Math.round(Math.log2(1 / beats));
            return count < 0 ? 0 : count;
        }
        return 0;
    }

    hasExtensions(noteEvent) {
        return noteEvent.beats >= 1.5;
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
        
        this.updateBPMDisplay(tempo, bpmMultiplier);
        
        const scoreDiv = document.createElement('div');
        scoreDiv.className = 'score-notes';
        
        const groups = this.groupNotes(noteEvents);
        let lastMeasureIndex = 0; 
        
        groups.forEach((group, index) => {
            const measureIndex = Math.floor(group.startTick / this.ticksPerMeasure);
            if (measureIndex > lastMeasureIndex) {
                for (let m = lastMeasureIndex + 1; m <= measureIndex; m++) {
                    const barLine = document.createElement('span'); 
                    barLine.className = 'bar-line'; 
                    barLine.textContent = '|';
                    scoreDiv.appendChild(barLine); 
                }
                lastMeasureIndex = measureIndex;
            }
            
            group.notes.sort((a, b) => (b.note + transpose) - (a.note + transpose));
            
            let mainElement = null; 

            if (group.notes.length > 1) {
                const chordDiv = document.createElement('div'); 
                chordDiv.className = 'chord-group';
                group.notes.forEach(note => { 
                    chordDiv.appendChild(this.createNoteSpan(note, true)); 
                });
                scoreDiv.appendChild(chordDiv);
                mainElement = chordDiv;
                this.appendExtensions(scoreDiv, group.notes[0]);
            } else { 
                const note = group.notes[0];
                const noteSpan = this.createNoteSpan(note, false);
                scoreDiv.appendChild(noteSpan);
                mainElement = noteSpan;
                this.appendExtensions(scoreDiv, note);
            }

            const hasExt = this.hasExtensions(group.notes[0]);
            
            // 碰撞检测：如果没有延音线隔开，检测前后音符是否“打架”
            if (!hasExt && index < groups.length - 1 && mainElement) {
                const nextGroup = groups[index + 1];
                const curHasLow = group.notes.some(n => n.octave < 3); 
                const curHasLine = group.notes.some(n => this.getLineCount(n) > 0);
                const nextHasLow = nextGroup.notes.some(n => n.octave < 3);
                const nextHasLine = nextGroup.notes.some(n => this.getLineCount(n) > 0);

                const collisionRisk = (curHasLow && nextHasLine) || (curHasLine && nextHasLow);
                
                if (collisionRisk) {
                    mainElement.style.marginRight = '16px'; 
                }
            }
        });
        
        this.container.appendChild(scoreDiv);
    }

    appendExtensions(container, note) {
        const totalBeats = note.beats;
        if (totalBeats >= 1.5) { 
            const extensionCount = Math.floor(totalBeats - 0.1) - 1;
            for (let i = 0; i < extensionCount; i++) {
                const extUnit = document.createElement('div');
                extUnit.className = 'extension-unit';
                extUnit.id = `note-${note.index}-ext-${i}`;
                const content = document.createElement('div');
                content.className = 'dash-symbol';
                content.textContent = '-';
                extUnit.appendChild(content);
                container.appendChild(extUnit);
            }
        }
    }

    updateBPMDisplay(baseTempo, multiplier) {
        const bpmDisplay = document.getElementById('bpm-display');
        if (bpmDisplay && baseTempo) {
            const baseBPM = Math.round(60000000 / baseTempo);
            const currentBPM = Math.round(baseBPM * multiplier);
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

    createNoteSpan(noteEvent, isChordPart = false) {
        const octaveOffset = noteEvent.octave - 3; 
        const beats = noteEvent.beats;
        const lineCount = this.getLineCount(noteEvent); 

        // 检查是否为休止符 '0'
        const isRest = (noteEvent.displayNumber === '0');

        let hasDot = false;
        if (Math.abs((beats / 1.5) % 1) < 0.1 || Math.abs((beats / 1.5) % 0.5) < 0.1) {
             if (beats < 2.0 && (beats === 1.5 || beats === 0.75 || beats === 0.375)) {
                 hasDot = true;
             }
        }

        const container = document.createElement('div');
        container.className = 'note-unit';
        container.id = `note-${noteEvent.index}`;
        
        const noteCol = document.createElement('div');
        noteCol.className = 'note-column';

        // 1. 高八度点：休止符不显示
        if (!isRest && octaveOffset > 0) {
            const dotsTop = document.createElement('div');
            dotsTop.className = 'dots-top';
            for(let i=0; i<octaveOffset; i++) {
                const dot = document.createElement('span'); 
                dot.className = 'dot-mark'; 
                dotsTop.appendChild(dot);
            }
            noteCol.appendChild(dotsTop);
        }

        // 2. 音符数字
        const contentDiv = document.createElement('div');
        contentDiv.className = 'note-content';
        contentDiv.textContent = noteEvent.displayNumber;
        
        if (hasDot) {
            const dotSpan = document.createElement('span');
            dotSpan.className = 'rhythm-dot';
            contentDiv.appendChild(dotSpan);
        }
        noteCol.appendChild(contentDiv);

        // 3. 底部 (低八度点 + 减时线)
        const bottomWrapper = document.createElement('div');
        bottomWrapper.className = 'bottom-wrapper';
        let hasBottomContent = false;

        // 低八度点：休止符不显示
        if (!isRest && octaveOffset < 0) {
            const dotsBottom = document.createElement('div');
            dotsBottom.className = 'dots-bottom';
            const count = Math.abs(octaveOffset);
            for(let i=0; i<count; i++) {
                const dot = document.createElement('span'); 
                dot.className = 'dot-mark'; 
                dotsBottom.appendChild(dot);
            }
            bottomWrapper.appendChild(dotsBottom);
            hasBottomContent = true;
        }

        // 减时线：休止符必须显示
        if (lineCount > 0) {
            const linesDiv = document.createElement('div');
            linesDiv.className = 'duration-lines';
            for(let i=0; i<lineCount; i++) {
                const line = document.createElement('div');
                line.className = 'd-line';
                linesDiv.appendChild(line);
            }
            bottomWrapper.appendChild(linesDiv);
            hasBottomContent = true;
        }
        
        if (hasBottomContent) {
            noteCol.appendChild(bottomWrapper);
        }

        container.appendChild(noteCol);
        return container;
    }

    highlightNotes(scoreNotes, currentTime, shouldScroll = false) {
        const prevHighlights = document.querySelectorAll('.current-note');
        prevHighlights.forEach(el => { el.classList.remove('current-note'); });
        
        let firstActiveElement = null;
        for (const note of scoreNotes) {
            if (note.startTime > currentTime + 2.0) break; 
            if (currentTime >= note.startTime && currentTime < note.startTime + note.duration) {
                const mainEl = document.getElementById(`note-${note.index}`);
                if (mainEl) { 
                    mainEl.classList.add('current-note'); 
                    if (!firstActiveElement) firstActiveElement = mainEl;
                }
                let extIndex = 0;
                while(true) {
                    const extEl = document.getElementById(`note-${note.index}-ext-${extIndex}`);
                    if (extEl) {
                        extEl.classList.add('current-note');
                        extIndex++;
                    } else { break; }
                }
            }
        }
        if (shouldScroll && firstActiveElement) {
            firstActiveElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
    }
}