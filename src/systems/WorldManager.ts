import Phaser from 'phaser';
import { SFX } from '../sfx';
import { S } from '../state';
import {
    MW, MH, PSC,
    TREE_CAP, STONE_CAP, IRON_CAP,
    BUSH_REGROW, TREE_REGROW, STONE_REGROW,
    DAY_LEN, FULL_DAY, WOLF_MAX_MAP,
    STORM_LEN, STORM_TICK,
} from '../constants';
import type { Res, Bld, Bush, Wolf, Deer, Worker } from '../types';
import type { BuildingManager } from './BuildingManager';
import type { CombatManager } from './CombatManager';

const sfx = new SFX();

/* ── scene facade ── */
export interface WorldScene extends Phaser.Scene {
    p: Phaser.GameObjects.Sprite;
    pb: Phaser.Physics.Arcade.Body;
    bp: { logs: number; rubble: number; snow: number; berries: number; arrows: number; pelts: number; meat: number; iron: number; torches: number };
    blds: Bld[];
    furnace: Bld | null;
    mill: Bld | null;
    qry: Bld | null;
    wolves: Wolf[];
    deers: Deer[];
    isNight: boolean;
    sOn: boolean;
    furnaceLvl: number;
    combat: CombatManager;
    buildings: BuildingManager;
    isInside: Bld | null;
    // scene-owned UI elements the manager needs to read/write
    dayLabel: Phaser.GameObjects.Text;
    sOvr: Phaser.GameObjects.Rectangle;
    sLbl: Phaser.GameObjects.Text;
    fLight: Phaser.GameObjects.Light;
    // methods
    lit<T extends Phaser.GameObjects.GameObject>(s: T): T;
    bpTotal(): number;
    setPose(tex: string, dur: number): void;
    emitParticles(x: number, y: number, tex: string, count?: number): void;
    msg(t: string): void;
    psc(): number;
    gameOver(cause: string): void;
}

export class WorldManager {
    private s: WorldScene;

    /* state owned by this manager */
    res: Res[] = [];
    bushes: Bush[] = [];
    workers: Worker[] = [];
    dayClock = 0;
    ambTarget = 1;
    sElap = 0;
    private sDmg = 0;

    constructor(scene: WorldScene) {
        this.s = scene;
    }

    /* ─── resources ─── */
    scatter() {
        const scene = this.s;
        const rng = (a: number, b: number) => Phaser.Math.Between(a, b);
        const cx = MW / 2, cy = MH / 2;
        const far = (x: number, y: number) => Phaser.Math.Distance.Between(x, y, cx, cy) > 450;
        const placed: { x: number; y: number }[] = [];
        const MIN_DIST = 80;
        const spaced = (x: number, y: number) => {
            for (const p of placed) {
                if (Phaser.Math.Distance.Between(x, y, p.x, p.y) < MIN_DIST) return false;
            }
            return true;
        };
        const mk = (tex: string, kind: 'logs' | 'rubble' | 'snow', n: number, sc: number, cap?: number) => {
            for (let i = 0; i < n; i++) {
                let x: number, y: number, tries = 0;
                do { x = rng(80, MW - 80); y = rng(80, MH - 80); tries++; } while ((!far(x, y) || !spaced(x, y)) && tries < 200);
                placed.push({ x, y });
                const r: Res = { sprite: scene.lit(scene.add.sprite(x, y, tex).setScale(sc)), kind };
                if (cap !== undefined) { r.capacity = cap; r.ready = true; r.timer = 0; }
                this.res.push(r);
            }
        };
        mk('tree', 'logs', 35, 0.16, TREE_CAP);
        mk('rock', 'rubble', 20, 0.06, STONE_CAP);
        mk('snowPile', 'snow', 30, 0.05);
        // iron ore – placed further from center
        for (let i = 0; i < 8; i++) {
            let x: number, y: number, tries = 0;
            do { x = rng(80, MW - 80); y = rng(80, MH - 80); tries++; }
            while ((Phaser.Math.Distance.Between(x, y, cx, cy) < 800 || !spaced(x, y)) && tries < 300);
            placed.push({ x, y });
            const r: Res = { sprite: scene.lit(scene.add.sprite(x, y, 'ironOre').setScale(0.06)), kind: 'iron', capacity: IRON_CAP, ready: true, timer: 0 };
            this.res.push(r);
        }
        for (let i = 0; i < 15; i++) {
            let x: number, y: number, tries = 0;
            do { x = rng(80, MW - 80); y = rng(80, MH - 80); tries++; } while ((!far(x, y) || !spaced(x, y)) && tries < 200);
            placed.push({ x, y });
            this.bushes.push({ sprite: scene.lit(scene.add.sprite(x, y, 'bushFull').setScale(0.06)), ready: true, timer: 0 });
        }
    }

