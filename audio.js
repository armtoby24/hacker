// Web Audio API engine for procedural sound generation
const AudioEngine = {
    ctx: null,
    ambientGain: null,
    isInitialized: false,

    init() {
        if (this.isInitialized) return;
        
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        
        this.startAmbient();
        this.isInitialized = true;
    },
    
    startAmbient() {
        // Low frequency server hum
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(55, this.ctx.currentTime); // Low A
        
        // Detuned sine mapping for thickness
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(56, this.ctx.currentTime);
        
        // Subtle rumble with low pass filtered noise could be added, but dual osc is cheap and effective
        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.setValueAtTime(0.06, this.ctx.currentTime);
        
        osc1.connect(this.ambientGain);
        osc2.connect(this.ambientGain);
        this.ambientGain.connect(this.ctx.destination);
        
        osc1.start();
        osc2.start();
    },
    
    playTyping() {
        if (!this.isInitialized) return;
        
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        
        osc.type = 'square';
        // Randomize pitch slightly to simulate key clicks
        const freq = 400 + Math.random() * 400;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        // Very sharp attack and decay
        gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.015, this.ctx.currentTime + 0.005);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
        
        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.04);
    },
    
    playError() {
        if (!this.isInitialized) return;
        
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
        
        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    },
    
    playSuccess() {
        if (!this.isInitialized) return;
        
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc.frequency.setValueAtTime(880, this.ctx.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
        
        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }
};

window.AudioEngine = AudioEngine;
