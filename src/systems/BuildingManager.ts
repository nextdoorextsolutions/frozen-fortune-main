/**
 * BuildingManager — extracted from main.ts Game class.
 * Handles building placement, construction timers, building HP bars,
 * wall/gate rotation, and building destruction.
 */
import Phaser from 'phaser';
import { S } from '../state';
import { SFX } from '../sfx';
import { PSC, STEAM_PSC } from '../constants';
import type { Bld, Wolf } from '../types';
import type { CraftingManager } from './CraftingManager';

/**
 * Minimal interface describing the parts of the Game scene that
 * BuildingManager needs.
 */
export interface BuildingScene extends Phaser.Scene {
    /* player */
    p: Phaser.GameObjects.Sprite;
    pb: Phaser.Physics.Arcade.Body;
    bp: { logs: number; rubble: number; snow: number; berries: number; meat: number; pelts: number; iron: number; arrows: number; torches: number };
    bpTotal(): number;
    totalLogs(): number;
    totalRubble(): number;
    spendLogs(n: number): void;
    spendRubble(n: number): void;
    psc(): number;

    /* buildings & references */
    blds: Bld[];
    furnace: Bld | null;
    mill: Bld | null;
    qry: Bld | null;
    anvil: Bld | null;
    researchTable: Bld | null;
    furnaceLvl: number;

    /* wolves for colliders */
    wolves: Wolf[];

    /* UI & feedback */
    lit<T extends Phaser.GameObjects.Sprite>(s: T): T;
    msg(t: string): void;
    pileVis(): void;
    isInside: Bld | null;
    exitShelter(): void;

    /* action pose */
    poseTimer: number;

    /* keyboard state for detecting movement during build */
    k: Record<string, Phaser.Input.Keyboard.Key>;
    cursors: Phaser.Types.Input.Keyboard.CursorKeys;

    /* crafting (for nearBase check in placeBld) */
    crafting: CraftingManager;
}

/* ─── build-in-progress state ─── */
export interface BuildState {
    kind: string; tex: string; sc: number;
    wx: number; wy: number; dur: number; elapsed: number;
    bar: Phaser.GameObjects.Graphics; bgBar: Phaser.GameObjects.Graphics;
    lbl: Phaser.GameObjects.Text; paused: boolean;
    ghost: Phaser.GameObjects.Sprite | null;
}

export class BuildingManager {
    private scene: BuildingScene;
    private sfx: SFX;

    /* state that was previously on the Game class */
    bMode: string | null = null;
    bPrev: Phaser.GameObjects.Sprite | null = null;
    buildDir: 'East' | 'West' = 'East';
    building: BuildState | null = null;

    constructor(scene: BuildingScene, sfx: SFX) {
        this.scene = scene;
        this.sfx = sfx;
    }

    /* ─── core helpers ─── */