    tickResources(dt: number) {
        for (const r of this.res) {
            if (r.ready !== false) continue;
            r.timer = (r.timer ?? 0) + dt;
            if (r.kind === 'logs' && r.timer >= TREE_REGROW) {
                r.ready = true; r.capacity = TREE_CAP; r.timer = 0;
                r.sprite.setScale(0.16);
                r.sprite.setTexture(this.s.sOn ? 'treeBlizzard' : 'tree');
            }
            if (r.kind === 'rubble' && r.timer >= STONE_REGROW) {
                r.ready = true; r.capacity = STONE_CAP; r.timer = 0;
                r.sprite.setScale(0.06);
                r.sprite.setTexture('rock');
                r.sprite.setAlpha(1);
            }
        }
    }

    tickBushes(dt: number) {
        for (const bu of this.bushes) { if (bu.ready) continue; bu.timer += dt; if (bu.timer >= BUSH_REGROW) { bu.ready = true; bu.timer = 0; bu.sprite.setTexture('bushFull'); } }
    }

    /* ─── deer ─── */
    spawnDeer() {
        const cx = MW / 2, cy = MH / 2;
        const n = Phaser.Math.Between(4, 5);
        for (let i = 0; i < n; i++) this.spawnOneDeer(cx, cy, 600);
    }
    spawnOneDeer(avoidX: number, avoidY: number, minDist: number) {
        const scene = this.s;
        let x: number, y: number;
        do { x = Phaser.Math.Between(100, MW - 100); y = Phaser.Math.Between(100, MH - 100); }
        while (Phaser.Math.Distance.Between(x, y, avoidX, avoidY) < minDist);
        const sprite = scene.lit(scene.add.sprite(x, y, 'deer').setScale(0.07));
        scene.physics.add.existing(sprite);
        const body = sprite.body as Phaser.Physics.Arcade.Body;
        body.setCollideWorldBounds(true);
        scene.deers.push({ sprite, body, angle: Math.random() * Math.PI * 2, stunTimer: 0 });
    }
    tickDeers(dt: number) {
        const scene = this.s;
        const px = scene.p.x, py = scene.p.y;
        for (const d of scene.deers) {
            if (!d.sprite.active) continue;
            // stun handling
            if (d.stunTimer > 0) {
                d.stunTimer -= dt;
                d.body.setVelocity(0, 0);
                d.sprite.setTint(0xffff44);
                if (d.stunTimer <= 0) { d.stunTimer = 0; d.sprite.clearTint(); }
                continue;
            }
            // find nearest threat (player or wolf)
            let threatX = px, threatY = py;
            let threatDist = Phaser.Math.Distance.Between(d.sprite.x, d.sprite.y, px, py);
            for (const w of scene.wolves) {
                const wd = Phaser.Math.Distance.Between(d.sprite.x, d.sprite.y, w.sprite.x, w.sprite.y);
                if (wd < threatDist) { threatDist = wd; threatX = w.sprite.x; threatY = w.sprite.y; }
            }
            if (threatDist < 400) {
                const fleeAngle = Math.atan2(d.sprite.y - threatY, d.sprite.x - threatX);
                d.angle = fleeAngle;
                const spd = S.SPEED * 0.9;
                d.body.setVelocity(Math.cos(fleeAngle) * spd, Math.sin(fleeAngle) * spd);
                d.sprite.setFlipX(d.body.velocity.x < 0);
            } else {
                if (Math.random() < 0.01) d.angle = Math.random() * Math.PI * 2;
                const wSpd = 30;
                d.body.setVelocity(Math.cos(d.angle) * wSpd, Math.sin(d.angle) * wSpd);
                d.sprite.setFlipX(d.body.velocity.x < 0);
            }
            // bounce off world edges
            if (d.sprite.x < 80 || d.sprite.x > MW - 80) d.angle = Math.PI - d.angle;
            if (d.sprite.y < 80 || d.sprite.y > MH - 80) d.angle = -d.angle;
            // trap collision
            for (let i = scene.combat.traps.length - 1; i >= 0; i--) {
                const tr = scene.combat.traps[i];
                if (Phaser.Math.Distance.Between(d.sprite.x, d.sprite.y, tr.sprite.x, tr.sprite.y) < 25) {
                    d.stunTimer = 4000; d.body.setVelocity(0, 0);
                    tr.sprite.destroy(); scene.combat.traps.splice(i, 1);
                    scene.msg('🪤 Deer trapped!'); break;
                }
            }
        }
    }
    killDeer(d: Deer) {
        const scene = this.s;
        const dx = d.sprite.x, dy = d.sprite.y;
        if (scene.bpTotal() < S.CAP) scene.bp.meat += Math.min(2, S.CAP - scene.bpTotal());
        if (scene.bpTotal() < S.CAP) scene.bp.pelts++;
        const lt = scene.add.text(dx, dy - 20, '+2 🥩 Meat  +1 🦊 Pelt', {
            fontSize: '13px', color: '#ffe', fontFamily: 'Arial', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(9999);
        scene.tweens.add({ targets: lt, y: dy - 80, alpha: 0, duration: 2000, onComplete: () => lt.destroy() });
        scene.emitParticles(dx, dy, 'partBlood');
        d.sprite.destroy();
        scene.deers = scene.deers.filter(x => x !== d);
        sfx.hit();
    }

    /* ─── day/night ─── */
    tickDayNight(dt: number) {
        const scene = this.s;
        this.dayClock += dt;
        if (this.dayClock >= FULL_DAY) {
            this.dayClock -= FULL_DAY;
            if (scene.wolves.length < WOLF_MAX_MAP) {
                scene.combat.spawnOneWolf(scene.p.x, scene.p.y, 600);
            }
        }
        // respawn deer if low
        if (scene.deers.length < 4) {
            this.spawnOneDeer(scene.p.x, scene.p.y, 400);
        }
        const wasNight = scene.isNight;
        scene.isNight = this.dayClock >= DAY_LEN;
        this.ambTarget = scene.isNight ? 0.55 : 1;
        if (scene.isNight && !wasNight) { if (!scene.sOn) this.startStorm(); }
        if (scene.isNight) {
            scene.dayLabel.setText(`🌙 Night: ${Math.ceil((FULL_DAY - this.dayClock) / 1000)}s`);
        } else {
            scene.dayLabel.setText(`☀️ Day: ${Math.ceil((DAY_LEN - this.dayClock) / 1000)}s`);
        }
    }

    /* ─── blizzard ─── */
    tickStorm(dt: number) {
        const scene = this.s;
        if (!scene.sOn) return;
        this.sElap += dt;
        scene.sOvr.setAlpha(0.04 + Math.sin(this.sElap / 400) * 0.02);
        this.sDmg -= dt;
        if (this.sDmg <= 0) { this.stormDmg(); this.sDmg = STORM_TICK; }
        if (this.sElap >= STORM_LEN) this.endStorm();
    }
    startStorm() {
        const scene = this.s;
        scene.sOn = true; this.sElap = 0; this.sDmg = STORM_TICK;
        scene.sOvr.setFillStyle(0xaaddff, 0.04); scene.sLbl.setAlpha(1);
        scene.tweens.add({ targets: scene.sLbl, alpha: { from: 1, to: 0.4 }, duration: 500, yoyo: true, repeat: -1 });
        for (const r of this.res) { if (r.kind === 'logs' && r.sprite.active && r.ready !== false) r.sprite.setTexture('treeBlizzard'); }
        sfx.startWind(); scene.msg('⚠️ Blizzard incoming!');
    }
    stormDmg() {
        const scene = this.s;
        const rm: Bld[] = [];
        for (const b of scene.blds) { if (b.kind === 'furnace') continue; b.hp--; scene.buildings.drawBar(b); b.sprite.setTint(0xff6666); scene.time.delayedCall(300, () => b.sprite.clearTint()); if (b.hp <= 0) rm.push(b); }
        for (const b of rm) scene.buildings.destroyBld(b);
        if (!scene.isInside) {
            scene.cameras.main.flash(300, 100, 150, 255, true);
        }
    }
    endStorm() {
        const scene = this.s;
        scene.sOn = false; scene.sOvr.setAlpha(0);
        scene.tweens.killTweensOf(scene.sLbl); scene.sLbl.setAlpha(0);
        for (const r of this.res) { if (r.kind === 'logs' && r.sprite.active && r.ready !== false) r.sprite.setTexture('tree'); }
        sfx.stopWind(); scene.msg('Blizzard passed.');
    }

    /* ─── NPC workers ─── */
    tickWorkers(dt: number) {
        const scene = this.s;
        for (let i = this.workers.length - 1; i >= 0; i--) {
            const w = this.workers[i];
            if (!scene.blds.includes(w.targetBld)) {
                w.sprite.destroy();
                this.workers.splice(i, 1);
                scene.msg(`👷 ${w.type === 'lumberjack' ? 'Lumberjack' : 'Miner'} left (building destroyed).`);
                continue;
            }
            const bx = w.targetBld.sprite.x, by = w.targetBld.sprite.y;
            const dx = w.sprite.x - bx, dy = w.sprite.y - by;
            const dist = Math.sqrt(dx * dx + dy * dy);
            w.timer += dt;
            if (dist > 90) {
                w.angle = Math.atan2(by - w.sprite.y, bx - w.sprite.x) + (Math.random() - 0.5) * 0.5;
            } else if (Math.random() < 0.01) {
                w.angle += (Math.random() - 0.5) * 2;
            }
            w.sprite.x += Math.cos(w.angle) * 20 * dt / 1000;
            w.sprite.y += Math.sin(w.angle) * 20 * dt / 1000;
            w.sprite.setFlipX(Math.cos(w.angle) < 0);
            if (w.timer >= 5000) {
                w.timer = 0;
                if (w.type === 'lumberjack') {
                    if (S.baseLogs > 0) {
                        S.baseLogs--; S.millInputLogs++;
                        this.floatText(w.sprite.x, w.sprite.y - 20, '+1 🪵→Mill');
                    }
                } else {
                    if (S.baseRubble > 0) {
                        S.baseRubble--; S.qryInputRubble++;
                        this.floatText(w.sprite.x, w.sprite.y - 20, '+1 🪨→Quarry');
                    }
                }
            }
        }
    }
    private floatText(x: number, y: number, text: string) {
        const scene = this.s;
        const t = scene.add.text(x, y, text, { fontSize: '12px', color: '#aaffaa', stroke: '#000000', strokeThickness: 2 }).setOrigin(0.5).setDepth(9999);
        scene.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
    }
    hasWorkerFor(kind: string): boolean {
        return this.workers.some(w => w.targetBld.kind === kind);
    }
    hireLumberjack() {
        const scene = this.s;
        if (!scene.mill) { scene.msg('Build a Mill first!'); return; }
        if (this.hasWorkerFor('mill')) { scene.msg('Mill already has a worker!'); return; }
        if (scene.bp.meat < 10 || S.basePlanks < 5) { scene.msg('Need 10 Meat (BP) + 5 Planks (Mill)'); return; }
        scene.bp.meat -= 10; S.basePlanks -= 5;
        const sx = scene.mill.sprite.x + (Math.random() - 0.5) * 40;
        const sy = scene.mill.sprite.y + 30;
        const sprite = scene.lit(scene.add.sprite(sx, sy, 'playerIdle').setScale(PSC).setTint(0x88ff88).setDepth(5));
        this.workers.push({ sprite, type: 'lumberjack', targetBld: scene.mill, timer: 0, angle: 0 });
        sfx.build(); scene.msg('👷 Lumberjack hired! Auto-feeds logs into Mill.');
    }
    hireMiner() {
        const scene = this.s;
        if (!scene.qry) { scene.msg('Build a Quarry first!'); return; }
        if (this.hasWorkerFor('quarry')) { scene.msg('Quarry already has a worker!'); return; }
        if (scene.bp.meat < 10 || S.basePlanks < 5) { scene.msg('Need 10 Meat (BP) + 5 Planks (Mill)'); return; }
        scene.bp.meat -= 10; S.basePlanks -= 5;
        const sx = scene.qry.sprite.x + (Math.random() - 0.5) * 40;
        const sy = scene.qry.sprite.y + 30;
        const sprite = scene.lit(scene.add.sprite(sx, sy, 'playerIdle').setScale(PSC).setTint(0xaaaaaa).setDepth(5));
        this.workers.push({ sprite, type: 'miner', targetBld: scene.qry, timer: 0, angle: 0 });
        sfx.build(); scene.msg('👷 Miner hired! Auto-feeds rubble into Quarry.');
    }
}
