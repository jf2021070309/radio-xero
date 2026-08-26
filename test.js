
        // ─── RADIO XERO PLAYER ───────────────────────────────────────────────────
        const STREAM_URL = 'https://stream.zeno.fm/n7fm3s6537zuv';

        const audio = document.getElementById('rxAudio');
        const statusEl = document.getElementById('rxStatus');
        const playIcon = document.getElementById('playIcon');
        const vuL = document.getElementById('vuL');
        const vuR = document.getElementById('vuR');
        const barsL = [];
        const barsR = [];
        const SEGMENT_COUNT = 24;

        // Detección de Dispositivos y Navegadores
        const isIosDevice = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isEdgeAndroid = /EdgA/i.test(navigator.userAgent);
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

        function createSegments(container, array) {
            for (let i = 0; i < SEGMENT_COUNT; i++) {
                const seg = document.createElement('div');
                seg.className = 'rx-vu-segment';

                // Assign color class based on position
                const percent = (i / SEGMENT_COUNT) * 100;
                if (percent < 50) seg.classList.add('low');
                else if (percent < 80) seg.classList.add('mid');
                else seg.classList.add('high');

                container.appendChild(seg);
                array.push(seg);
            }
        }

        createSegments(vuL, barsL);
        createSegments(vuR, barsR);

        let isPlaying = false;
        let animId = null;
        let audioCtx = null;
        let srcNode = null;
        let dataArr = null;
        let simL = 0;
        let simR = 0;
        let analyser = null;
        let lastPauseTime = 0;
        let systemPauseAutoResume = false;

        // Variables de Visualización
        let currentVizMode = 'bars';
        let canvas = document.getElementById('rxCanvas');
        let ctx = canvas ? canvas.getContext('2d') : null;

        // Volumen
        function rxSetVol(v) {
            audio.volume = v / 100;
            const slider = document.getElementById('volSlider');
            const volValue = document.getElementById('volValue');
            const muteIcon = document.getElementById('muteIconLeft');
            
            if (slider) {
                slider.value = v;
                slider.style.background = `linear-gradient(to right, #ED1C24 ${v}%, rgba(237, 28, 36, 0.2) ${v}%)`;
            }
            if (volValue) volValue.textContent = v + '%';

            if (muteIcon) {
                if (v == 0) {
                    muteIcon.className = 'fas fa-volume-xmark';
                } else if (v < 50) {
                    muteIcon.className = 'fas fa-volume-low';
                } else {
                    muteIcon.className = 'fas fa-volume-high';
                }
            }

            if (v > 0 && audio.muted) {
                rxToggleMute();
            }
        }
        document.addEventListener('DOMContentLoaded', () => {
            rxSetVol(100);
        });
        // Mute / Unmute
        let isMuted = false;
        let volumeBeforeMute = 100;

        function rxToggleMute() {
            const muteBtn = document.getElementById('muteBtn');
            const muteIcon = document.getElementById('muteIconLeft');

            isMuted = !isMuted;
            audio.muted = isMuted;

            if (isMuted) {
                volumeBeforeMute = parseInt(document.getElementById('volSlider').value);
                if (muteIcon) muteIcon.className = 'fas fa-volume-xmark';
                if (muteBtn) muteBtn.style.opacity = '0.55';
            } else {
                if (muteIcon) muteIcon.className = volumeBeforeMute < 50 ? 'fas fa-volume-low' : 'fas fa-volume-high';
                if (muteBtn) muteBtn.style.opacity = '1';
            }
        }

        // Cambio rápido de modo de visualizador (LED -> BARS -> WAVE -> LED)
        const vizModesList = ['led', 'bars', 'wave'];
        function rxCycleVizMode() {
            const nextIndex = (vizModesList.indexOf(currentVizMode) + 1) % vizModesList.length;
            setVizMode(vizModesList[nextIndex]);
        }

        function setIcon(state) {
            const btn = document.getElementById('playBtn');
            if (state === 'loading') {
                btn.innerHTML = '<div class="rx-loader"></div>';
                btn.classList.add('loading');
                btn.disabled = true;
                return;
            }

            btn.disabled = false;
            btn.classList.remove('loading');
            btn.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                ${state === 'playing'
                    ? '<rect x="6" y="4" width="4" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1.5" fill="currentColor"/>'
                    : '<polygon points="6,4 20,12 6,20" fill="currentColor"/>'}
            </svg>`;
        }

        function setStatus(msg, type) {
            statusEl.innerHTML = msg;
            statusEl.className = 'rx-status' + (type ? ' ' + type : '');
        }

        function idleAnim() {
            let t = 0;
            function frame() {
                if (isPlaying) return;
                animId = requestAnimationFrame(frame);
                t += 0.05;

                if (currentVizMode === 'led') {
                    const valL = Math.abs(Math.sin(t)) * 0.35;
                    const valR = Math.abs(Math.cos(t)) * 0.35;
                    const activeL = Math.round(valL * SEGMENT_COUNT);
                    const activeR = Math.round(valR * SEGMENT_COUNT);

                    barsL.forEach((seg, i) => {
                        if (i < activeL) seg.classList.add('active');
                        else seg.classList.remove('active');
                    });
                    barsR.forEach((seg, i) => {
                        if (i < activeR) seg.classList.add('active');
                        else seg.classList.remove('active');
                    });
                } else {
                    // Animación sutil para Canvas en pausa
                    ctx.clearRect(0, 0, canvasW, canvasH);

                    if (currentVizMode === 'bars') {
                        const count = 32;
                        const barWidth = (canvasW / count) * 0.78;
                        const gap = (canvasW / count) * 0.22;
                        for(let i=0; i<count; i++) {
                            const progress = i / count;
                            const envelope = Math.sin(0.1 + progress * 0.8 * Math.PI);
                            const h = 4 + Math.abs(Math.sin(t + i*0.2)) * 12 * envelope;
                            const x = gap/2 + i * (barWidth + gap);
                            const y = canvasH - 3 - h;
                            ctx.fillStyle = document.body.classList.contains('dark-theme') ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
                            ctx.fillRect(x, y, barWidth, h);
                        }
                    } else if (currentVizMode === 'wave') {
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = document.body.classList.contains('dark-theme') ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
                        ctx.beginPath();
                        ctx.moveTo(0, canvasH - 4);
                        for(let x=0; x<=canvasW; x+=4) {
                            const progress = x / canvasW;
                            const envelope = Math.sin(progress * Math.PI);
                            const y = (canvasH - 4) - Math.abs(Math.sin(x*0.02 + t)) * 8 * envelope;
                            ctx.lineTo(x, y);
                        }
                        ctx.stroke();
                    }
                }
            }
            frame();
        }
        idleAnim();

        let canvasW = 0;
        let canvasH = 0;

        if (canvas) {
            const resizeObserver = new ResizeObserver(entries => {
                for (let entry of entries) {
                    if (entry.contentRect.width > 0) {
                        const dpr = window.devicePixelRatio || 1;
                        canvasW = entry.contentRect.width;
                        canvasH = entry.contentRect.height;
                        
                        canvas.width = canvasW * dpr;
                        canvas.height = canvasH * dpr;
                        
                        // Reset the transform matrix and scale
                        ctx.setTransform(1, 0, 0, 1, 0, 0);
                        ctx.scale(dpr, dpr);
                    }
                }
            });
            resizeObserver.observe(canvas);
        }

        // Manejo de redimensionado para otros elementos
        window.addEventListener('resize', () => {
            checkTrackOverflow();
        });

        function setVizMode(mode) {
            currentVizMode = mode;
            
            const container = document.getElementById('rxVizContainer');
            const canvasEl = document.getElementById('rxCanvas');

            if (container && canvasEl) {
                if (mode === 'led') {
                    container.style.display = 'flex';
                    canvasEl.style.display = 'none';
                } else {
                    container.style.display = 'none';
                    canvasEl.style.display = 'block';
                }
            }
        }
        
        window.addEventListener('DOMContentLoaded', () => {
            setVizMode(currentVizMode);
        });

        function startAnalyser() {
            if (!dataArr) dataArr = new Uint8Array(128);

            function draw() {
                if (!isPlaying) return;
                animId = requestAnimationFrame(draw);

                if (currentVizMode === 'led') {
                    drawLed();
                } else if (currentVizMode === 'bars') {
                    drawBars();
                } else if (currentVizMode === 'wave') {
                    drawWave();
                }
            }
            draw();
        }

        let simulatedBeatTime = 0;

        function simulateFrequencyData() {
            if (!dataArr) dataArr = new Uint8Array(128);
            const now = Date.now() / 150;
            const ms = Date.now();
            const currentVolume = audio.muted ? 0 : audio.volume;

            // Simular un golpe (beat) aleatorio de bajo/batería
            if (ms > simulatedBeatTime) {
                simulatedBeatTime = ms + 300 + Math.random() * 500;
            }
            // Decaimiento del beat
            const beatIntensity = Math.max(0, 1 - (simulatedBeatTime - ms) / 300);

            for (let i = 0; i < dataArr.length; i++) {
                const progress = i / dataArr.length;
                
                // Envolvente: altos en los graves, baja en los agudos
                const envelope = Math.sin(progress * Math.PI);
                
                // Ondas desfasadas para movimiento base
                const wave1 = Math.sin(now * 2.1 + i * 0.2) * 55;
                const wave2 = Math.sin(now * 1.3 - i * 0.1) * 35;
                const wave3 = Math.cos(now * 3.5 + i * 0.3) * 20;
                
                // Ruido aleatorio que le da textura real
                const noise = (Math.random() - 0.5) * 55;
                
                // Los graves reaccionan mucho al beat, los agudos menos
                const beat = (progress < 0.25) ? beatIntensity * 120 : beatIntensity * 40;

                const base = 70 + (1 - progress) * 90;
                
                let rawVal = (base + wave1 + wave2 + wave3 + noise + beat) * envelope * 1.4;
                
                // Suavizado temporal
                const prev = dataArr[i] || 0;
                let val = prev * 0.5 + (rawVal * currentVolume) * 0.5;

                const baseFloor = currentVolume > 0.05 ? 10 : 0;
                dataArr[i] = Math.max(baseFloor, Math.min(255, val));
            }
        }

        function drawLed() {
            simulateFrequencyData();
            
            // Promedio para simular canal izquierdo
            let avgL = 0;
            for(let i = 0; i < 16; i++) avgL += dataArr[i];
            avgL /= 16;
            
            // Promedio para simular canal derecho
            let avgR = 0;
            for(let i = 16; i < 32; i++) avgR += dataArr[i];
            avgR /= 16;

            // Mapear de 0-255 a 0-SEGMENT_COUNT (amplificando un poco el valor)
            let targetL = (avgL / 255) * SEGMENT_COUNT * 1.3;
            let targetR = (avgR / 255) * SEGMENT_COUNT * 1.3;
            
            // Suavizado del movimiento
            simL += (targetL - simL) * 0.25;
            simR += (targetR - simR) * 0.25;

            let activeValL = Math.round(simL);
            let activeValR = Math.round(simR);

            activeValL = Math.max(0, Math.min(SEGMENT_COUNT, activeValL));
            activeValR = Math.max(0, Math.min(SEGMENT_COUNT, activeValR));

            barsL.forEach((seg, i) => {
                if (i < activeValL) seg.classList.add('active');
                else seg.classList.remove('active');
            });
            barsR.forEach((seg, i) => {
                if (i < activeValR) seg.classList.add('active');
                else seg.classList.remove('active');
            });
        }

        function drawBars() {
            if (canvasW === 0 || canvasH === 0) return;
            simulateFrequencyData();
            ctx.clearRect(0, 0, canvasW, canvasH);
            
            const barCount = 32;
            const barWidth = (canvasW / barCount) * 0.78;
            const gap = (canvasW / barCount) * 0.22;
            
            const brickHeight = 4;
            const brickGap = 1.5;
            const totalBricks = Math.floor((canvasH - 4) / (brickHeight + brickGap));
            
            let x = gap / 2;
            const usableBins = Math.min(dataArr.length, 64);
            const step = usableBins / barCount;

            for (let i = 0; i < barCount; i++) {
                const binIdx = Math.floor(i * step);
                let avg = 0;
                let count = 0;
                for (let j = 0; j < Math.ceil(step) && (binIdx + j) < usableBins; j++) {
                    avg += dataArr[binIdx + j];
                    count++;
                }
                avg = count > 0 ? avg / count : (dataArr[binIdx] || 0);

                // Escala musical armónica con caída suave en frecuencias ultrasónicas
                const progress = i / barCount;
                const windowFactor = Math.sin(0.15 + progress * 0.85 * Math.PI);
                const factor = (0.9 + (1 - progress) * 0.25) * windowFactor;
                
                const activeHeight = Math.min(canvasH - 6, (avg / 255) * canvasH * factor);
                const activeBricks = Math.max(0, Math.min(totalBricks, Math.ceil(activeHeight / (brickHeight + brickGap))));

                for (let b = 0; b < totalBricks; b++) {
                    const y = canvasH - 3 - (b * (brickHeight + brickGap)) - brickHeight;
                    const percent = (b / totalBricks) * 100;
                    
                    if (b < activeBricks) {
                        if (percent < 50) ctx.fillStyle = '#22c55e'; // Verde
                        else if (percent < 80) ctx.fillStyle = '#f97316'; // Naranja
                        else ctx.fillStyle = '#ef4444'; // Rojo
                        
                        ctx.shadowBlur = 4;
                        ctx.shadowColor = ctx.fillStyle;
                    } else {
                        ctx.fillStyle = document.body.classList.contains('dark-theme') ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
                        ctx.shadowBlur = 0;
                    }

                    ctx.fillRect(x, y, barWidth, brickHeight);
                }

                x += barWidth + gap;
            }
        }

        function drawWave() {
            if (canvasW === 0 || canvasH === 0) return;
            simulateFrequencyData();
            ctx.clearRect(0, 0, canvasW, canvasH);

            const pointsCount = 48;
            const usableBins = Math.min(dataArr.length, 64);
            const step = usableBins / pointsCount;
            
            // Mapeo suave de puntos con caída armónica en ambos extremos
            const points = [];
            for (let i = 0; i <= pointsCount; i++) {
                const binIdx = Math.min(usableBins - 1, Math.floor(i * step));
                const val = dataArr[binIdx] || 0;
                const progress = i / pointsCount;
                const windowFactor = Math.sin(progress * Math.PI);
                const v = (val / 255) * (canvasH - 14) * windowFactor;
                const x = (i / pointsCount) * canvasW;
                const y = Math.max(6, Math.min(canvasH - 4, canvasH - 4 - v));
                points.push({ x, y });
            }

            // 1. Trazado de la onda superior con degradado
            const gradient = ctx.createLinearGradient(0, canvasH, 0, 0);
            gradient.addColorStop(0, '#22c55e');   // Verde
            gradient.addColorStop(0.5, '#f97316'); // Naranja
            gradient.addColorStop(0.9, '#ef4444'); // Rojo
            
            ctx.beginPath();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = gradient;
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(237, 28, 36, 0.35)';

            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                const mx = (prev.x + curr.x) / 2;
                const my = (prev.y + curr.y) / 2;
                ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
            }
            ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
            ctx.stroke();

            // 2. Relleno inferior degradado limpio
            ctx.lineTo(canvasW, canvasH);
            ctx.lineTo(0, canvasH);
            ctx.closePath();
            
            ctx.shadowBlur = 0;
            const fillGradient = ctx.createLinearGradient(0, canvasH, 0, 0);
            fillGradient.addColorStop(0, 'rgba(34, 197, 94, 0.12)');
            fillGradient.addColorStop(0.5, 'rgba(249, 115, 22, 0.12)');
            fillGradient.addColorStop(1, 'rgba(239, 68, 68, 0.12)');
            ctx.fillStyle = fillGradient;
            ctx.fill();
        }

        let bufferTimer = null;

        function rxToggle() {
            if (!isPlaying) {
                setStatus('Conectando...');
                setIcon('loading');

                if (audio.src !== STREAM_URL) {
                    audio.removeAttribute('crossorigin');
                    audio.src = STREAM_URL;
                }

                const playPromise = audio.play();

                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        isPlaying = true;
                        setIcon('playing');
                        document.getElementById('livePill').classList.add('active');
                        document.getElementById('artPulse').style.animationPlayState = 'running';
                        document.getElementById('rxCoverImg').style.animationPlayState = 'running';
                        if (document.getElementById('artFallback')) document.getElementById('artFallback').style.animationPlayState = 'running';
                        setStatus('', 'playing');
                        if (animId) cancelAnimationFrame(animId);
                        startAnalyser();
                    }).catch(error => {
                        console.error("Error de reproducción:", error);
                        setStatus('Presiona PLAY para escuchar.', 'playing');
                        isPlaying = false;
                        setIcon('paused');
                        document.getElementById('livePill').classList.remove('active');
                    });
                }
            } else {
                audio.pause();
                isPlaying = false;
                setIcon('paused');
                document.getElementById('livePill').classList.remove('active');
                document.getElementById('artPulse').style.animationPlayState = 'paused';
                document.getElementById('rxCoverImg').style.animationPlayState = 'paused';
                if (document.getElementById('artFallback')) document.getElementById('artFallback').style.animationPlayState = 'paused';
                setStatus('Pausado');
                if (animId) cancelAnimationFrame(animId);
                idleAnim();
            }
        }

        audio.addEventListener('error', () => {
            if (isPlaying) {
                console.log("Error de audio detectado, reconectando...");
                audio.removeAttribute('crossorigin');
                audio.src = STREAM_URL;
                audio.play().catch(() => {
                    isPlaying = false;
                    setIcon(false);
                    document.getElementById('livePill').classList.remove('active');
                    setStatus('Error de conexión. Reintenta.', 'error');
                    if (animId) cancelAnimationFrame(animId);
                    idleAnim();
                });
            } else {
                isPlaying = false;
                setIcon(false);
                document.getElementById('livePill').classList.remove('active');
                setStatus('Error de conexión. Reintenta.', 'error');
                if (animId) cancelAnimationFrame(animId);
                idleAnim();
            }
        });

        audio.addEventListener('waiting', () => {
            if (isPlaying) {
                clearTimeout(bufferTimer);
                bufferTimer = setTimeout(() => {
                    if (isPlaying && audio.paused) setStatus('Buffering...', 'playing');
                }, 600);
            }
        });

        audio.addEventListener('playing', () => {
            clearTimeout(bufferTimer);
            if (isPlaying) {
                setStatus('', 'playing');
                setIcon('playing');
            }
        });

        audio.addEventListener('waiting', () => {
            if (isPlaying) setStatus('Buffering...', 'playing');
        });

        // Sincronización con controles nativos del OS y llamadas telefónicas
        audio.addEventListener('pause', () => {
            if (isPlaying) {
                lastPauseTime = Date.now();
                systemPauseAutoResume = true;
                isPlaying = false;
                setIcon('paused');
                document.getElementById('livePill').classList.remove('active');
                document.getElementById('artPulse').style.animationPlayState = 'paused';
                document.getElementById('rxCoverImg').style.animationPlayState = 'paused';
                if (document.getElementById('artFallback')) document.getElementById('artFallback').style.animationPlayState = 'paused';
                setStatus('Pausado por sistema');
                if (animId) cancelAnimationFrame(animId);
                idleAnim();
            } else {
                // Si el usuario pausó manualmente, no auto-reanudamos tras llamadas largas
                systemPauseAutoResume = false;
            }
        });

        audio.addEventListener('play', () => {
            const pauseDuration = (Date.now() - lastPauseTime) / 1000;
            
            // Si la pausa fue muy larga (> 30s) y era una pausa de sistema,
            // refrescamos la fuente para evitar timeouts de streaming.
            if (systemPauseAutoResume && pauseDuration > 30) {
                console.log(`Reconexión automática tras pausa larga: ${pauseDuration.toFixed(1)}s`);
                systemPauseAutoResume = false;
                audio.removeAttribute('crossorigin');
                audio.src = STREAM_URL;
                audio.load();
                audio.play().catch(() => {});
                return;
            }

            // Resetear bandera de auto-reanudación al reproducir
            systemPauseAutoResume = false;

            if (!isPlaying) {
                isPlaying = true;
                setIcon('playing');
                document.getElementById('artPulse').style.animationPlayState = 'running';
                document.getElementById('rxCoverImg').style.animationPlayState = 'running';
                if (document.getElementById('artFallback')) document.getElementById('artFallback').style.animationPlayState = 'running';
                setStatus('<span class="rx-dot"></span>&nbsp;Transmitiendo en vivo', 'playing');
                if (animId) cancelAnimationFrame(animId);
                startAnalyser();
            }
        });

        // Manejo de errores y estancamientos (stalled) para auto-reconexión
        audio.addEventListener('stalled', () => {
            if (isPlaying) {
                console.log("Stream estancado, intentando reconectar...");
                setStatus('Recuperando conexión...', 'playing');
                audio.removeAttribute('crossorigin');
                audio.src = STREAM_URL;
                audio.load();
                audio.play().catch(() => {});
            }
        });

        // Refuerzo cuando el usuario vuelve a la pestaña
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Si el audio debería estar sonando o fue pausado por el sistema, intentamos reanudar
                if ((isPlaying || systemPauseAutoResume) && audio.paused) {
                    audio.play().catch(() => {
                        // Si falla el auto-play (bloqueo navegador), refrescamos fuente
                        audio.removeAttribute('crossorigin');
                        audio.src = STREAM_URL;
                        audio.load();
                        audio.play().catch(() => {});
                    });
                }
            }
        });

        audio.addEventListener('playing', () => {
            if (isPlaying) setStatus('<span class="rx-dot"></span>&nbsp;Transmitiendo en vivo', 'playing');
        });

        const sse = new EventSource('https://api.zeno.fm/mounts/metadata/subscribe/n7fm3s6537zuv');
        const trackTextEl = document.getElementById('trackText');
        const DEFAULT_COVER = 'icon-512.png';
        const coverImg = document.getElementById('rxCoverImg');
        const artFallback = document.getElementById('artFallback');
        const artCache = new Map();
        let currentTrackTitle = '';

        function setCoverImageSrc(url) {
            if (!coverImg) return;
            coverImg.classList.add('fading');
            const ambient = document.getElementById('artAmbient');
            if (ambient) ambient.classList.add('fading');

            const preloader = new Image();
            preloader.onload = () => {
                coverImg.src = url;
                coverImg.style.display = 'block';
                if (artFallback) artFallback.style.display = 'none';
                if (ambient) {
                    ambient.style.backgroundImage = `url('${url}')`;
                    ambient.classList.remove('fading');
                }
                setTimeout(() => coverImg.classList.remove('fading'), 50);
            };
            preloader.onerror = () => {
                coverImg.src = DEFAULT_COVER;
                coverImg.style.display = 'block';
                coverImg.classList.remove('fading');
                if (ambient) {
                    ambient.style.backgroundImage = `url('${DEFAULT_COVER}')`;
                    ambient.classList.remove('fading');
                }
            };
            preloader.src = url;
        }

        function cleanTrackQuery(raw) {
            if (!raw) return '';
            let text = raw.trim();
            if (/^(radio\s*xero|sintonizando|en\s*vivo|al\s*aire)/i.test(text)) return '';
            text = text
                .replace(/\|\s*Radio\s*Xero/gi, '')
                .replace(/-\s*Radio\s*Xero/gi, '')
                .replace(/\[(official|video|audio|lyrics?|hd|4k|hq|remastered?|clip|visualizer).*?\]/gi, '')
                .replace(/\((official|video|audio|lyrics?|hd|4k|hq|remastered?|clip|visualizer|album version|single version|extended).*?\)/gi, '')
                .replace(/\[.*?\]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            return text;
        }

        async function fetchAlbumArt(rawTitle) {
            if (!rawTitle) {
                setCoverImageSrc(DEFAULT_COVER);
                updateMediaSession('Radio Xero', DEFAULT_COVER);
                return;
            }

            const query = cleanTrackQuery(rawTitle);
            if (!query || query.length < 3) {
                setCoverImageSrc(DEFAULT_COVER);
                updateMediaSession(rawTitle, DEFAULT_COVER);
                return;
            }

            if (artCache.has(query)) {
                const cached = artCache.get(query);
                setCoverImageSrc(cached.url);
                updateMediaSession(cached.title || rawTitle, cached.url, cached.artist);
                return;
            }

            try {
                const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`;
                const res = await fetch(itunesUrl);
                if (res.ok) {
                    const data = await res.json();
                    if (data.results && data.results.length > 0 && data.results[0].artworkUrl100) {
                        const hiResUrl = data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
                        const artistName = data.results[0].artistName || '';
                        const songTitle = data.results[0].trackName || rawTitle;

                        const artData = { url: hiResUrl, artist: artistName, title: songTitle };
                        artCache.set(query, artData);
                        setCoverImageSrc(hiResUrl);
                        updateMediaSession(songTitle, hiResUrl, artistName);
                        return;
                    }
                }
            } catch (err) {
                console.warn('Error al buscar portada en iTunes:', err);
            }

            // Fallback por defecto si no se encuentra portada
            artCache.set(query, { url: DEFAULT_COVER, title: rawTitle });
            setCoverImageSrc(DEFAULT_COVER);
            updateMediaSession(rawTitle, DEFAULT_COVER);
        }

        function updateMediaSession(title, artworkUrl, artist) {
            if ('mediaSession' in navigator) {
                let artistName = artist || 'Radio Xero';
                let trackTitle = title || 'Radio Xero - En Vivo';

                if (!artist && title && title.includes(' - ')) {
                    const parts = title.split(' - ');
                    artistName = parts[0].trim();
                    trackTitle = parts.slice(1).join(' - ').trim();
                }

                navigator.mediaSession.metadata = new MediaMetadata({
                    title: trackTitle,
                    artist: artistName,
                    album: 'Radio Xero Digital HD',
                    artwork: [
                        { src: artworkUrl || DEFAULT_COVER, sizes: '512x512', type: 'image/png' },
                        { src: artworkUrl || DEFAULT_COVER, sizes: '256x256', type: 'image/png' },
                        { src: artworkUrl || DEFAULT_COVER, sizes: '128x128', type: 'image/png' }
                    ]
                });

                try {
                    navigator.mediaSession.setActionHandler('play', () => { if (!isPlaying) rxToggle(); });
                    navigator.mediaSession.setActionHandler('pause', () => { if (isPlaying) rxToggle(); });
                    navigator.mediaSession.setActionHandler('stop', () => { if (isPlaying) rxToggle(); });
                } catch(e) {}
            }
        }

        function checkTrackOverflow() {
            const scroller = document.querySelector('.rx-track-scroller');
            const content = document.querySelector('.rx-track-content');
            const fullText = trackTextEl.textContent;
            if (!scroller || !content) return;

            // Reset inicial para medir correctamente
            scroller.classList.remove('is-scrolling');
            content.innerHTML = `<span>${fullText}</span>`;

            setTimeout(() => {
                // Si el texto es más ancho que el contenedor
                if (content.offsetWidth > scroller.offsetWidth) {
                    // Creamos el efecto rueda clonando el texto
                    const separator = "&nbsp;".repeat(12); // Espacio entre copias
                    content.innerHTML = `<span>${fullText}${separator}</span><span>${fullText}${separator}</span>`;
                    scroller.classList.add('is-scrolling');
                }
            }, 50);
        }

        sse.onmessage = function (e) {
            try {
                const data = JSON.parse(e.data);
                const newTitle = data.streamTitle || 'Radio Xero | Al Aire';
                if (newTitle !== currentTrackTitle) {
                    currentTrackTitle = newTitle;
                    trackTextEl.textContent = newTitle;
                    checkTrackOverflow();
                    fetchAlbumArt(newTitle);
                }
            } catch (err) {
                console.error('Error parsing metadata', err);
            }
        };

        // Recalcular si se cambia el tamaño de la ventana (responsive)
        window.addEventListener('resize', checkTrackOverflow);

        let deferredPrompt;
        const installButton = document.getElementById('installButton');

        // --- REFUERZO DE VISIBILIDAD PARA ANDROID / EDGE ---
        function forceInstallButton() {
            if (!isStandalone) {
                installButton.style.display = 'flex';
                // Aseguramos que sea visible incluso si algo intentó ocultarlo
                installButton.setAttribute('style', 'display: flex !important;');
            }
        }

        // Ejecutamos el refuerzo en varios puntos de carga
        forceInstallButton();
        window.addEventListener('load', forceInstallButton);
        setTimeout(forceInstallButton, 1500); // Refuerzo final tras 1.5s

        window.addEventListener('beforeinstallprompt', (e) => {
            if (isIosDevice || isStandalone) return;
            e.preventDefault();
            deferredPrompt = e;
            installButton.style.display = 'flex';
        });

        installButton.addEventListener('click', async () => {
            if (isIosDevice) {
                document.getElementById('iosHint').style.display = 'flex';
                return;
            }
            if (deferredPrompt) {
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
            } else if (!isStandalone) {
                // Mostrar modal elegante si no hay prompt (ej. ya instalada)
                document.getElementById('installedModal').style.display = 'flex';
            }
        });

        if (isStandalone) {
            installButton.style.display = 'none';
        }

        if (isIosDevice) {
            const volContainer = document.querySelector('.rx-vol-container');
            if (volContainer) volContainer.style.display = 'none';
            const volDiv = document.querySelector('.rx-vol');
            if (volDiv) {
                volDiv.style.background = 'transparent';
                volDiv.style.border = 'none';
                volDiv.style.boxShadow = 'none';
                volDiv.style.padding = '0';
                volDiv.style.justifyContent = 'flex-end';
            }
        }

        function rxCopyLink(e, btn) {
            e.preventDefault();
            const url = 'https://jf2021070309.github.io/radio-xero/';
            navigator.clipboard.writeText(url).then(() => {
                const icon = btn.querySelector('i');
                const oldClass = icon.className;

                // Efecto visual
                btn.classList.add('success');
                icon.className = 'fas fa-check';

                // Toast flotante
                const toast = document.createElement('div');
                toast.className = 'copy-toast';
                toast.innerText = '¡Copiado!';
                btn.appendChild(toast);

                setTimeout(() => {
                    btn.classList.remove('success');
                    icon.className = oldClass;
                    toast.remove();
                }, 1500);
            });
        }

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js')
                    .then(() => console.log('SW OK'))
                    .catch(e => console.log('SW Error', e));
            });
        }

        function updateShareLinks() {
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            let msgBody;

            if (isMobile) {
                // Versión con EMOJIS para celulares (donde funcionan bien)
                msgBody =
                    "\u{1F4FB} *Radio Xero* \u{1F525}\n" +
                    "\u{1F534} *EN VIVO*\n\n" +
                    "\u{1F3A7} Música sin parar 24/7\n" +
                    "\u26A1 Dale play y súbele al volumen\n\n" +
                    "\u{1F449} ";
            } else {
                // Versión LIMPIA para PC (sin emojis para evitar errores visuales)
                msgBody =
                    "*Radio Xero*\n" +
                    "*EN VIVO*\n\n" +
                    "Musica sin parar 24/7\n" +
                    "Dale play y subele al volumen\n\n" +
                    "Escuchanos aqui: ";
            }

            const shareUrl = "https://jf2021070309.github.io/radio-xero/";
            const fullMsg = encodeURIComponent(msgBody + shareUrl);

            // Botón de WhatsApp
            document.getElementById('rx-wa-btn').href = `https://wa.me/?text=${fullMsg}`;

            // Botón de Facebook
            document.getElementById('rx-fb-btn').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;

            // Botón de Twitter/X
            const twText = encodeURIComponent(msgBody);
            document.getElementById('rx-tw-btn').href = `https://twitter.com/intent/tweet?text=${twText}&url=${encodeURIComponent(shareUrl)}`;
        }

        // --- THEME MANAGEMENT ---
        function rxToggleTheme() {
            const body = document.body;
            const themeToggle = document.getElementById('themeToggle');
            const icon = themeToggle.querySelector('i');
            const metaTheme = document.querySelector('meta[name="theme-color"]');

            body.classList.toggle('dark-theme');
            const isDark = body.classList.contains('dark-theme');

            localStorage.setItem('rx-theme', isDark ? 'dark' : 'light');

            if (isDark) {
                icon.className = 'fas fa-moon';
                metaTheme.setAttribute('content', '#020617');
            } else {
                icon.className = 'fas fa-sun';
                metaTheme.setAttribute('content', '#f1f5f9');
            }
        }

        function initTheme() {
            const savedTheme = localStorage.getItem('rx-theme');
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-theme');
                document.getElementById('themeToggle').querySelector('i').className = 'fas fa-moon';
                document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0a0d14');
            } else {
                document.body.classList.remove('dark-theme');
                document.getElementById('themeToggle').querySelector('i').className = 'fas fa-sun';
                document.querySelector('meta[name="theme-color"]').setAttribute('content', '#ffffff');
            }
        }

        // ─── INTRO SPLASH & AUTOPLAY HANDLER ──────────────────────────────
        let introStarted = false;
        function rxStartFromIntro() {
            if (introStarted) return;
            introStarted = true;

            const introOverlay = document.getElementById('rxIntroOverlay');
            const introBtn = document.getElementById('rxIntroPlayBtn');

            if (introBtn) {
                introBtn.classList.add('pressed');
            }

            // Iniciar reproducción instantáneamente gracias al gesto del usuario
            if (!isPlaying) {
                rxToggle();
            }

            // Transición inmediata, fluida y sin bloqueos de renderizado
            if (introOverlay) {
                introOverlay.classList.add('rx-intro-hiding');
                setTimeout(() => {
                    introOverlay.style.display = 'none';
                }, 480);
            }
        }

        // Atajos de teclado para accesibilidad en la pantalla de bienvenida
        window.addEventListener('keydown', (e) => {
            if (!introStarted && (e.code === 'Space' || e.code === 'Enter')) {
                const introOverlay = document.getElementById('rxIntroOverlay');
                if (introOverlay && introOverlay.style.display !== 'none') {
                    e.preventDefault();
                    rxStartFromIntro();
                }
            }
        });

        window.addEventListener('load', () => {
            initTheme();
            rxSetVol(100);
            updateShareLinks();
        });
        // Inicialización final
        setVizMode(currentVizMode);
    