    addBld(x: number, y: number, tex: string, kind: string, hp: number, max: number, sc = 0.16): Bld {
        const s = this.scene;
        const sprite = s.lit(s.add.sprite(x, y, tex).setScale(sc));
        const bar = s.add.graphics();
        const lbl = s.add.text(x, y - sprite.displayHeight / 2 - 20, '', { fontSize: '12px', color: '#fff', fontFamily: 'Arial', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
        const b: Bld = { sprite, kind, hp, maxHp: max, bar, lbl };
        s.blds.push(b);
        this.drawBar(b);
        return b;
    }

    drawBar(b: Bld) {
        const s = this.scene;
        b.bar.clear();
        const names: Record<string, string> = { furnace: '🔥 Furnace', mill: '🪵 Mill', quarry: '⛏️ Quarry', igloo: '🏠 Igloo', woodHouse: '🏡 Wood House', stoneHouse: '🏰 Stone House', woodWall: '🧱 Wood Wall', woodGate: '🚪 Wood Gate', stoneWall: '🧱 Stone Wall', stoneGate: '🚪 Stone Gate' };
        if (b.kind === 'furnace') { b.lbl.setPosition(b.sprite.x, b.sprite.y - b.sprite.displayHeight / 2 - 14); b.lbl.setText(`🔥 Furnace Lvl ${s.furnaceLvl}`); return; }
        const w = 50, h = 6, bx = b.sprite.x - w / 2, by = b.sprite.y - b.sprite.displayHeight / 2 - 12;
        b.bar.fillStyle(0x333333, 0.8); b.bar.fillRect(bx, by, w, h);
        const pct = b.hp / b.maxHp;
        b.bar.fillStyle(pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xcccc44 : 0xcc4444); b.bar.fillRect(bx, by, w * pct, h);
        b.lbl.setPosition(b.sprite.x, by - 12); b.lbl.setText(`${names[b.kind] || b.kind} [${b.hp}/${b.maxHp}]`);
    }

    getBldHp(kind: string): number {
        const hps: Record<string, number> = { mill: 15, quarry: 15, anvil: 20, researchTable: 15, igloo: 3, woodHouse: 9, stoneHouse: 24, woodWall: 6, woodGate: 8, stoneWall: 12, stoneGate: 14 };
        return hps[kind] ?? 10;
    }

    destroyBld(b: Bld) {
        const s = this.scene;
        const wasInside = b === s.isInside; if (wasInside) s.exitShelter();
        s.tweens.add({ targets: b.sprite, alpha: 0, scaleX: 0, scaleY: 0, duration: 400, onComplete: () => { b.sprite.destroy(); b.bar.destroy(); b.lbl.destroy(); } });
        if (b === s.mill) { s.mill = null; S.basePlanks = 0; S.millInputLogs = 0; s.pileVis(); }
        if (b === s.qry) { s.qry = null; S.baseBricks = 0; S.qryInputRubble = 0; s.pileVis(); }
        if (b === s.anvil) { s.anvil = null; }
        if (b === s.researchTable) { s.researchTable = null; }
        s.blds = s.blds.filter(x => x !== b);
        s.msg(wasInside ? 'Your shelter was destroyed! ❄️' : `${b.kind} destroyed!`);
    }

    /* ─── build mode (ghost preview) ─── */

    enterBld(kind: string, tex: string, sc: number) {
        const s = this.scene;
        this.cancelBld();
        this.bMode = kind;
        const isWallGate = kind.includes('Wall') || kind.includes('Gate');
        const actualTex = isWallGate ? tex + this.buildDir : tex;
        this.bPrev = s.lit(s.add.sprite(0, 0, actualTex).setScale(sc).setAlpha(0.5)).setDepth(8000);
        if (isWallGate) this.bPrev.setOrigin(0.5, 1);
        const rotBtn = document.getElementById('touch-rotate');
        const cancelBtn = document.getElementById('touch-cancel');
        if (rotBtn) rotBtn.style.display = isWallGate ? 'flex' : 'none';
        if (cancelBtn) cancelBtn.style.display = 'flex';
        s.msg(isWallGate ? 'Click to place. R=rotate, ESC=cancel.' : 'Click to place. ESC to cancel.');
    }

    cancelBld() {
        if (this.bPrev) this.bPrev.destroy();
        this.bPrev = null;
        this.bMode = null;
        const rotBtn = document.getElementById('touch-rotate');
        const cancelBtn = document.getElementById('touch-cancel');
        if (rotBtn) rotBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    rotateBuildDir() {
        if (!this.bMode) return;
        this.buildDir = this.buildDir === 'East' ? 'West' : 'East';
        if (this.bPrev) this.bPrev.setTexture(this.bMode + this.buildDir);
        this.scene.msg(`🔄 Direction: ${this.buildDir}`);
    }

    /* ─── placement ─── */

    placeBld(wx: number, wy: number) {
        const s = this.scene;
        const m = this.bMode!;
        this.cancelBld();
        const timers: Record<string, number> = { mill: 5_000, quarry: 5_000, anvil: 5_000, researchTable: 5_000, igloo: 5_000, woodHouse: 5_000, stoneHouse: 5_000 };
        switch (m) {
            case 'mill':
                if (s.mill) { s.msg('Already built!'); return; } if (s.totalLogs() < 15) { s.msg('Need 15 Logs'); return; }
                s.spendLogs(15); this.startBuild('mill', 'lumberMill', 0.16, wx, wy, timers.mill); break;
            case 'quarry':
                if (s.qry) { s.msg('Already built!'); return; } if (s.totalRubble() < 15) { s.msg('Need 15 Rubble'); return; }
                s.spendRubble(15); this.startBuild('quarry', 'stoneQuarry', 0.16, wx, wy, timers.quarry); break;
            case 'anvil':
                if (s.anvil) { s.msg('Already built!'); return; } if (S.baseBricks < 15 || s.bp.iron < 10) { s.msg('Need 15 Bricks + 10 Iron (BP)'); return; }
                S.baseBricks -= 15; s.bp.iron -= 10; this.startBuild('anvil', 'anvilTex', 0.16, wx, wy, timers.anvil); s.pileVis(); break;
            case 'researchTable':
                if (s.researchTable) { s.msg('Already built!'); return; } if (s.totalLogs() < 15 || S.baseBricks < 10) { s.msg('Need 15 Logs + 10 Bricks'); return; }
                s.spendLogs(15); S.baseBricks -= 10; this.startBuild('researchTable', 'texResearchTable', 0.16, wx, wy, timers.researchTable); s.pileVis(); break;
            case 'igloo':
                if (s.bp.snow < 10 || s.totalLogs() < 5) { s.msg('Need 10 Snow + 5 Logs'); return; }
                s.bp.snow -= 10; s.spendLogs(5); this.startBuild('igloo', 'igloo', 0.16, wx, wy, timers.igloo); break;
            case 'woodHouse':
                if (!s.crafting.nearBase()) { s.msg('Must be near base!'); return; }
                if (S.basePlanks < 40) { s.msg('Need 40 Planks (Mill)'); return; }
                S.basePlanks -= 40; this.startBuild('woodHouse', 'woodHouse', 0.16, wx, wy, timers.woodHouse); s.pileVis(); break;
            case 'stoneHouse':
                if (!s.crafting.nearBase()) { s.msg('Must be near base!'); return; }
                if (S.baseBricks < 60 || S.basePlanks < 20) { s.msg('Need 60 Bricks + 20 Planks'); return; }
                S.baseBricks -= 60; S.basePlanks -= 20; this.startBuild('stoneHouse', 'stoneHouse', 0.16, wx, wy, timers.stoneHouse); s.pileVis(); break;
            case 'woodWall': case 'woodGate': case 'stoneWall': case 'stoneGate': {
                const costs: Record<string, { res: 'planks' | 'bricks'; amt: number }> = {
                    woodWall: { res: 'planks', amt: 2 }, woodGate: { res: 'planks', amt: 5 },
                    stoneWall: { res: 'bricks', amt: 2 }, stoneGate: { res: 'bricks', amt: 5 }
                };
                const cost = costs[m];
                if (cost.res === 'planks') {
                    if (S.basePlanks < cost.amt) { s.msg(`Need ${cost.amt} Planks (Mill)`); return; }
                    S.basePlanks -= cost.amt;
                } else {
                    if (S.baseBricks < cost.amt) { s.msg(`Need ${cost.amt} Bricks (Quarry)`); return; }
                    S.baseBricks -= cost.amt;
                }
                const tex = m + this.buildDir;
                const bld = this.addBld(wx, wy, tex, m, this.getBldHp(m), this.getBldHp(m), 0.08);
                bld.sprite.setOrigin(0.5, 1);
                s.physics.add.existing(bld.sprite, true);
                const body = bld.sprite.body as Phaser.Physics.Arcade.StaticBody;
                body.setSize(bld.sprite.displayWidth * 0.8, bld.sprite.displayHeight * 0.3);
                body.setOffset(bld.sprite.displayWidth * 0.1, bld.sprite.displayHeight * 0.6);
                for (const w of s.wolves) s.physics.add.collider(w.sprite, bld.sprite);
                s.physics.add.collider(s.p, bld.sprite);
                this.sfx.build(); s.msg(`${m.includes('Wall') ? 'Wall' : 'Gate'} placed!`); s.pileVis(); break;
            }
        }
    }

    /* ─── build timer ─── */

    startBuild(kind: string, tex: string, sc: number, wx: number, wy: number, dur: number) {
        const s = this.scene;
        s.p.setPosition(wx, wy + 40);
        s.pb.setVelocity(0, 0);
        const snowKinds = ['igloo'];
        s.p.setTexture(snowKinds.includes(kind) ? (S.currentOutfit === 'steam' ? 'steamSnow' : 'playerSnow') : (S.currentOutfit === 'steam' ? 'steamBuilding2' : 'playerBuilding2'));
        const ghost = s.add.sprite(wx, wy, tex).setScale(sc).setAlpha(0.35).setDepth(1).setTint(0x88ccff);
        const barW = 60, barH = 8;
        const bgBar = s.add.graphics().setDepth(9100);
        bgBar.fillStyle(0x222222, 0.8); bgBar.fillRect(wx - barW / 2, wy - 30, barW, barH);
        const bar = s.add.graphics().setDepth(9101);
        const lbl = s.add.text(wx, wy - 42, `Building...`, { fontSize: '11px', color: '#ffe', fontFamily: 'Arial', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(9102);
        this.building = { kind, tex, sc, wx, wy, dur, elapsed: 0, bar, bgBar, lbl, paused: false, ghost };
        s.msg(`🔨 Building ${kind}... (${Math.ceil(dur / 1000)}s)`);
    }

    pauseBuild() {
        const s = this.scene;
        if (!this.building || this.building.paused) return;
        this.building.paused = true;
        const remain = Math.ceil((this.building.dur - this.building.elapsed) / 1000);
        this.building.lbl.setText(`⏸ Paused ${remain}s left`);
        this.building.lbl.setColor('#ffcc44');
        s.p.setTexture(S.currentOutfit === 'steam' ? 'steamIdle' : 'playerIdle');
        s.p.setScale(s.psc());
        s.msg(`🔨 Build paused — return to site to resume`);
    }

    resumeBuild() {
        const s = this.scene;
        if (!this.building || !this.building.paused) return;
        const b = this.building;
        b.paused = false;
        b.lbl.setColor('#ffe');
        s.p.setPosition(b.wx, b.wy + 40);
        s.pb.setVelocity(0, 0);
        const snowKinds = ['igloo'];
        s.p.setTexture(snowKinds.includes(b.kind) ? (S.currentOutfit === 'steam' ? 'steamSnow' : 'playerSnow') : (S.currentOutfit === 'steam' ? 'steamBuilding2' : 'playerBuilding2'));
        const remain = Math.ceil((b.dur - b.elapsed) / 1000);
        s.msg(`🔨 Resuming build... (${remain}s left)`);
    }

    tickBuilding(dt: number) {
        const s = this.scene;
        const b = this.building!;
        b.elapsed += dt;
        s.pb.setVelocity(0, 0);
        if (s.k.A.isDown || s.k.D.isDown || s.k.W.isDown || s.k.S.isDown || s.cursors.left.isDown || s.cursors.right.isDown || s.cursors.up.isDown || s.cursors.down.isDown) {
            this.pauseBuild(); return;
        }
        const snowKinds = ['igloo'];
        const isSnow = snowKinds.includes(b.kind);
        const frame = Math.floor(b.elapsed / 400) % 2;
        s.p.setTexture(isSnow ? (S.currentOutfit === 'steam' ? 'steamSnow' : 'playerSnow') : (frame === 0 ? (S.currentOutfit === 'steam' ? 'steamBuilding' : 'playerBuilding') : (S.currentOutfit === 'steam' ? 'steamBuilding2' : 'playerBuilding2')));
        s.p.setScale((!isSnow && frame === 0 && S.currentOutfit === 'steam') ? STEAM_PSC : PSC);
        const pct = Math.min(1, b.elapsed / b.dur);
        const barW = 60, barH = 8;
        b.bar.clear();
        b.bar.fillStyle(0x44cc44); b.bar.fillRect(b.wx - barW / 2, b.wy - 30, barW * pct, barH);
        const remain = Math.ceil((b.dur - b.elapsed) / 1000);
        b.lbl.setText(`Building... ${remain}s`);
        if (b.elapsed >= b.dur) this.finishBuild();
    }

    finishBuild() {
        const s = this.scene;
        const b = this.building!;
        b.bar.destroy(); b.bgBar.destroy(); b.lbl.destroy();
        if (b.ghost) b.ghost.destroy();
        const bld = this.addBld(b.wx, b.wy, b.tex, b.kind, this.getBldHp(b.kind), this.getBldHp(b.kind), b.sc);
        if (b.kind === 'mill') s.mill = bld;
        if (b.kind === 'quarry') s.qry = bld;
        if (b.kind === 'anvil') s.anvil = bld;
        if (b.kind === 'researchTable') s.researchTable = bld;
        const isWG = ['woodWall', 'woodGate', 'stoneWall', 'stoneGate'].includes(b.kind);
        if (isWG) {
            bld.sprite.setOrigin(0.5, 1);
            s.physics.add.existing(bld.sprite, true);
            const body = bld.sprite.body as Phaser.Physics.Arcade.StaticBody;
            body.setSize(bld.sprite.displayWidth * 0.8, bld.sprite.displayHeight * 0.3);
            body.setOffset(bld.sprite.displayWidth * 0.1, bld.sprite.displayHeight * 0.6);
            for (const w of s.wolves) s.physics.add.collider(w.sprite, bld.sprite);
            s.physics.add.collider(s.p, bld.sprite);
        }
        this.sfx.build();
        s.p.setTexture(S.currentOutfit === 'steam' ? 'steamIdle' : 'playerIdle');
        s.p.setScale(s.psc());
        s.poseTimer = 0;
        this.building = null;
        s.pileVis();
        const names: Record<string, string> = { mill: 'Lumber Mill', quarry: 'Quarry', anvil: 'Anvil', researchTable: 'Research Table', igloo: 'Igloo', woodHouse: 'Wood House', stoneHouse: 'Stone House', woodWall: 'Wood Wall', woodGate: 'Wood Gate', stoneWall: 'Stone Wall', stoneGate: 'Stone Gate' };
        s.msg(`✅ ${names[b.kind] || b.kind} built!`);
    }
}
