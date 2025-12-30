export default class AdsrControl {
    constructor(onParamChangeCallback) {
        this.onParamChange = onParamChangeCallback;
        this.canvas = document.getElementById('adsrCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.activeDrag = null;

        // 配置定义
        this.config = [
            // Attack: 0-2000ms, Log
            { prop: 'attack', knobId: 'adsr-attack-knob', inputId: 'val-a', visualId: 'knob-a', isLog: true, maxVal: 800, defaultMs: 50 },
            // Decay: 0-2000ms, Log
            { prop: 'decay', knobId: 'adsr-decay-knob', inputId: 'val-d', visualId: 'knob-d', isLog: true, maxVal: 300, defaultMs: 200 },
            // Sustain Level: 0-100%, Linear
            { prop: 'sustain', knobId: 'adsr-sustain-knob', inputId: 'val-s', visualId: 'knob-s', isLog: false, maxVal: 100, defaultMs: 90 },
            // [修改] Sustain Time: 0-500ms, Log (对数关系)
            { prop: 'sustainTime', knobId: 'adsr-sus-time-knob', inputId: 'val-st', visualId: 'knob-st', isLog: true, maxVal: 500, defaultMs: 200 },
            // Release: 0-5000ms, Log
            { prop: 'release', knobId: 'adsr-release-knob', inputId: 'val-r', visualId: 'knob-r', isLog: true, maxVal: 800, defaultMs: 300 }
        ];

        // 当前值缓存
        this.currentValues = { attack: 0.05, decay: 0.05, sustain: 0.9, sustainTime: 0.2, release: 0.3 };

        this.init();
    }

    valToPos(val, max, isLog) {
        if (!isLog) return (val / max) * 100;
        // 使用立方根反向映射，配合 posToVal 的立方函数，实现类似对数电位器的手感
        const ratio = val / max;
        return Math.pow(ratio, 1/3) * 100;
    }

    posToVal(pos, max, isLog) {
        const ratio = pos / 100;
        if (!isLog) return Math.round(ratio * max);
        // 使用立方函数 (x^3) 模拟对数曲线：低数值区间变化慢，高数值区间变化快
        return Math.round(Math.pow(ratio, 3) * max);
    }

    init() {
        if (!this.canvas) return;

        this.bindGlobalDragEvents();

        this.config.forEach(item => {
            const knobEl = document.getElementById(item.knobId);
            const inputEl = document.getElementById(item.inputId);
            const visualEl = document.getElementById(item.visualId);
            
            if (!knobEl || !inputEl || !visualEl) return;

            const wrapper = visualEl.closest('.knob-wrapper');

            // 初始化值
            inputEl.value = item.defaultMs;
            knobEl.value = this.valToPos(item.defaultMs, item.maxVal, item.isLog);
            
            // 更新内部状态
            this.updateValueInternal(item.prop, item.defaultMs);

            // 更新 UI 的函数
            const updateUI = (actualVal, skipInputUpdate = false) => {
                this.updateValueInternal(item.prop, actualVal);
                
                const pos = this.valToPos(actualVal, item.maxVal, item.isLog);
                const angle = -135 + (pos / 100 * 270);
                visualEl.style.transform = `rotate(${angle}deg)`;
                knobEl.value = pos;
                if (!skipInputUpdate) inputEl.value = actualVal;
                
                this.drawGraph();
            };

            // 初始绘制
            updateUI(item.defaultMs);

            // --- 绑定事件 ---
            const startDrag = (e) => {
                if (e.target.classList.contains('val-input')) return;
                e.preventDefault();
                document.body.style.cursor = 'ew-resize';
                
                this.activeDrag = {
                    startX: e.clientX || (e.touches ? e.touches[0].clientX : 0),
                    startVal: parseFloat(knobEl.value),
                    knobEl: knobEl,
                    item: item, 
                    updateUI: updateUI 
                };
            };
            wrapper.addEventListener('mousedown', startDrag);
            wrapper.addEventListener('touchstart', startDrag, { passive: false });

            knobEl.addEventListener('input', () => {
                const pos = parseFloat(knobEl.value);
                const val = this.posToVal(pos, item.maxVal, item.isLog);
                updateUI(val);
            });

            inputEl.addEventListener('change', () => updateUI(parseFloat(inputEl.value) || 0));
        });
    }

    updateValueInternal(prop, valMs) {
        let normalizedVal;
        if (prop === 'sustain') {
            normalizedVal = valMs / 100; // 百分比转 0-1
        } else {
            normalizedVal = valMs / 1000; // 毫秒转秒
        }
        this.currentValues[prop] = normalizedVal;
        
        if (this.onParamChange) {
            this.onParamChange(prop, normalizedVal);
        }
    }

    bindGlobalDragEvents() {
        const onGlobalMove = (e) => {
            if (!this.activeDrag) return;
            e.preventDefault(); 
            
            const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
            const deltaX = clientX - this.activeDrag.startX;
            const sensitivity = 0.5; 
            
            let newPos = this.activeDrag.startVal + (deltaX * sensitivity);
            newPos = Math.max(0, Math.min(100, newPos));
            
            this.activeDrag.knobEl.value = newPos;
            
            const newVal = this.posToVal(newPos, this.activeDrag.item.maxVal, this.activeDrag.item.isLog);
            this.activeDrag.updateUI(newVal);
        };

        const onGlobalUp = () => {
            if (this.activeDrag) {
                this.activeDrag = null;
                document.body.style.cursor = '';
            }
        };

        window.addEventListener('mousemove', onGlobalMove, { passive: false });
        window.addEventListener('touchmove', onGlobalMove, { passive: false });
        window.addEventListener('mouseup', onGlobalUp);
        window.addEventListener('touchend', onGlobalUp);
    }

    drawGraph() {
        if (!this.ctx) return;
        const w = this.canvas.width, h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);
        const padding = 15;
        const graphW = w - padding * 2, graphH = h - padding * 2, bottomY = h - padding;
        
        // 动态计算缩放：让较短的时间看起来更宽一点，适应 0-500ms 的变化
        const scaleFactor = graphW / 2.5; 

        this.ctx.beginPath();
        this.ctx.strokeStyle = '#007aff'; this.ctx.lineWidth = 2; this.ctx.lineJoin = 'round'; this.ctx.lineCap = 'round';
        let currentX = padding; let currentY = bottomY; this.ctx.moveTo(currentX, currentY);

        // 1. Attack
        const attackW = this.currentValues.attack * scaleFactor; 
        currentX += Math.max(attackW, 0); currentY = padding; 
        this.ctx.lineTo(currentX, currentY);

        // 2. Decay
        const decayW = this.currentValues.decay * scaleFactor;
        const sustainH = graphH * this.currentValues.sustain; 
        const sustainY = bottomY - sustainH;
        currentX += Math.max(decayW, 0); currentY = sustainY;
        this.ctx.lineTo(currentX, currentY);

        // 3. Sustain Time (动态宽度)
        const sustainW = this.currentValues.sustainTime * scaleFactor;
        currentX += Math.max(sustainW, 0); 
        this.ctx.lineTo(currentX, currentY);

        // 4. Release
        const releaseW = this.currentValues.release * scaleFactor;
        currentX += Math.max(releaseW, 0); currentY = bottomY;
        this.ctx.lineTo(currentX, currentY);
        
        this.ctx.stroke();
        this.ctx.lineTo(currentX, bottomY); this.ctx.lineTo(padding, bottomY);
        this.ctx.fillStyle = 'rgba(0, 122, 255, 0.1)'; this.ctx.fill();
    }
}