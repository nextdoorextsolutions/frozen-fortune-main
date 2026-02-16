/** Procedural SFX — no audio files needed */
export class SFX {
    private ctx: AudioContext | null = null;
    private master!: GainNode;
    private windSrc: AudioBufferSourceNode | null = null;
    private windGain: GainNode | null = null;

    init() {
        if (this.ctx) return;
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.25;
        this.master.connect(this.ctx.destination);
    }

    private ensure() { this.init(); if (this.ctx!.state === 'suspended') this.ctx!.resume(); }

    private noise(dur: number, freq: number, q: number, vol = 0.4) {
        this.ensure(); const c = this.ctx!;
        const len = c.sampleRate * dur;
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource(); src.buffer = buf;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
        const g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
        src.connect(bp).connect(g).connect(this.master); src.start();
    }

    private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.25) {
        this.ensure(); const c = this.ctx!;
        const osc = c.createOscillator(); osc.type = type; osc.frequency.value = freq;
        const g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
        osc.connect(g).connect(this.master); osc.start(); osc.stop(c.currentTime + dur);
    }

    /** Snow crunch footstep */
    step() { this.noise(0.06, 3500 + Math.random() * 2000, 1.2, 0.15); }

    /** Pickaxe / chop hit */
    hit() { this.noise(0.1, 1200, 2.5, 0.35); this.tone(180 + Math.random() * 40, 0.07, 'square', 0.12); }

    /** Eat berry */
    eat() { this.tone(500, 0.07, 'sine', 0.2); setTimeout(() => this.tone(700, 0.05, 'sine', 0.15), 70); }

    /** Take damage */
    hurt() { this.tone(100, 0.25, 'sawtooth', 0.25); this.noise(0.12, 400, 1, 0.25); }

    /** Place building */
    build() { for (let i = 0; i < 3; i++) setTimeout(() => this.tone(350 + i * 80, 0.05, 'square', 0.12), i * 55); }

    /** Wolf snarl */
    growl() {
        this.ensure(); const c = this.ctx!;
        const osc = c.createOscillator(); osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(55 + Math.random() * 25, c.currentTime);
        osc.frequency.linearRampToValueAtTime(40, c.currentTime + 0.5);
        const g = c.createGain(); g.gain.setValueAtTime(0.18, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
        // tremolo
        const lfo = c.createOscillator(); lfo.frequency.value = 8; const lg = c.createGain(); lg.gain.value = 0.3;
        lfo.connect(lg).connect(g.gain);
        osc.connect(g).connect(this.master); osc.start(); lfo.start();
        osc.stop(c.currentTime + 0.5); lfo.stop(c.currentTime + 0.5);
    }

    /** Blizzard howling wind — loops until stopWind() */
    startWind() {
        this.ensure(); if (this.windSrc) return;
        const c = this.ctx!;
        const len = c.sampleRate * 3;
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.windSrc = c.createBufferSource(); this.windSrc.buffer = buf; this.windSrc.loop = true;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.7;
        // Modulate filter for howling effect
        const lfo = c.createOscillator(); lfo.frequency.value = 0.3;
        const lg = c.createGain(); lg.gain.value = 300;
        lfo.connect(lg).connect(lp.frequency); lfo.start();
        this.windGain = c.createGain(); this.windGain.gain.setValueAtTime(0, c.currentTime);
        this.windGain.gain.linearRampToValueAtTime(0.18, c.currentTime + 2);
        this.windSrc.connect(lp).connect(this.windGain).connect(this.master);
        this.windSrc.start();
    }

    stopWind() {
        if (!this.windGain || !this.windSrc) return;
        const c = this.ctx!;
        this.windGain.gain.linearRampToValueAtTime(0, c.currentTime + 2);
        const src = this.windSrc;
        setTimeout(() => { try { src.stop(); } catch { } }, 2500);
        this.windSrc = null; this.windGain = null;
    }
}
