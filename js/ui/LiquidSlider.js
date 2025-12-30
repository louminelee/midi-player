export default class LiquidSlider {
    constructor(inputId, type) {
        this.input = document.getElementById(inputId);
        this.type = type; // 'volume' or 'tempo'
        
        if (!this.input) return;

        // 1. 构建 DOM 结构
        this.wrapInput();
        
        // 2. 创建特效元素
        this.effectElement = this.createEffectElement();
        this.wrapper.appendChild(this.effectElement);

        // 3. 绑定事件
        this.bindEvents();
        
        // 4. 初始化位置
        this.updateVisuals();
    }

    wrapInput() {
        // 创建一个 wrapper 把 input 包起来，方便绝对定位特效
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'liquid-slider-wrapper';
        this.input.parentNode.insertBefore(this.wrapper, this.input);
        this.wrapper.appendChild(this.input);
    }

    createEffectElement() {
        const div = document.createElement('div');
        div.className = 'slider-effect-ring';
        
        // 创建 SVG
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 60 60");
        svg.style.width = "100%";
        svg.style.height = "100%";

        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", "30");
        circle.setAttribute("cy", "30");
        circle.setAttribute("r", "20"); // 基础半径
        circle.setAttribute("fill", "none");
        circle.setAttribute("stroke", "var(--accent-color)");
        circle.setAttribute("stroke-width", "2");
        
        if (this.type === 'volume') {
            // 音量：实线，填充半透明背景
            circle.setAttribute("fill", "rgba(0, 122, 255, 0.1)");
        } else if (this.type === 'tempo') {
            // 速度：虚线
            circle.setAttribute("stroke-dasharray", "4 4");
            circle.setAttribute("stroke-linecap", "round");
        }

        svg.appendChild(circle);
        div.appendChild(svg);
        
        this.svgCircle = circle;
        return div;
    }

    bindEvents() {
        const update = () => this.updateVisuals();
        
        this.input.addEventListener('input', update);
        
        // 激活状态：按下时放大
        const start = () => {
            this.wrapper.classList.add('active');
            update();
        };
        const end = () => {
            this.wrapper.classList.remove('active');
            update();
        };

        this.input.addEventListener('mousedown', start);
        this.input.addEventListener('touchstart', start, { passive: true });
        
        window.addEventListener('mouseup', end);
        window.addEventListener('touchend', end);
    }

    updateVisuals() {
        const min = parseFloat(this.input.min) || 0;
        const max = parseFloat(this.input.max) || 100;
        const val = parseFloat(this.input.value);
        const ratio = (val - min) / (max - min); // 0.0 ~ 1.0

        // 1. 计算滑块中心点位置 (Pixel Perfect 计算)
        const trackWidth = this.input.offsetWidth;
        const thumbWidth = 24; // 对应 CSS 中的 thumb 宽度
        // 这种计算方式确保特效圈永远对准 thumb 中心
        const leftPos = ratio * (trackWidth - thumbWidth) + (thumbWidth / 2);
        
        this.effectElement.style.left = `${leftPos}px`;

        // 2. 根据类型计算动效参数
        if (this.type === 'volume') {
            // 音量：圈的大小 (Scale) 与值正相关
            // 基础 0.5倍，最大 1.8倍
            const scale = 0.5 + (ratio * 1.3);
            this.effectElement.style.transform = `translate(-50%, -50%) scale(${scale})`;
            
            // 只有按住时才显示外圈，松开时回到内部(通过 CSS opacity/scale 控制)
        
        } else if (this.type === 'tempo') {
            // 速度：虚线密度与值正相关
            // 值越大，dasharray 的数值越小（点越密），或者段数越多
            
            // 计算周长 C = 2 * PI * r = 2 * 3.14 * 20 ≈ 125
            const circumference = 125;
            
            // 动态计算虚线：速度越快，虚线段数越多
            // 段数从 4 到 24
            const segments = 4 + Math.floor(ratio * 20); 
            const dashLen = circumference / (segments * 2); 
            const gapLen = dashLen;
            
            this.svgCircle.setAttribute("stroke-dasharray", `${dashLen} ${gapLen}`);
            
            // 旋转动画速度也跟值相关 (可选，增加动感)
            this.effectElement.style.transform = `translate(-50%, -50%) rotate(${val * 2}deg)`;
        }
    }
}