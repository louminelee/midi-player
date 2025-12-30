export default class HandwritingRecogniser {
    constructor(onRecognizedCallback) {
        this.onRecognized = onRecognizedCallback;
        this.model = null;
        this.isModelLoaded = false;
        
        this.modal = document.getElementById('handwriteModal');
        this.gridContainer = document.getElementById('drawingGrid');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        
        this.canvases = [];
        this.CELL_COUNT = 32; 
        
        this.initUI();
    }
    
    initUI() {
        document.getElementById('handwriteBtn').addEventListener('click', () => this.open());
        document.getElementById('cancelGridBtn').addEventListener('click', () => this.close());
        document.getElementById('clearGridBtn').addEventListener('click', () => this.clearAll());
        document.getElementById('recognizeBtn').addEventListener('click', () => this.process());
        
        for(let i=0; i<this.CELL_COUNT; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            const canvas = document.createElement('canvas');
            canvas.width = 100; 
            canvas.height = 100;
            cell.appendChild(canvas);
            this.gridContainer.appendChild(cell);
            this.canvases.push(canvas);
            this.setupCanvasDrawing(canvas);
        }
    }
    
    setupCanvasDrawing(canvas) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'black';
        ctx.fillRect(0,0, canvas.width, canvas.height);
        
        let isDrawing = false;
        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: (clientX - rect.left) * (canvas.width / rect.width),
                y: (clientY - rect.top) * (canvas.height / rect.height)
            };
        };
        
        const start = (e) => {
            isDrawing = true;
            const pos = getPos(e);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineWidth = 16; 
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'white';
        };
        
        const move = (e) => {
            if(!isDrawing) return;
            e.preventDefault();
            const pos = getPos(e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            canvas.setAttribute('data-dirty', 'true');
        };
        
        const end = () => { isDrawing = false; };
        
        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
        
        canvas.addEventListener('touchstart', start, {passive: false});
        canvas.addEventListener('touchmove', move, {passive: false});
        canvas.addEventListener('touchend', end);
    }
    
    open() {
        this.modal.style.display = 'flex';
        document.getElementById('modalKeySig').value = document.getElementById('keySignature').value;
    }
    
    close() {
        this.modal.style.display = 'none';
    }
    
    clearAll() {
        this.canvases.forEach(canvas => {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            canvas.removeAttribute('data-dirty');
        });
    }
    
    async loadModel() {
        if(this.model) return;
        this.loadingOverlay.style.display = 'flex';
        this.loadingOverlay.textContent = 'Downloading AI Model (approx 3MB)...';
        try {
            // 注意：依赖 window.tf，确保 HTML 引入了 TensorFlow.js
            this.model = await tf.loadLayersModel('https://storage.googleapis.com/tfjs-models/tfjs/mnist_transfer_cnn_v1/model.json');
            this.isModelLoaded = true;
        } catch(e) {
            console.error(e);
            alert("Failed to load AI model. Please check network.");
        }
    }
    
    preprocessCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        let minX = width, minY = height, maxX = 0, maxY = 0;
        let found = false;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const offset = (y * width + x) * 4;
                if (data[offset] > 0) { 
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    found = true;
                }
            }
        }

        if (!found) return null;

        const contentW = maxX - minX + 1;
        const contentH = maxY - minY + 1;
        const aspectRatio = contentW / contentH; 

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 28;
        tempCanvas.height = 28;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.fillStyle = 'black';
        tempCtx.fillRect(0, 0, 28, 28);

        const targetSize = 20;
        const scale = Math.min(targetSize / contentW, targetSize / contentH);
        const drawW = contentW * scale;
        const drawH = contentH * scale;

        const offsetX = (28 - drawW) / 2;
        const offsetY = (28 - drawH) / 2;

        tempCtx.drawImage(
            canvas, 
            minX, minY, contentW, contentH,
            offsetX, offsetY, drawW, drawH 
        );

        return {
            canvas: tempCanvas,
            aspectRatio: aspectRatio
        };
    }

    async process() {
        await this.loadModel();
        if(!this.model) {
            this.loadingOverlay.style.display = 'none';
            return;
        }
        
        this.loadingOverlay.textContent = 'Recognizing...';
        const results = [];
        
        tf.tidy(() => {
            for(let i=0; i<this.canvases.length; i++) {
                const canvas = this.canvases[i];
                if(!canvas.getAttribute('data-dirty')) {
                    results.push(0);
                    continue;
                }
                
                const preData = this.preprocessCanvas(canvas);
                if (!preData) {
                    results.push(0);
                    continue;
                }
                
                let img = tf.browser.fromPixels(preData.canvas, 1);
                img = tf.image.resizeBilinear(img, [28, 28]); 
                img = img.toFloat().div(tf.scalar(255));
                img = img.expandDims(0);
                
                const prediction = this.model.predict(img);
                const probabilities = Array.from(prediction.dataSync());
                
                if (preData.aspectRatio > 0.55) {
                    probabilities[1] = probabilities[1] * 0.1; 
                }

                probabilities[5] *= 1.3;
                probabilities[6] *= 1.3;
                probabilities[7] *= 1.3;

                let maxProb = -1;
                let bestDigit = 0;
                
                for(let d=0; d<=9; d++) {
                    if (probabilities[d] > maxProb) {
                        maxProb = probabilities[d];
                        bestDigit = d;
                    }
                }
                
                if (bestDigit >= 1 && bestDigit <= 7) {
                    results.push(bestDigit);
                } else {
                    let bestValidDigit = 0;
                    let bestValidProb = 0;
                    for(let d=1; d<=7; d++) {
                        if(probabilities[d] > bestValidProb) {
                            bestValidProb = probabilities[d];
                            bestValidDigit = d;
                        }
                    }
                    if (bestValidProb > 0.15) { 
                        results.push(bestValidDigit);
                    } else {
                        results.push(0); 
                    }
                }
            }
        });
        
        this.loadingOverlay.style.display = 'none';
        this.close();
        
        const key = document.getElementById('modalKeySig').value;
        this.onRecognized(results, key);
    }
}