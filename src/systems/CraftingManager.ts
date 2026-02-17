/**
 * CraftingManager — extracted from main.ts Game class.
 * Handles all crafting, upgrades, research, and related proximity checks.
 */
import Phaser from 'phaser';
import { S } from '../state';
import { SFX } from '../sfx';
import { PSC, STONE_TOOL_DUR, IRON_TOOL_DUR, BOW_DUR } from '../constants';
import type { Bld } from '../types';

/**
 * Minimal interface describing the parts of the Game scene that
 * CraftingManager needs. Keeps the coupling explicit.
 */
export interface CraftingScene extends Phaser.Scene {
    /* player sprite & helpers */
    p: Phaser.GameObjects.Sprite;
    bp: { logs: number; rubble: number; snow: number; berries: number; meat: number; pelts: number; iron: number; arrows: number; torches: number };
    bpTotal(): number;
    totalLogs(): number;
    totalRubble(): number;
    spendLogs(n: number): void;
    spendRubble(n: number): void;

    /* buildings */
    furnace: Bld | null;
    furnaceLvl: number;
    anvil: Bld | null;
    researchTable: Bld | null;
    blds: Bld[];
    fLight: Phaser.GameObjects.Light;

    /* player stats */
    MAX_HP: number;
    playerHp: number;

    /* items */
    groundItems: Phaser.GameObjects.Sprite[];
    placedTorches: { sprite: Phaser.GameObjects.Sprite; light: Phaser.GameObjects.Light; x: number; y: number }[];

    /* visuals / feedback */
    lit<T extends Phaser.GameObjects.Sprite>(s: T): T;
    msg(t: string): void;
    pileVis(): void;
    drawBar(b: Bld): void;
    clearBaseFog(): void;
    clearFog(x: number, y: number, radius: number): void;
    isInside: Bld | null;
}

export class CraftingManager {
    private scene: CraftingScene;
    private sfx: SFX;

    constructor(scene: CraftingScene, sfx: SFX) {
        this.scene = scene;
        this.sfx = sfx;
    }

    /* ─── proximity helpers ─── */

