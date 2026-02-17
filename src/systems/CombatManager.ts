/**
 * CombatManager — extracted from main.ts Game class.
 * Handles bow & arrow shooting, projectile updates, snare traps,
 * wolf spawning, wolf AI ticking, and wolf/deer killing.
 */
import Phaser from 'phaser';
import { S } from '../state';
import { SFX } from '../sfx';
import {
    MW, MH, ARROW_SPEED, ARROW_DMG, SHOOT_SLOW,
    WOLF_N, WOLF_HP, WOLF_FAST, WOLF_SLOW, WOLF_RANGE,
    WOLF_DMG, WOLF_CD, WOLF_KB,
} from '../constants';
import type { Bld, Wolf, Arrow, Trap, Deer } from '../types';
import type { BuildingManager } from './BuildingManager';

export interface CombatScene extends Phaser.Scene {
    p: Phaser.GameObjects.Sprite;
    pb: Phaser.Physics.Arcade.Body;
    bp: { logs: number; rubble: number; snow: number; berries: number; meat: number; pelts: number; iron: number; arrows: number; torches: number };
    bpTotal(): number;
    psc(): number;

    /* state */
    wolves: Wolf[];
    deers: Deer[];
    blds: Bld[];
    isInside: Bld | null;
    isNight: boolean;
    sOn: boolean;
    playerHp: number;

    /* helpers */
    lit<T extends Phaser.GameObjects.Sprite>(s: T): T;
    msg(t: string): void;
    setPose(tex: string, dur: number): void;
    emitParticles(x: number, y: number, tex: string, count?: number): void;
    gameOver(cause: string): void;
    killDeer(d: Deer): void;

    /* managers */
    buildings: BuildingManager;
}

export class CombatManager {
    private scene: CombatScene;
    private sfx: SFX;

    /* state */
    projectiles: Arrow[] = [];
    traps: Trap[] = [];
    shootSlow = 0;

    constructor(scene: CombatScene, sfx: SFX) {
        this.scene = scene;
        this.sfx = sfx;
    }

    /* ─── bow & arrow ─── */

    shootArrow(ptr: Phaser.Input.Pointer) {
        const s = this.scene;
        if (!S.hasBow || s.bp.arrows <= 0 || s.isInside) return;
        s.bp.arrows--;
        S.bowDurability--;
        if (S.bowDurability <= 0) {
            S.hasBow = false; S.bowDurability = 0;
            s.msg('⚠️ Your bow broke!');
        }
        this.shootSlow = SHOOT_SLOW;
        s.setPose(S.currentOutfit === 'steam' ? 'steamShoot' : 'playerShoot', 500);
        const px = s.p.x, py = s.p.y;
        const ang = Phaser.Math.Angle.Between(px, py, ptr.worldX, ptr.worldY);
        const sprite = s.add.sprite(px, py, 'arrowTex').setDepth(9500).setRotation(ang);
        s.physics.add.existing(sprite);
        const body = sprite.body as Phaser.Physics.Arcade.Body;
        const vx = Math.cos(ang) * ARROW_SPEED, vy = Math.sin(ang) * ARROW_SPEED;
        body.setVelocity(vx, vy);
        this.sfx.hit();
        this.projectiles.push({ sprite, body, vx, vy, life: 2000 });
    }

