export default class MidiProcessor {
    static midiNoteToFrequency(note) { 
        return 440 * Math.pow(2, (note - 69) / 12); 
    }

    static midiNoteToPitchName(note) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const normalizedNote = ((note % 12) + 12) % 12;
        const octave = Math.floor(note / 12) - 1;
        return { name: noteNames[normalizedNote], octave: octave };
    }

    static pitchNameToNumberedNotation(pitchName, keySignature = 'C') {
        const cMajorMapping = { 'C': '1', 'C#': '#1', 'D': '2', 'D#': '#2', 'E': '3', 'F': '4', 'F#': '#4', 'G': '5', 'G#': '#5', 'A': '6', 'A#': '#6', 'B': '7' };
        const keyAdjustments = { 'C': 0, 'G': 7, 'D': 2, 'A': 9, 'E': 4, 'B': 11, 'F#': 6, 'F': 5, 'Bb': -2, 'Eb': -9, 'Ab': -4, 'Db': -11 };
        const adjustment = keyAdjustments[keySignature] !== undefined ? keyAdjustments[keySignature] : 0;
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const noteIndex = notes.indexOf(pitchName);
        if (noteIndex === -1) return pitchName;
        let adjustedIndex = (noteIndex - adjustment + 12) % 12;
        if (adjustedIndex < 0) adjustedIndex += 12;
        const adjustedNote = notes[adjustedIndex];
        return cMajorMapping[adjustedNote] || adjustedNote;
    }

    static parseMidiFile(arrayBuffer) {
        if (typeof MidiParser === 'undefined') {
            throw new Error('MidiParser library not found');
        }
        return MidiParser.parse(new Uint8Array(arrayBuffer));
    }

    static getMainTrack(midiData) {
        if (!midiData || !midiData.track) return null;
        let bestTrack = null; let maxNotes = -1;
        midiData.track.forEach(track => {
            let noteCount = 0;
            if (track.event) { track.event.forEach(event => { if (event.type === 9) noteCount++; }); }
            if (noteCount > maxNotes) { maxNotes = noteCount; bestTrack = track; }
        });
        return bestTrack || midiData.track[0];
    }

    static extractTempo(midiData) {
        let baseTempo = 500000;
        if (!midiData || !midiData.track) return baseTempo;
        const track0 = midiData.track[0];
        if (!track0 || !track0.event) return baseTempo;
        for (const event of track0.event) {
            if (event.type === 255 && event.metaType === 81) {
                let data = event.data;
                if (Array.isArray(data)) { baseTempo = (data[0] << 16) + (data[1] << 8) + data[2]; } 
                else if (typeof data === 'number') { baseTempo = data; }
                break; 
            }
        }
        return baseTempo;
    }

    static extractTimeSignature(midiData) {
        let numerator = 4; let denominator = 4;
        if (midiData && midiData.track) {
            const track0 = midiData.track[0];
            if (track0 && track0.event) {
                for (const event of track0.event) {
                    if (event.type === 255 && event.metaType === 88) {
                        if (Array.isArray(event.data)) { numerator = event.data[0]; denominator = Math.pow(2, event.data[1]); }
                        break; 
                    }
                }
            }
        }
        return { numerator, denominator };
    }

    // [修改] 核心处理逻辑：支持休止符填充
    static processTrackToEvents(track, tpq, baseTempo, transpose, keySignature) {
        if (!track || !track.event) return [];
        
        const secondsPerTick = (baseTempo / 1000000) / tpq;
        const activeNotes = new Map();
        const noteEvents = [];
        let currentTick = 0; 
        let currentTime = 0; 
        let noteCount = 0;
        
        // 1. 提取所有有效音符
        for (const event of track.event) {
            const deltaTicks = event.deltaTime || 0;
            currentTick += deltaTicks; 
            currentTime += deltaTicks * secondsPerTick;
            
            const isNoteOn = (event.type === 9); 
            const isNoteOff = (event.type === 8);
            let noteNumber = 0; 
            let velocity = 0;
            
            if (event.data && Array.isArray(event.data)) { 
                noteNumber = event.data[0]; 
                velocity = event.data[1] !== undefined ? event.data[1] : 0; 
            } else if (event.noteNumber !== undefined) { 
                noteNumber = event.noteNumber; 
                velocity = event.velocity; 
            }

            if (isNoteOn && velocity > 0) {
                activeNotes.set(noteNumber, { startTick: currentTick, startTime: currentTime, velocity: velocity / 127 });
            } else if (isNoteOff || (isNoteOn && velocity === 0)) {
                const noteStart = activeNotes.get(noteNumber);
                if (noteStart) {
                    const durationSeconds = (currentTime - noteStart.startTime);
                    const durationTicks = currentTick - noteStart.startTick;
                    const beatDuration = durationTicks / tpq;

                    if (durationSeconds >= 0) {
                        const displayNoteNum = noteNumber + transpose;
                        const pitchInfo = this.midiNoteToPitchName(displayNoteNum);
                        const numberedNote = this.pitchNameToNumberedNotation(pitchInfo.name, keySignature);
                        
                        noteEvents.push({
                            index: noteCount++, 
                            note: noteNumber, 
                            displayNumber: numberedNote, 
                            octave: pitchInfo.octave, 
                            beats: beatDuration, 
                            startTick: noteStart.startTick, 
                            startTime: noteStart.startTime, 
                            duration: durationSeconds, 
                            originalDuration: durationSeconds,
                            velocity: noteStart.velocity, 
                            pitchInfo: pitchInfo
                        });
                    }
                    activeNotes.delete(noteNumber);
                }
            }
        }

        // 2. 排序音符
        noteEvents.sort((a, b) => a.startTime - b.startTime);

        // 3. [新增] 填充休止符 (0)
        const eventsWithRests = [];
        let lastVoiceEndTime = 0; 
        const secondsPerBeat = secondsPerTick * tpq; 
        const minRestGap = secondsPerBeat / 8; 

        noteEvents.forEach(note => {
            // 如果当前音符开始时间明显晚于上一个音符的结束时间 -> 插入休止符
            if (note.startTime > lastVoiceEndTime + minRestGap) {
                const restDuration = note.startTime - lastVoiceEndTime;
                const restBeats = restDuration / secondsPerBeat;
                
                eventsWithRests.push({
                    index: noteCount++, 
                    note: -1,           // 特殊标识：休止符
                    displayNumber: '0', // 简谱显示为 0
                    octave: 4,          // 默认中音，不显示上下点
                    beats: restBeats,
                    startTick: 0,       
                    startTime: lastVoiceEndTime,
                    duration: restDuration,
                    originalDuration: restDuration,
                    velocity: 0,
                    pitchInfo: { name: 'Rest', octave: 4 }
                });
            }

            eventsWithRests.push(note);
            
            if (note.startTime + note.duration > lastVoiceEndTime) {
                lastVoiceEndTime = note.startTime + note.duration;
            }
        });

        return eventsWithRests;
    }
}