    nearBase(): boolean {
        const s = this.scene;
        const px = s.p.x, py = s.p.y;
        if (s.furnace) {
            if (Phaser.Math.Distance.Between(px, py, s.furnace.sprite.x, s.furnace.sprite.y) < 350) return true;
        }
        const fences = s.blds.filter(b => b.kind === 'fence');
        if (fences.length >= 2) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const f of fences) { minX = Math.min(minX, f.sprite.x); maxX = Math.max(maxX, f.sprite.x); minY = Math.min(minY, f.sprite.y); maxY = Math.max(maxY, f.sprite.y); }
            const m = 40;
            if (px >= minX - m && px <= maxX + m && py >= minY - m && py <= maxY + m) return true;
        }
        return false;
    }

    nearBld(b: Bld): boolean {
        return Phaser.Math.Distance.Between(this.scene.p.x, this.scene.p.y, b.sprite.x, b.sprite.y) < 200;
    }

    /* ─── tool crafting ─── */

    craftStoneTools() {
        const s = this.scene;
        if (s.bp.logs < 3 || s.bp.rubble < 5) { s.msg('Need 3 Logs + 5 Rubble (BP)'); return; }
        s.bp.logs -= 3; s.bp.rubble -= 5;
        S.toolTier = 1; S.toolDurability = STONE_TOOL_DUR; S.toolMaxDurability = STONE_TOOL_DUR;
        this.sfx.build(); s.msg('🪨 Stone Tools crafted!');
    }

    craftIronTools() {
        const s = this.scene;
        if (!s.anvil) { s.msg('Need an Anvil!'); return; }
        if (!this.nearBld(s.anvil)) { s.msg('Must be near the Anvil!'); return; }
        if (s.bp.iron < 5 || S.basePlanks < 10) { s.msg('Need 5 Iron (BP) + 10 Planks (Mill)'); return; }
        s.bp.iron -= 5; S.basePlanks -= 10;
        S.toolTier = 2; S.toolDurability = IRON_TOOL_DUR; S.toolMaxDurability = IRON_TOOL_DUR;
        this.sfx.build(); s.msg('⛏️ Iron Tools crafted! Gather 2x faster.');
    }

    /* ─── torches ─── */

    placeTorchItem() {
        const s = this.scene;
        if (s.isInside) { s.msg("Can't place torches inside!"); return; }
        if (s.bp.torches < 1) { s.msg('Need a Torch (BP)'); return; }
        s.bp.torches--;
        const tx = s.p.x, ty = s.p.y;
        const sprite = s.lit(s.add.sprite(tx, ty, 'torchTex').setScale(0.05).setDepth(2));
        const light = s.lights.addLight(tx, ty, 500, 0xffaa44, 1.5);
        s.placedTorches.push({ sprite, light, x: tx, y: ty });
        s.clearFog(tx, ty, 600);
        this.sfx.build(); s.msg('🔥 Torch placed!');
    }

    craftTorch() {
        const s = this.scene;
        if (s.bp.logs < 2) { s.msg('Need 2 Logs (BP)'); return; }
        if (s.bp.pelts < 1) { s.msg('Need 1 Pelt (BP)'); return; }
        s.bp.logs -= 2; s.bp.pelts -= 1;
        if (s.bpTotal() >= S.CAP) { s.msg('Backpack full!'); return; }
        s.bp.torches++;
        this.sfx.build(); s.msg('🔥 Torch crafted!');
    }

    /* ─── bow & arrows ─── */

    craftBow() {
        const s = this.scene;
        if (S.hasBow) { s.msg('Already have a bow!'); return; }
        if (!this.nearBase()) { s.msg('Must be near base to craft!'); return; }
        if (S.basePlanks < 10) { s.msg('Need 10 Planks (Mill)'); return; }
        S.basePlanks -= 10;
        S.bowDurability = BOW_DUR;
        const bowSprite = s.lit(s.add.sprite(s.p.x, s.p.y + 20, 'bowGround').setScale(0.05));
        s.groundItems.push(bowSprite);
        this.sfx.build(); s.msg('🏹 Bow crafted! Walk to it and press Space to equip.');
        s.pileVis();
    }

    craftArrows() {
        const s = this.scene;
        if (s.totalLogs() < 2 || s.totalRubble() < 2) { s.msg('Need 2 Logs + 2 Rubble'); return; }
        const space = S.CAP - s.bpTotal() + 4;
        const add = Math.min(5, space);
        if (add <= 0) { s.msg('Backpack full!'); return; }
        s.spendLogs(2); s.spendRubble(2);
        s.bp.arrows += add;
        this.sfx.build(); s.msg(`Crafted ${add} arrows (${s.bp.arrows} total)`);
    }

    /* ─── outfit & bag ─── */

    craftCoat() {
        const s = this.scene;
        if (S.currentOutfit === 'hooded') { s.msg('Already wearing Hooded Parka!'); return; }
        if (s.bp.pelts < 5) { s.msg('Need 5 pelts (BP)'); return; }
        s.bp.pelts -= 5; S.currentOutfit = 'hooded';
        s.p.setTexture('playerIdle');
        s.p.setScale(PSC);
        this.sfx.build(); s.msg('🧥 Equipped Hooded Parka! +Warmth +Armor');
    }

    craftBag() {
        const s = this.scene;
        if (S.hasBag) { s.msg('Already have a leather bag!'); return; }
        if (s.bp.pelts < 10) { s.msg('Need 10 Pelts (BP)'); return; }
        if (S.basePlanks < 10) { s.msg('Need 10 Planks (Mill)'); return; }
        s.bp.pelts -= 10; S.basePlanks -= 10;
        S.hasBag = true; S.CAP = 35;
        this.sfx.build(); s.msg('🎒 Leather Bag crafted! Backpack: 35 slots.');
    }

    /* ─── sled ─── */

    craftSled() {
        const s = this.scene;
        if (S.hasSled) { s.msg('Already have a sled!'); return; }
        if (!this.nearBase()) { s.msg('Must be near base!'); return; }
        if (S.basePlanks < 20 || s.bp.iron < 5 || s.bp.pelts < 5) { s.msg('Need 20 Planks + 5 Iron (BP) + 5 Pelts (BP)'); return; }
        S.basePlanks -= 20; s.bp.iron -= 5; s.bp.pelts -= 5;
        S.hasSled = true; S.SPEED = 350;
        this.sfx.build(); s.msg('🛷 Sled built! You move much faster now.');
    }

    /* ─── research ─── */

    researchThickSkin() {
        const s = this.scene;
        if (S.techThickSkin) { s.msg('Already researched!'); return; }
        if (!s.researchTable || !this.nearBld(s.researchTable)) { s.msg('Must be near Research Table!'); return; }
        if (s.bp.pelts < 20 || s.bp.meat < 10) { s.msg('Need 20 Pelts + 10 Meat (BP)'); return; }
        s.bp.pelts -= 20; s.bp.meat -= 10;
        S.techThickSkin = true;
        s.MAX_HP = 150; s.playerHp = 150;
        this.sfx.build(); s.msg('🔬 Thick Skin! MAX HP → 150, fully healed.');
    }

    researchEfficiency() {
        const s = this.scene;
        if (S.techEfficiency) { s.msg('Already researched!'); return; }
        if (!s.researchTable || !this.nearBld(s.researchTable)) { s.msg('Must be near Research Table!'); return; }
        if (s.bp.iron < 20 || S.basePlanks < 20) { s.msg('Need 20 Iron (BP) + 20 Planks (Mill)'); return; }
        s.bp.iron -= 20; S.basePlanks -= 20;
        S.techEfficiency = true;
        this.sfx.build(); s.msg('🔬 Efficiency! +1 to all gathering yields.');
    }

    /* ─── furnace upgrades ─── */

    upgradeFurnace(level: number) {
        const s = this.scene;
        if (s.furnaceLvl >= level) { s.msg('Already upgraded!'); return; }
        if (level === 2) {
            if (S.basePlanks < 30 || S.baseBricks < 30) { s.msg('Need 30 Planks + 30 Bricks'); return; }
            S.basePlanks -= 30; S.baseBricks -= 30;
        } else if (level === 3) {
            if (s.furnaceLvl < 2) { s.msg('Upgrade to Lvl 2 first!'); return; }
            if (S.basePlanks < 60 || S.baseBricks < 60 || s.bp.pelts < 10) { s.msg('Need 60 Planks + 60 Bricks + 10 Pelts'); return; }
            S.basePlanks -= 60; S.baseBricks -= 60; s.bp.pelts -= 10;
        }
        s.furnaceLvl = level;
        const lightR = [380, 500, 800][level - 1];
        s.fLight.setRadius(lightR);
        if (s.furnace) s.drawBar(s.furnace);
        s.pileVis();
        this.sfx.build(); s.msg(`🔥 Furnace upgraded to Lvl ${level}!`);
        s.clearBaseFog();
    }

    buildTracks() {
        const s = this.scene;
        if (S.furnaceMobile) { s.msg('Tracks already built!'); return; }
        if (s.furnaceLvl < 3) { s.msg('Furnace must be Lvl 3!'); return; }
        if (S.baseBricks < 50 || s.bp.iron < 50) { s.msg('Need 50 Bricks + 50 Iron (BP)'); return; }
        S.baseBricks -= 50; s.bp.iron -= 50;
        S.furnaceMobile = true;
        if (s.furnace) s.furnace.sprite.setTint(0xffffcc);
        this.sfx.build(); s.msg('🚜 Tracks built! Hold Space near Furnace to push it North!');
    }
}