    tickProjectiles(dt: number) {
        const s = this.scene;
        const rem: Arrow[] = [];
        for (const a of this.projectiles) {
            a.life -= dt;
            if (a.life <= 0 || !a.sprite.active) { rem.push(a); continue; }
            for (const w of s.wolves) {
                if (w.hp <= 0) continue;
                const d = Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, w.sprite.x, w.sprite.y);
                if (d < 30) {
                    w.hp -= ARROW_DMG;
                    s.emitParticles(w.sprite.x, w.sprite.y, 'partBlood');
                    w.sprite.setTint(0xffffff);
                    s.time.delayedCall(150, () => { if (w.sprite.active) w.sprite.clearTint(); });
                    rem.push(a);
                    if (w.hp <= 0) this.killWolf(w);
                    break;
                }
            }
            // deer arrow hit
            if (!rem.includes(a)) {
                for (const deer of s.deers) {
                    if (!deer.sprite.active) continue;
                    const dd = Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, deer.sprite.x, deer.sprite.y);
                    if (dd < 30) {
                        rem.push(a);
                        s.killDeer(deer);
                        break;
                    }
                }
            }
        }
        for (const a of rem) {
            a.sprite.destroy();
            this.projectiles = this.projectiles.filter(x => x !== a);
        }
    }

    /* ─── snare trap ─── */

    placeTrap() {
        const s = this.scene;
        if (s.isInside) { s.msg("Can't place traps inside!"); return; }
        if (s.bp.logs < 2) { s.msg('Need 2 Logs (BP)'); return; }
        if (s.bp.meat < 1) { s.msg('Need 1 Meat (BP)'); return; }
        s.bp.logs -= 2; s.bp.meat -= 1;
        const sprite = s.add.sprite(s.p.x, s.p.y, 'snareTrap').setScale(0.05).setDepth(1);
        s.physics.add.existing(sprite, true);
        this.traps.push({ sprite, body: sprite.body as Phaser.Physics.Arcade.Body });
        this.sfx.build(); s.msg('Snare trap placed!');
    }

    /* ─── wolves ─── */

    spawnWolves() {
        const cx = MW / 2, cy = MH / 2;
        for (let i = 0; i < WOLF_N; i++) this.spawnOneWolf(cx, cy, 800);
    }

    spawnOneWolf(avoidX: number, avoidY: number, minDist: number) {
        const s = this.scene;
        let x: number, y: number;
        do { x = Phaser.Math.Between(100, MW - 100); y = Phaser.Math.Between(100, MH - 100); }
        while (Phaser.Math.Distance.Between(x, y, avoidX, avoidY) < minDist);
        const sprite = s.lit(s.add.sprite(x, y, 'wolfDay').setScale(0.08));
        s.physics.add.existing(sprite);
        const body = sprite.body as Phaser.Physics.Arcade.Body;
        body.setCollideWorldBounds(true);
        for (const b of s.blds) {
            if (b.kind === 'fence') s.physics.add.collider(sprite, b.sprite);
        }
        s.wolves.push({ sprite, body, angle: Math.random() * Math.PI * 2, cd: 0, hp: WOLF_HP, stunTimer: 0, attackTarget: null, attackCd: 0 });
    }

    tickWolves(dt: number) {
        const s = this.scene;
        const px = s.p.x, py = s.p.y;
        const aggro = s.isNight || s.sOn;
        const spd = aggro ? WOLF_FAST : WOLF_SLOW;
        for (const w of s.wolves) {
            if (w.hp <= 0) continue;
            w.cd = Math.max(0, w.cd - dt);
            if (w.stunTimer > 0) {
                w.stunTimer -= dt;
                w.body.setVelocity(0, 0);
                w.sprite.setTint(0xffff44);
                if (w.stunTimer <= 0) w.sprite.clearTint();
                continue;
            }
            const d = Phaser.Math.Distance.Between(w.sprite.x, w.sprite.y, px, py);
            if (aggro && d < WOLF_RANGE && !s.isInside) {
                const ang = Phaser.Math.Angle.Between(w.sprite.x, w.sprite.y, px, py);
                w.body.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd);
                if (w.sprite.texture.key !== 'wolfNight') w.sprite.setTexture('wolfNight');
                w.sprite.setFlipX(px < w.sprite.x);
                if (Math.random() < 0.003) this.sfx.growl();
                // siege: if wolf is barely moving, it's blocked by a structure
                const vel = Math.sqrt(w.body.velocity.x ** 2 + w.body.velocity.y ** 2);
                if (vel < 10) {
                    if (!w.attackTarget || !w.attackTarget.sprite.active) {
                        let closest: Bld | null = null, cd = 60;
                        for (const b of s.blds) {
                            if (b.kind === 'furnace') continue;
                            const bd = Phaser.Math.Distance.Between(w.sprite.x, w.sprite.y, b.sprite.x, b.sprite.y);
                            if (bd < cd) { cd = bd; closest = b; }
                        }
                        w.attackTarget = closest;
                    }
                    if (w.attackTarget && w.attackTarget.sprite.active) {
                        w.attackCd -= dt;
                        if (w.attackCd <= 0) {
                            w.attackCd = 1500;
                            w.attackTarget.hp--;
                            s.buildings.drawBar(w.attackTarget);
                            w.attackTarget.sprite.setTint(0xff6666);
                            s.time.delayedCall(200, () => { if (w.attackTarget?.sprite.active) w.attackTarget.sprite.clearTint(); });
                            s.emitParticles(w.attackTarget.sprite.x, w.attackTarget.sprite.y, 'partWood', 3);
                            if (Math.random() < 0.4) this.sfx.growl();
                            if (w.attackTarget.hp <= 0) {
                                s.buildings.destroyBld(w.attackTarget);
                                w.attackTarget = null;
                            }
                        }
                    }
                } else {
                    w.attackTarget = null; w.attackCd = 0;
                }
            } else {
                w.attackTarget = null; w.attackCd = 0;
                if (w.sprite.texture.key !== 'wolfDay') w.sprite.setTexture('wolfDay');
                if (Math.random() < 0.01) w.angle = Math.random() * Math.PI * 2;
                w.body.setVelocity(Math.cos(w.angle) * spd, Math.sin(w.angle) * spd);
                if (w.sprite.x < 80 || w.sprite.x > MW - 80) w.angle = Math.PI - w.angle;
                if (w.sprite.y < 80 || w.sprite.y > MH - 80) w.angle = -w.angle;
            }
            for (let i = this.traps.length - 1; i >= 0; i--) {
                const tr = this.traps[i];
                if (Phaser.Math.Distance.Between(w.sprite.x, w.sprite.y, tr.sprite.x, tr.sprite.y) < 25) {
                    w.stunTimer = 4000; w.body.setVelocity(0, 0);
                    tr.sprite.destroy(); this.traps.splice(i, 1);
                    s.msg('🪤 Wolf trapped!'); break;
                }
            }
            if (!s.isInside && w.cd <= 0 && d < 30) {
                w.cd = WOLF_CD;
                const dmg = S.currentOutfit === 'hooded' ? 10 : WOLF_DMG;
                s.playerHp = Math.max(0, s.playerHp - dmg);
                s.cameras.main.shake(200, 0.008); this.sfx.hurt(); this.sfx.growl();
                s.emitParticles(px, py, 'partBlood', 8);
                const kb = Phaser.Math.Angle.Between(w.sprite.x, w.sprite.y, px, py);
                s.p.setPosition(px + Math.cos(kb) * WOLF_KB, py + Math.sin(kb) * WOLF_KB);
                s.msg(`🐺 Wolf attack! -${WOLF_DMG} HP`);
                if (s.playerHp <= 0) s.gameOver('mauled');
            }
        }
    }

    killWolf(w: Wolf) {
        const s = this.scene;
        const wx = w.sprite.x, wy = w.sprite.y;
        if (s.bpTotal() < S.CAP) s.bp.meat++;
        if (s.bpTotal() < S.CAP) s.bp.pelts++;
        const lt = s.add.text(wx, wy - 20, '+1 🥩 Meat  +1 🦊 Pelt', {
            fontSize: '13px', color: '#ffe', fontFamily: 'Arial', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(9999);
        s.tweens.add({ targets: lt, y: wy - 80, alpha: 0, duration: 2000, onComplete: () => lt.destroy() });
        w.sprite.destroy();
        s.wolves = s.wolves.filter(x => x !== w);
        this.sfx.hit();
    }
}
