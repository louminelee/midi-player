export default class AdsrControl {
    constructor(onParamChangeCallback) {
        this.onParamChange = onParamChangeCallback;
        this.canvas = document.getElementById('adsrCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.activeDrag = null;

        // 配置定义
        this.config = [
            { prop: 'attack', knobId: 'adsr-attack-knob', inputId: 'val-a', visualId: 'knob-a', isLog: true, maxVal: 500, defaultMs: 50 },
            { prop: 'decay', knobId: 'adsr-decay-knob', inputId: 'val-d', visualId: 'knob-d', isLog: true, maxVal: 500, defaultMs: 200 },
            { prop: 'sustain', knobId: 'adsr-sustain-knob', inputId: 'val-s', visualId: 'knob-s', isLog: false, maxVal: 100, defaultMs: 60 },
            { prop: 'release', knobId: 'adsr-release-knob', inputId: 'val-r', visualId: 'knob-r', isLog: true, maxVal: 500, defaultMs: 300 }
        ];

        // 当前值缓存（用于绘图）
        this.currentValues = { attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.3 };

        this.init();
    }

    valToPos(val, max, isLog) {
        if (!isLog) return (val / max) * 100;
        const ratio = val / max;
        return Math.pow(ratio, 1/3) * 100;
    }

    posToVal(pos, max, isLog) {
        const ratio = pos / 100;
        if (!isLog) return Math.round(ratio * max);
        return Math.round(Math.pow(ratio, 3) * max);
    }

    init() {
        if (!this.canvas) return;

        // 绑定全局鼠标事件（为了处理拖拽）
        this.bindGlobalDragEvents();

        this.config.forEach(item => {
            const knobEl = document.getElementById(item.knobId);
            const inputEl = document.getElementById(item.inputId);
            const visualEl = document.getElementById(item.visualId);
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
            
            // 1. Wrapper 上的拖拽开始
            const startDrag = (e) => {
                if (e.target.classList.contains('val-input')) return;
                e.preventDefault();
                document.body.style.cursor = 'ew-resize';
                
                this.activeDrag = {
                    startX: e.clientX || (e.touches ? e.touches[0].clientX : 0),
                    startVal: parseFloat(knobEl.value),
                    knobEl: knobEl,
                    item: item, // 保存配置引用
                    updateUI: updateUI // 保存更新函数引用
                };
            };
            wrapper.addEventListener('mousedown', startDrag);
            wrapper.addEventListener('touchstart', startDrag, { passive: false });

            // 2. 原生 Range Input 变化
            knobEl.addEventListener('input', () => {
                const pos = parseFloat(knobEl.value);
                const val = this.posToVal(pos, item.maxVal, item.isLog);
                updateUI(val);
            });

            // 3. 数字输入框变化
            inputEl.addEventListener('change', () => updateUI(parseFloat(inputEl.value) || 0));
        });
    }

    updateValueInternal(prop, valMs) {
        let normalizedVal;
        if (prop === 'sustain') {
            normalizedVal = valMs / 100;
        } else {
            normalizedVal = valMs / 1000;
        }
        this.currentValues[prop] = normalizedVal;
        
        // 通知外部 AudioEngine
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
            
            // 更新 input range 的值
            this.activeDrag.knobEl.value = newPos;
            
            // 计算实际数值并更新 UI
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
        const scaleFactor = graphW / 2.5; 

        this.ctx.beginPath();
        this.ctx.strokeStyle = '#007aff'; this.ctx.lineWidth = 2; this.ctx.lineJoin = 'round'; this.ctx.lineCap = 'round';
        let currentX = padding; let currentY = bottomY; this.ctx.moveTo(currentX, currentY);

        const attackW = this.currentValues.attack * scaleFactor; 
        currentX += Math.max(attackW, 0); currentY = padding; 
        this.ctx.lineTo(currentX, currentY);

        const decayW = this.currentValues.decay * scaleFactor;
        const sustainH = graphH * this.currentValues.sustain; 
        const sustainY = bottomY - sustainH;
        currentX += Math.max(decayW, 0); currentY = sustainY;
        this.ctx.lineTo(currentX, currentY);

        const sustainW = 0.8 * scaleFactor;
        currentX += sustainW; this.ctx.lineTo(currentX, currentY);

        const releaseW = this.currentValues.release * scaleFactor;
        currentX += Math.max(releaseW, 0); currentY = bottomY;
        this.ctx.lineTo(currentX, currentY);
        this.ctx.stroke();
        this.ctx.lineTo(currentX, bottomY); this.ctx.lineTo(padding, bottomY);
        this.ctx.fillStyle = 'rgba(0, 122, 255, 0.1)'; this.ctx.fill();
    }
}