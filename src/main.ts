import Phaser from 'phaser';
import './style.css';
import { SFX } from './sfx';
import type { Res, Bld, Bush, Wolf, Deer, PlacedTorch, Worker, GameState } from './types';
import {
  MW, MH, RANGE, PSC, STEAM_PSC,
  HUNGER_TICK,
  TREE_CAP,
  FURNACE_LOG_CAP, FURNACE_RUBBLE_CAP,
  MILL_PLANK_CAP, QRY_BRICK_CAP,
  REFINE_TICK, FUEL_TICK,
} from './constants';
import { SaveManager } from './systems/SaveManager';
import { CraftingManager } from './systems/CraftingManager';
import { BuildingManager } from './systems/BuildingManager';
import { CombatManager } from './systems/CombatManager';
import { WorldManager } from './systems/WorldManager';
import { createStatusHUD, createButtonsPanel, wireDropdowns, createTouchControls, refreshHUD as hudRefresh } from './ui/HUDManager';
import { S } from './state';

const sfx = new SFX();


class Game extends Phaser.Scene {
  p!: Phaser.GameObjects.Sprite;
  pb!: Phaser.Physics.Arcade.Body;
  private waddle: Phaser.Tweens.Tween | null = null;
  k!: Record<string, Phaser.Input.Keyboard.Key>;
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  bp = { logs: 0, rubble: 0, snow: 0, berries: 0, arrows: 0, pelts: 0, meat: 0, iron: 0, torches: 0 };
  res: Res[] = [];
  blds: Bld[] = [];
  furnace: Bld | null = null;
  mill: Bld | null = null;
  qry: Bld | null = null;
  anvil: Bld | null = null;
  researchTable: Bld | null = null;
  workers: Worker[] = [];
  private drivingFurnace = false;
  private wPile: Phaser.GameObjects.Sprite | null = null;
  private sPile: Phaser.GameObjects.Sprite | null = null;
  private wPileLbl: Phaser.GameObjects.Text | null = null;
  private sPileLbl: Phaser.GameObjects.Text | null = null;
  // touch controls
  private touchVx = 0;
  private touchVy = 0;
  private touchAction = false;
  private gcd = 0;
  playerHp = 100;
  MAX_HP = 100;
  private playerHunger = 100;
  private readonly MAX_HUNGER = 100;
  private hungerClock = 0;
  private playerTemp = 100;
  private readonly MAX_TEMP = 100;
  furnaceLvl = 1;
  private millTimer = 0;
  private qryTimer = 0;
  private fuelTimer = 0;
  isInside: Bld | null = null;
  // day/night
  isNight = false;
  private ambCurrent = 1;
  dayLabel!: Phaser.GameObjects.Text;
  // storm
  sOn = false;
  sOvr!: Phaser.GameObjects.Rectangle;
  sLbl!: Phaser.GameObjects.Text;
  // lighting
  private pLight!: Phaser.GameObjects.Light;
  fLight!: Phaser.GameObjects.Light;
  // fog of war
  private fogTexture!: Phaser.GameObjects.RenderTexture;
  private fogStamp!: Phaser.GameObjects.Sprite;
  // torches & glacial wall
  placedTorches: PlacedTorch[] = [];
  private glacialWallSprites: Phaser.GameObjects.Sprite[] = [];
  private glacialWallColliders: Phaser.Physics.Arcade.StaticGroup | null = null;
  // compass
  private compassEl!: HTMLDivElement;
  // world
  bushes: Bush[] = [];
  wolves: Wolf[] = [];
  deers: Deer[] = [];
  groundItems: Phaser.GameObjects.Sprite[] = [];
  private healTimer = 0;
  private inDeepFreeze = false;

  // combat
  combat!: CombatManager;
  // action pose
  poseTimer = 0;
  // pause
  private paused = false;
  private pauseOverlay: HTMLDivElement | null = null;
  // HUD
  private hudEl!: HTMLDivElement;
  private msgEl!: HTMLDivElement;
  private msgT: number | null = null;
  private stepTimer = 0;
  private footprintTimer = 0;
  // menu
  private menuEl: HTMLDivElement | null = null;
  private settingsEl: HTMLDivElement | null = null;
  private saveBtnEl: HTMLButtonElement | null = null;
  private crafting!: CraftingManager;
  buildings!: BuildingManager;
  world!: WorldManager;

  constructor() { super('Game'); }
  lit<T extends Phaser.GameObjects.Sprite>(s: T): T { s.setPipeline('Light2D'); return s; }
  bpTotal(): number { return this.bp.logs + this.bp.rubble + this.bp.snow + this.bp.berries + this.bp.arrows + this.bp.pelts + this.bp.meat + this.bp.iron + this.bp.torches; }
  psc(): number { return S.currentOutfit === 'steam' ? STEAM_PSC : PSC; }
  /** Total logs available (backpack + furnace storage) */
  totalLogs(): number { return this.bp.logs + S.baseLogs; }
  /** Total rubble available (backpack + furnace storage) */
  totalRubble(): number { return this.bp.rubble + S.baseRubble; }
  /** Spend n logs: deducts from backpack first, then furnace storage */
  spendLogs(n: number) {
    const fromBp = Math.min(this.bp.logs, n); this.bp.logs -= fromBp; n -= fromBp;
    if (n > 0) { S.baseLogs -= n; this.pileVis(); }
  }
  /** Spend n rubble: deducts from backpack first, then furnace storage */
  spendRubble(n: number) {
    const fromBp = Math.min(this.bp.rubble, n); this.bp.rubble -= fromBp; n -= fromBp;
    if (n > 0) { S.baseRubble -= n; this.pileVis(); }
  }

  preload() {
    this.load.image('baseFurnace', '/base_furnace.png');
    this.load.image('igloo', '/igloo.png');
    this.load.image('lumberMill', '/lumber_mill.png');
    this.load.image('rockHit', '/rock_hit.png');
    this.load.image('rock', '/rock.png');
    this.load.image('snowPile', '/snow_pile.png');
    this.load.image('stoneQuarry', '/stone_quarry.png');
    this.load.image('stoneHouse', '/stone_house.png');
    this.load.image('woodHouse', '/wood_house.png');
    this.load.image('woodPile', '/wood_pile.png');
    this.load.image('stonePile', '/stone_pile.png');
    this.load.image('tree', '/tree.png');
    this.load.image('treeHit', '/tree_hit.png');
    this.load.image('treeBlizzard', '/tree_blizzard.png');
    this.load.image('bushFull', '/bush_full.png');
    this.load.image('bushHarvested', '/bush_harvested.png');
    this.load.image('wolfDay', '/wolf_day.png');
    this.load.image('wolfNight', '/wolf_night.png');
    this.load.image('deer', '/Deer.png');
    this.load.image('player', '/player_hooded.png');
    // hooded action sprites
    this.load.image('playerIdle', '/player_hooded.png');
    this.load.image('playerCut', '/Player_hooded_cutting.png');
    this.load.image('playerMine', '/PLayer_hooded_mining.png');
    this.load.image('playerShoot', '/Player_hooded_Shooting.png');
    this.load.image('playerSnow', '/Player_hooded_snow.png');
    this.load.image('playerBuilding', '/Player_hooded_building.png');
    this.load.image('playerBuilding2', '/Player_hooded_Building_2.png');
    // shared action sprites
    this.load.image('treeStump', '/Tree_stump.png');
    this.load.image('bowGround', '/Bow_and_Arrow_ground.png');
    // wall / gate / trap sprites
    this.load.image('snareTrap', '/Snare.png');
    this.load.image('woodWallEast', '/Wood_fence_east.png');
    this.load.image('woodWallWest', '/Wood_fence_west.png');
    this.load.image('woodGateEast', '/Wood_gate_east.png');
    this.load.image('woodGateWest', '/Wood_gate_west.png');
    this.load.image('stoneWallEast', '/Stone_wall_east.png');
    this.load.image('stoneWallWest', '/Stone_wall_west.png');
    this.load.image('stoneGateEast', '/Stone_gate_east.png');
    this.load.image('stoneGateWest', '/Stone_gate_west.png');
    // steam outfit sprites
    this.load.image('shipWreck', '/Broken_ship.png');
    this.load.image('steamIdle', '/Player_Steam_outfit.png');
    this.load.image('steamAxe', '/Player_Steam_axe.png');
    this.load.image('steamPick', '/Player_steam_pickaxe.png');
    this.load.image('steamShoot', '/Player_steam_shooting.png');
    this.load.image('steamSnow', '/Player_steam_snow.png');
    this.load.image('steamBuilding', '/Player_steam_building1.png');
    this.load.image('steamBuilding2', '/PLayer_steam_building2.png');
  }

  create() {
    this.crafting = new CraftingManager(this as unknown as import('./systems/CraftingManager').CraftingScene, sfx);
    this.buildings = new BuildingManager(this as unknown as import('./systems/BuildingManager').BuildingScene, sfx);
    this.combat = new CombatManager(this as unknown as import('./systems/CombatManager').CombatScene, sfx);
    this.world = new WorldManager(this as unknown as import('./systems/WorldManager').WorldScene);
    this.physics.world.setBounds(0, 0, MW, MH);
    this.cameras.main.setBounds(0, 0, MW, MH);

    // lighting
    this.lights.enable();
    this.lights.setAmbientColor(0xffffff);
    this.fLight = this.lights.addLight(MW / 2, MH / 2 - 80, 380, 0xffaa55, 1.0);
    this.pLight = this.lights.addLight(MW / 2, MH / 2 + 120, 260, 0xffeedd, 0.4);

    this.input.once('pointerdown', () => sfx.init());
    this.input.keyboard!.once('keydown', () => sfx.init());
    this.input.addPointer(2); // enable multi-touch

    this.genTex();

    // ground – procedural snow terrain
    this.buildSnowGround();

    // player – use steamIdle as default (steampunk outfit)
    this.p = this.lit(this.add.sprite(MW / 2, MH / 2 + 120, 'steamIdle').setScale(STEAM_PSC));
    this.physics.add.existing(this.p);
    this.pb = this.p.body as Phaser.Physics.Arcade.Body;
    this.pb.setCollideWorldBounds(true);
    this.pb.setSize(22, 10).setOffset(3, 34);
    this.cameras.main.startFollow(this.p, true, 0.09, 0.09);

    // crash site set piece (distant prop for storytelling)
    this.lit(this.add.sprite(300, 280, 'shipWreck').setScale(0.22).setDepth(0).setTint(0xccddee));

    this.furnace = this.buildings.addBld(MW / 2, MH / 2 - 80, 'baseFurnace', 'furnace', 999, 999, 0.12);
    this.world.scatter();
    this.combat.spawnWolves();
    this.world.spawnDeer();

    // fog of war – single half-resolution RenderTexture scaled 2x
    this.fogTexture = this.add.renderTexture(0, 0, MW / 2, MH / 2).setOrigin(0, 0).setScale(2).setDepth(8500);
    this.fogTexture.fill(0x1a2c42, 0.95);
    // create stamp sprite for erasing
    this.fogStamp = this.add.sprite(0, 0, 'softBrush').setVisible(false);
    this.clearFog(MW / 2, MH / 2, 600); // clear around spawn

    // glacial wall at north edge
    this.buildGlacialWall();

    // input
    const kb = this.input.keyboard!;
    this.k = { W: kb.addKey('W'), A: kb.addKey('A'), S: kb.addKey('S'), D: kb.addKey('D'), SP: kb.addKey('SPACE') };
    this.cursors = kb.createCursorKeys();
    kb.addKey('ESC').on('down', () => this.buildings.cancelBld());
    kb.addKey('F').on('down', () => this.eatBerry());
    kb.addKey('E').on('down', () => this.eatMeat());
    kb.addKey('T').on('down', () => this.combat.placeTrap());
    kb.addKey('C').on('down', () => this.crafting.placeTorchItem());
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this.buildings.bMode && ptr.leftButtonDown()) { this.buildings.placeBld(ptr.worldX, ptr.worldY); return; }
      if (this.buildings.bMode && ptr.rightButtonDown()) { this.buildings.cancelBld(); return; }
      if (ptr.leftButtonDown()) this.combat.shootArrow(ptr);
    });

    // day label
    const cam = this.cameras.main;
    this.dayLabel = this.add.text(cam.width / 2, 20, '', { fontSize: '16px', color: '#ffe', fontFamily: 'Arial', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(9002);

    this.sOvr = this.add.rectangle(cam.width / 2, cam.height / 2, cam.width + 200, cam.height + 200, 0xaaddff, 0)
      .setScrollFactor(0).setDepth(9000);
    this.sLbl = this.add.text(cam.width / 2, 50, '❄️ BLIZZARD! ❄️', { fontSize: '32px', color: '#fff', fontFamily: 'Arial Black,Arial', stroke: '#1a3a5c', strokeThickness: 5 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(9001).setAlpha(0);

    // compass HUD – below day/night label
    this.compassEl = document.createElement('div');
    this.compassEl.id = 'compass';
    this.compassEl.style.cssText = 'position:fixed;top:46px;left:50%;transform:translateX(-50%);width:50px;height:50px;font-size:32px;text-align:center;line-height:50px;pointer-events:none;z-index:9999;transform-origin:center center;';
    this.compassEl.textContent = '🧭';
    document.body.appendChild(this.compassEl);

    this.createHUD();

    // clear safe zone around crash site based on furnace level
    this.clearBaseFog();

    // show main menu on boot — delay 1 frame so scene is fully running
    this.time.delayedCall(1, () => {
      this.scene.pause();
      this.showMainMenu();
    });
  }

  update(_t: number, dt: number) {
    if (this.paused) return;
    const isBusy = !!this.buildings.building && !this.buildings.building.paused;
    // build timer
    if (this.buildings.building && !this.buildings.building.paused) { this.buildings.tickBuilding(dt); }

    // pose timer (skip if building)
    if (!isBusy) {
      this.poseTimer = Math.max(0, this.poseTimer - dt);
      if (this.poseTimer <= 0 && this.p.texture.key !== 'playerIdle' && this.p.texture.key !== 'steamIdle') {
        const isSteam = S.currentOutfit === 'steam';
        this.p.setTexture(isSteam ? 'steamIdle' : 'playerIdle');
        this.p.setScale(isSteam ? STEAM_PSC : PSC);
      }
    }

    // movement
    const spdMul = this.combat.shootSlow > 0 ? 0.5 : 1;
    this.combat.shootSlow = Math.max(0, this.combat.shootSlow - dt);
    if (isBusy) {
      this.pb.setVelocity(0, 0);
      if (this.waddle) { this.waddle.stop(); this.waddle = null; this.p.setScale(this.psc()); }
    } else if (!this.isInside) {
      let vx = 0, vy = 0;
      if (this.k.A.isDown || this.cursors.left.isDown || this.touchVx < 0) vx = -1;
      else if (this.k.D.isDown || this.cursors.right.isDown || this.touchVx > 0) vx = 1;
      if (this.k.W.isDown || this.cursors.up.isDown || this.touchVy < 0) vy = -1;
      else if (this.k.S.isDown || this.cursors.down.isDown || this.touchVy > 0) vy = 1;
      const len = Math.sqrt(vx * vx + vy * vy) || 1;
      this.pb.setVelocity(vx / len * S.SPEED * spdMul, vy / len * S.SPEED * spdMul);
      const moving = vx !== 0 || vy !== 0;
      if (moving && !this.waddle) {
        const sc = this.psc();
        this.waddle = this.tweens.add({ targets: this.p, scaleY: { from: sc, to: sc * 0.88 }, scaleX: { from: sc, to: sc * 1.12 }, duration: 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      else if (!moving && this.waddle) { this.waddle.stop(); this.waddle = null; this.p.setScale(this.psc()); }
      if (vx < 0) this.p.setFlipX(false); else if (vx > 0) this.p.setFlipX(true);
      if (moving) { this.stepTimer -= dt; if (this.stepTimer <= 0) { sfx.step(); this.stepTimer = 280; } }
      else this.stepTimer = 0;
      // snow footprints
      if (moving && !this.isInside) {
        this.footprintTimer -= dt;
        if (this.footprintTimer <= 0) {
          this.footprintTimer = 200;
          const fp = this.add.circle(this.p.x, this.p.y + 15, 3, 0xc8ddef, 0.3).setDepth(1);
          this.tweens.add({ targets: fp, alpha: 0, duration: 3000, onComplete: () => fp.destroy() });
        }
      }
    } else {
      this.pb.setVelocity(0, 0);
      if (this.waddle) { this.waddle.stop(); this.waddle = null; this.p.setScale(this.psc()); }
    }

    const actionHeld = !isBusy && !this.drivingFurnace && (this.k.SP.isDown || this.touchAction);
    if (actionHeld) { this.gcd -= dt; if (this.gcd <= 0) { this.interact(); this.gcd = 400; } }
    else if (!isBusy) { this.gcd = Math.max(0, this.gcd - dt); }

    this.pLight.setPosition(this.p.x, this.p.y - 10);
    this.ambCurrent = Phaser.Math.Linear(this.ambCurrent, this.world.ambTarget, 0.0008 * dt);
    const c = Math.floor(this.ambCurrent * 255);
    this.lights.setAmbientColor(Phaser.Display.Color.GetColor(c, c, Math.min(255, Math.floor(c * 1.15))));

    // y-sort
    this.p.setDepth(this.p.y);
    for (const r of this.world.res) r.sprite.setDepth(r.sprite.y);
    for (const b of this.blds) { b.sprite.setDepth(b.sprite.y); b.bar.setDepth(b.sprite.y + 1); b.lbl.setDepth(b.sprite.y + 1); }
    for (const bu of this.world.bushes) bu.sprite.setDepth(bu.sprite.y);
    for (const w of this.wolves) w.sprite.setDepth(w.sprite.y);
    for (const de of this.deers) de.sprite.setDepth(de.sprite.y);

    if (this.buildings.bMode && this.buildings.bPrev) {
      const ptr = this.input.activePointer;
      const isWallGate = this.buildings.bMode.includes('Wall') || this.buildings.bMode.includes('Gate');
      if (isWallGate) {
        const GRID = 40;
        const gx = Math.round(ptr.worldX / GRID) * GRID;
        const gy = Math.round(ptr.worldY / GRID) * GRID;
        this.buildings.bPrev.setPosition(gx, gy);
      } else {
        this.buildings.bPrev.setPosition(ptr.worldX, ptr.worldY);
      }
    }

    this.world.tickDayNight(dt);
    this.world.tickStorm(dt);
    this.tickHunger(dt);
    this.tickTemperature(dt);
    this.world.tickBushes(dt);
    this.world.tickResources(dt);
    this.tickRefinement(dt);
    this.tickFuel(dt);
    this.combat.tickWolves(dt);
    this.world.tickDeers(dt);
    // projectiles
    this.combat.tickProjectiles(dt);
    // HP regen: if well-fed and warm
    if (this.playerHunger > 80 && this.playerTemp > 80) {
      this.healTimer += dt;
      if (this.healTimer >= 1000) { this.healTimer = 0; this.playerHp = Math.min(this.playerHp + 1, this.MAX_HP); }
    } else { this.healTimer = 0; }

    // compass: point toward glacial wall (north center)
    const goalX = MW / 2, goalY = 150;
    const ang = Math.atan2(goalY - this.p.y, goalX - this.p.x) - Math.PI / 2;
    if (this.compassEl) this.compassEl.style.transform = `translateX(-50%) rotate(${ang}rad)`;

    // furnace driving
    this.drivingFurnace = false;
    if (S.furnaceMobile && this.furnace && !this.isInside) {
      const fd = Phaser.Math.Distance.Between(this.p.x, this.p.y, this.furnace.sprite.x, this.furnace.sprite.y);
      if (fd < 150 && (this.k.SP.isDown || this.touchAction)) {
        this.drivingFurnace = true;
        // move furnace north
        this.furnace.sprite.y -= 40 * (dt / 1000);
        // snap player behind furnace
        this.p.setPosition(this.furnace.sprite.x, this.furnace.sprite.y + 60);
        // sync bar, label, light
        this.buildings.drawBar(this.furnace);
        this.fLight.setPosition(this.furnace.sprite.x, this.furnace.sprite.y);
        // extra fuel burn: add 2x dt to fuelTimer for 3x total consumption
        this.fuelTimer += dt * 2;
        // clear fog around furnace
        this.clearFog(this.furnace.sprite.x, this.furnace.sprite.y, 300);
      }
    }

    // victory check: furnace reaches the glacial wall
    if (S.furnaceMobile && this.furnace && this.furnace.sprite.y <= 200) {
      this.victory();
    }

    // clear fog as player moves
    this.clearFog(this.p.x, this.p.y, 200);

    // worker AI
    this.world.tickWorkers(dt);

    this.refreshHUD();
  }

  /* ─── player pose helper ─── */
  setPose(tex: string, dur: number) {
    this.p.setTexture(tex);
    const isSteam = tex.startsWith('steam');
    this.p.setScale(isSteam ? STEAM_PSC : PSC);
    this.poseTimer = dur;
  }

  /* ─── textures ─── */
  private genTex() {
    // arrow projectile
    const ag = this.add.graphics();
    ag.fillStyle(0x8B5E3C); ag.fillRect(0, 3, 16, 2);
    ag.fillStyle(0xaaaaaa); ag.fillTriangle(16, 0, 20, 4, 16, 8);
    ag.fillStyle(0xcc8844); ag.fillRect(0, 2, 3, 4);
    ag.generateTexture('arrowTex', 20, 8); ag.destroy();
    // particle textures
    const mkPart = (key: string, color: number) => {
      const pg = this.add.graphics(); pg.fillStyle(color); pg.fillRect(0, 0, 4, 4);
      pg.generateTexture(key, 4, 4); pg.destroy();
    };
    mkPart('partWood', 0x8B5E3C);
    mkPart('partStone', 0x999999);
    mkPart('partBlood', 0xcc3333);
    mkPart('partIron', 0xcc7733);
    // iron ore
    const ig = this.add.graphics();
    ig.fillStyle(0x555555); ig.fillRoundedRect(0, 0, 40, 36, 6);
    ig.fillStyle(0xcc6600); ig.fillRect(6, 8, 8, 6); ig.fillRect(22, 14, 10, 5); ig.fillRect(12, 24, 7, 6);
    ig.generateTexture('ironOre', 40, 36); ig.destroy();
    const ih = this.add.graphics();
    ih.fillStyle(0x444444); ih.fillRoundedRect(0, 0, 40, 36, 6);
    ih.fillStyle(0xcc6600); ih.fillRect(6, 8, 8, 6); ih.fillRect(22, 14, 10, 5);
    ih.lineStyle(2, 0xaaaaaa); ih.lineBetween(10, 4, 30, 32);
    ih.generateTexture('ironOreHit', 40, 36); ih.destroy();
    // anvil
    const av = this.add.graphics();
    av.fillStyle(0x555555); av.fillRect(8, 20, 24, 16);
    av.fillStyle(0x444444); av.fillRect(4, 12, 32, 10);
    av.fillStyle(0x333333); av.fillRect(0, 6, 40, 8);
    av.generateTexture('anvilTex', 40, 36); av.destroy();
    // torch
    const tg = this.add.graphics();
    tg.fillStyle(0x8B5E3C); tg.fillRect(6, 10, 4, 20);
    tg.fillStyle(0xff8800); tg.fillCircle(8, 8, 6);
    tg.fillStyle(0xffcc00); tg.fillCircle(8, 6, 3);
    tg.generateTexture('torchTex', 16, 30); tg.destroy();
    // glacial wall segment
    const gw = this.add.graphics();
    gw.fillStyle(0x88ccee); gw.fillRect(0, 0, 120, 80);
    gw.fillStyle(0xaaddff, 0.5); gw.fillRect(10, 10, 30, 20); gw.fillRect(60, 40, 40, 15);
    gw.lineStyle(2, 0xbbddff); gw.lineBetween(0, 0, 120, 0);
    gw.generateTexture('glacialWall', 120, 80); gw.destroy();
    // soft brush for fog erasing (concentric circles with decreasing alpha)
    const brush = this.add.graphics();
    for (let i = 0; i < 20; i++) {
      brush.fillStyle(0xffffff, 0.05);
      brush.fillCircle(100, 100, 100 - (i * 5));
    }
    brush.generateTexture('softBrush', 200, 200);
    brush.destroy();
    // research table
    const rt = this.add.graphics();
    rt.fillStyle(0x6633aa); rt.fillRoundedRect(0, 0, 40, 40, 4);
    rt.fillStyle(0x9955dd); rt.fillRect(6, 6, 28, 28);
    rt.fillStyle(0xccaaee); rt.fillCircle(20, 20, 8);
    rt.generateTexture('texResearchTable', 40, 40); rt.destroy();
  }

  /* ─── particles ─── */
  emitParticles(x: number, y: number, tex: string, count = 6) {
    this.add.particles(x, y, tex, {
      speed: { min: 40, max: 100 }, lifespan: 400, quantity: count,
      gravityY: 120, scale: { start: 1, end: 0 }, alpha: { start: 1, end: 0 },
      emitting: false
    }).explode(count);
  }

  /* ─── procedural snow ground ─── */
  private buildSnowGround() {
    const rng = (a: number, b: number) => Phaser.Math.Between(a, b);
    const g = this.add.graphics().setDepth(0);

    // layer 1 – large soft snow drifts (light patches)
    const driftColors = [0xe8f0f8, 0xeaf2fc, 0xdfe9f3, 0xf2f7fc, 0xd8e6f0];
    for (let i = 0; i < 120; i++) {
      const clr = driftColors[rng(0, driftColors.length - 1)];
      g.fillStyle(clr, rng(15, 40) / 100);
      const rx = rng(20, 90), ry = rng(12, 50);
      g.fillEllipse(rng(0, MW), rng(0, MH), rx, ry);
    }

    // layer 2 – subtle shadow patches (recesses in snow)
    for (let i = 0; i < 45; i++) {
      g.fillStyle(0xb8cce0, rng(5, 15) / 100);
      g.fillEllipse(rng(0, MW), rng(0, MH), rng(30, 80), rng(10, 30));
    }

    // layer 3 – sparkle highlights
    for (let i = 0; i < 200; i++) {
      const bright = [0xffffff, 0xf8fcff, 0xe8f4ff][rng(0, 2)];
      g.fillStyle(bright, rng(20, 70) / 100);
      const r = rng(1, 3);
      g.fillCircle(rng(0, MW), rng(0, MH), r);
    }

    // layer 4 – faint wind streaks
    g.lineStyle(1, 0xcddceb, 0.04);
    for (let i = 0; i < 40; i++) {
      const sx = rng(0, MW), sy = rng(0, MH);
      g.lineBetween(sx, sy, sx + rng(20, 80), sy + rng(-3, 3));
    }
  }


  /* ─── fog of war ─── */
  clearFog(x: number, y: number, radius: number) {
    // fog RT is half-resolution, so halve positions and scale
    this.fogStamp.setPosition(x / 2, y / 2);
    this.fogStamp.setScale(radius / 100 / 2);
    this.fogStamp.setVisible(true);
    this.fogTexture.erase(this.fogStamp);
    this.fogStamp.setVisible(false);
  }
  clearBaseFog() {
    if (!this.furnace) return;
    const radii = [1200, 2400, 3600];
    const radius = radii[Math.min(this.furnaceLvl, 3) - 1] || 1200;
    this.clearFog(this.furnace.sprite.x, this.furnace.sprite.y, radius);
  }

  /* ─── glacial wall ─── */
  private buildGlacialWall() {
    if (S.glacialWallMelted) return;
    this.glacialWallColliders = this.physics.add.staticGroup();
    for (let x = 0; x < MW; x += 120) {
      const sprite = this.add.sprite(x + 60, 150, 'glacialWall').setScale(1).setDepth(2);
      this.glacialWallSprites.push(sprite);
      const block = this.add.rectangle(x + 60, 150, 120, 80, 0x000000, 0);
      this.physics.add.existing(block, true);
      this.glacialWallColliders.add(block);
    }
    this.physics.add.collider(this.p, this.glacialWallColliders);
  }
  private meltGlacialWall() {
    if (S.glacialWallMelted) return;
    S.glacialWallMelted = true;
    this.cameras.main.shake(1000, 0.01);
    sfx.build();
    this.msg('🔥 The Furnace melts the glacial wall! The path north is open...');
    // fade out wall sprites
    for (const s of this.glacialWallSprites) {
      this.tweens.add({ targets: s, alpha: 0, duration: 3000, onComplete: () => s.destroy() });
    }
    this.glacialWallSprites = [];
    // remove physics
    if (this.glacialWallColliders) {
      this.glacialWallColliders.clear(true, true);
      this.glacialWallColliders = null;
    }
  }
  private victory() {
    this.paused = true;
    // melt the wall
    this.meltGlacialWall();
    // fade to white over 3 seconds
    const cam = this.cameras.main;
    const white = this.add.rectangle(cam.width / 2, cam.height / 2, cam.width + 200, cam.height + 200, 0xffffff, 0)
      .setScrollFactor(0).setDepth(9999);
    this.tweens.add({ targets: white, alpha: 1, duration: 3000 });
    const txt = this.add.text(cam.width / 2, cam.height / 2,
      '🔥 The Glacial Wall Melts!\nYou have conquered the Tundra.\n\nZone 2 coming soon...', {
      fontSize: '32px', color: '#333', fontFamily: 'Arial Black,Arial', align: 'center',
      wordWrap: { width: cam.width * 0.8 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10000).setAlpha(0);
    this.tweens.add({ targets: txt, alpha: 1, delay: 2000, duration: 2000 });
  }






  /* ─── interact ─── */
  private interact() {
    if (this.isInside) { this.exitShelter(); return; }
    const px = this.p.x, py = this.p.y;

    // resume paused build if near site
    if (this.buildings.building && this.buildings.building.paused) {
      const d = Phaser.Math.Distance.Between(px, py, this.buildings.building.wx, this.buildings.building.wy);
      if (d < 100) { this.buildings.resumeBuild(); return; }
    }

    // harvest stunned deer (melee)
    for (const deer of this.deers) {
      if (!deer.sprite.active) continue;
      const dd = Phaser.Math.Distance.Between(px, py, deer.sprite.x, deer.sprite.y);
      if (dd < RANGE && deer.stunTimer > 0) { this.world.killDeer(deer); return; }
    }

    // pick up ground items (bow)
    for (let i = this.groundItems.length - 1; i >= 0; i--) {
      const gi = this.groundItems[i];
      if (!gi.active) { this.groundItems.splice(i, 1); continue; }
      const d = Phaser.Math.Distance.Between(px, py, gi.x, gi.y);
      if (d < RANGE) {
        if (gi.texture.key === 'bowGround') {
          S.hasBow = true; gi.destroy(); this.groundItems.splice(i, 1);
          this.msg('🏹 Equipped Wooden Bow!'); sfx.build(); return;
        }
      }
    }

    // auto-deposit at furnace (logs + rubble, partial deposit)
    if (this.furnace && Phaser.Math.Distance.Between(px, py, this.furnace.sprite.x, this.furnace.sprite.y) < 350 && (this.bp.logs > 0 || this.bp.rubble > 0)) {
      const depL = Math.min(this.bp.logs, FURNACE_LOG_CAP - S.baseLogs);
      const depR = Math.min(this.bp.rubble, FURNACE_RUBBLE_CAP - S.baseRubble);
      if (depL > 0 || depR > 0) {
        this.bp.logs -= depL; this.bp.rubble -= depR;
        S.baseLogs += depL; S.baseRubble += depR;
        if (depL > 0) S.furnaceEverFueled = true;
        const parts: string[] = []; if (depL > 0) parts.push(`${depL} logs`); if (depR > 0) parts.push(`${depR} rubble`);
        this.msg(`+${parts.join(' + ')} → Furnace`); sfx.build(); this.pileVis(); return;
      } else {
        this.msg('Furnace storage full!');
      }
    }
    // deposit logs at mill for refining
    if (this.mill) {
      const d = Phaser.Math.Distance.Between(px, py, this.mill.sprite.x, this.mill.sprite.y);
      if (d < RANGE && this.bp.logs > 0) { const a = this.bp.logs; this.bp.logs = 0; S.millInputLogs += a; this.msg(`+${a} logs → Mill (refining)`); sfx.build(); this.pileVis(); return; }
    }
    // deposit rubble at quarry for refining
    if (this.qry) {
      const d = Phaser.Math.Distance.Between(px, py, this.qry.sprite.x, this.qry.sprite.y);
      if (d < RANGE && this.bp.rubble > 0) { const a = this.bp.rubble; this.bp.rubble = 0; S.qryInputRubble += a; this.msg(`+${a} rubble → Quarry (refining)`); sfx.build(); this.pileVis(); return; }
    }
    // shelter
    const shelterKinds = ['igloo', 'woodHouse', 'stoneHouse'];
    for (const b of this.blds) {
      if (!shelterKinds.includes(b.kind)) continue;
      const d = Phaser.Math.Distance.Between(px, py, b.sprite.x, b.sprite.y);
      if (d < RANGE) { this.enterShelter(b); return; }
    }
    // bushes
    for (const bu of this.world.bushes) {
      if (!bu.ready) continue;
      const d = Phaser.Math.Distance.Between(px, py, bu.sprite.x, bu.sprite.y);
      if (d < RANGE) {
        if (this.bpTotal() >= S.CAP) { this.msg('Backpack full!'); return; }
        this.bp.berries++; bu.ready = false; bu.timer = 0;
        bu.sprite.setTexture('bushHarvested'); sfx.hit();
        this.tweens.add({ targets: bu.sprite, scaleX: bu.sprite.scaleX * 0.85, scaleY: bu.sprite.scaleY * 0.85, duration: 80, yoyo: true });
        return;
      }
    }
    // resources
    let best: Res | null = null, bd = RANGE;
    for (const r of this.world.res) {
      if (!r.sprite.active) continue;
      // skip depleted resources (stumps / exhausted stones)
      if (r.ready === false) continue;
      const d = Phaser.Math.Distance.Between(px, py, r.sprite.x, r.sprite.y);
      if (d < bd) { bd = d; best = r; }
    }
    if (!best) return;
    const k = best.kind;

    // tool tier gating
    if (k === 'rubble' && S.toolTier < 1) { this.msg('Need Stone Tools to mine stone!'); return; }
    if (k === 'iron' && S.toolTier < 2) { this.msg('Need Iron Tools to mine iron!'); return; }

    if (this.bpTotal() >= S.CAP) { this.msg('Backpack full!'); return; }

    // yield multiplier: iron tools give 2x on wood/stone
    let yieldAmt = (k === 'logs' || k === 'rubble') && S.toolTier >= 2 ? 2 : 1;
    if (S.techEfficiency && (k === 'logs' || k === 'rubble' || k === 'iron')) yieldAmt += 1;
    const canAdd = Math.min(yieldAmt, S.CAP - this.bpTotal());
    this.bp[k] += canAdd;
    sfx.hit();

    // tool durability
    if ((k === 'logs' || k === 'rubble' || k === 'iron') && S.toolTier > 0) {
      S.toolDurability--;
      if (S.toolDurability <= 0) {
        S.toolTier = 0; S.toolDurability = 0; S.toolMaxDurability = 0;
        this.msg('⚠️ Your tools broke!');
      }
    }

    if (k === 'snow') {
      this.setPose(S.currentOutfit === 'steam' ? 'steamSnow' : 'playerSnow', 300);
      this.emitParticles(best.sprite.x, best.sprite.y, 'partStone', 3);
    }
    if (k === 'iron') {
      this.setPose(S.currentOutfit === 'steam' ? 'steamPick' : 'playerMine', 300);
      this.emitParticles(best.sprite.x, best.sprite.y, 'partIron');
      if (best.capacity !== undefined) {
        best.capacity--;
        if (best.capacity <= 0) {
          best.ready = false; best.timer = 0;
          best.sprite.setAlpha(0.3);
        } else {
          best.sprite.setTexture('ironOreHit');
          this.time.delayedCall(200, () => { if (best!.sprite.active) best!.sprite.setTexture('ironOre'); });
        }
      }
    }
    if (k === 'rubble') {
      this.setPose(S.currentOutfit === 'steam' ? 'steamPick' : 'playerMine', 300);
      this.emitParticles(best.sprite.x, best.sprite.y, 'partStone');
      // stone capacity system
      if (best.capacity !== undefined) {
        best.capacity -= yieldAmt;
        if (best.capacity <= 0) {
          best.ready = false; best.timer = 0;
          best.sprite.setAlpha(0.3);
          best.sprite.setTexture('rock');
        } else {
          best.sprite.setTexture('rockHit');
          this.time.delayedCall(200, () => { if (best!.sprite.active) best!.sprite.setTexture('rock'); });
        }
      } else {
        best.sprite.setTexture('rockHit');
        this.time.delayedCall(200, () => { if (best!.sprite.active) best!.sprite.setTexture('rock'); });
      }
    }
    if (k === 'logs') {
      this.setPose(S.currentOutfit === 'steam' ? 'steamAxe' : 'playerCut', 300);
      this.emitParticles(best.sprite.x, best.sprite.y, 'partWood');
      // tree capacity system
      best.capacity = (best.capacity ?? TREE_CAP) - yieldAmt;
      if (best.capacity! <= 0) {
        best.ready = false; best.timer = 0;
        best.sprite.setScale(0.06);
        best.sprite.setTexture('treeStump');
      } else {
        best.sprite.setTexture('treeHit');
        this.time.delayedCall(250, () => { if (best!.sprite.active && best!.ready !== false) best!.sprite.setTexture(this.sOn ? 'treeBlizzard' : 'tree'); });
      }
    }
    this.tweens.add({ targets: best.sprite, scaleX: best.sprite.scaleX * 0.85, scaleY: best.sprite.scaleY * 0.85, duration: 80, yoyo: true });
  }

  /* ─── hunger & food ─── */
  private tickHunger(dt: number) {
    this.hungerClock += dt;
    if (this.hungerClock >= HUNGER_TICK) {
      this.hungerClock -= HUNGER_TICK;
      if (this.playerHunger > 0) this.playerHunger--;
      else { this.playerHp = Math.max(0, this.playerHp - 1); if (this.playerHp <= 0) this.gameOver('starved'); }
    }
  }
  private eatBerry() {
    if (this.bp.berries <= 0) { this.msg('No berries!'); return; }
    this.bp.berries--; this.playerHunger = Math.min(this.MAX_HUNGER, this.playerHunger + 20);
    sfx.eat(); this.msg(`Ate berry! +20 hunger (${this.playerHunger}/${this.MAX_HUNGER})`);
  }
  private eatMeat() {
    if (this.bp.meat <= 0) { this.msg('No meat!'); return; }
    this.bp.meat--; this.playerHunger = Math.min(this.MAX_HUNGER, this.playerHunger + 50);
    sfx.eat(); this.msg(`Ate meat! +50 hunger (${this.playerHunger}/${this.MAX_HUNGER})`);
  }


  /* ─── refinement & fuel ─── */
  private tickRefinement(dt: number) {
    // mill: logs → planks
    if (this.mill) {
      this.millTimer += dt;
      if (this.millTimer >= REFINE_TICK && S.millInputLogs > 0 && S.basePlanks < MILL_PLANK_CAP) {
        this.millTimer = 0; S.millInputLogs--; S.basePlanks++;
      }
    }
    // quarry: rubble → bricks
    if (this.qry) {
      this.qryTimer += dt;
      if (this.qryTimer >= REFINE_TICK && S.qryInputRubble > 0 && S.baseBricks < QRY_BRICK_CAP) {
        this.qryTimer = 0; S.qryInputRubble--; S.baseBricks++;
      }
    }
  }
  private tickFuel(dt: number) {
    if (!S.furnaceEverFueled) return; // don't consume fuel until player has deposited logs
    this.fuelTimer += dt;
    if (this.fuelTimer >= FUEL_TICK) {
      this.fuelTimer = 0;
      if (S.baseLogs > 0) {
        S.baseLogs--;
        S.furnaceLit = true;
        if (this.furnace) this.furnace.sprite.clearTint();
        const lightR = [380, 500, 800][this.furnaceLvl - 1];
        this.fLight.setRadius(lightR);
      } else {
        S.furnaceLit = false;
        if (this.furnace) this.furnace.sprite.setTint(0x667788);
        this.fLight.setRadius(0);
      }
      this.pileVis();
    }
  }

  /* ─── temperature ─── */
  private tickTemperature(dt: number) {
    const sec = dt / 1000;
    let rate = 0; // per second
    if (this.isInside) {
      rate = 5; // shelter regen
      this.inDeepFreeze = false;
    } else {
      // near furnace?
      const heatRadius = [150, 300, 600][this.furnaceLvl - 1];
      const furnaceDist = this.furnace ? Phaser.Math.Distance.Between(this.p.x, this.p.y, this.furnace.sprite.x, this.furnace.sprite.y) : 9999;
      const nearFurnace = S.furnaceLit && furnaceDist < heatRadius;
      // near any torch?
      let nearTorch = false;
      for (const t of this.placedTorches) {
        if (Phaser.Math.Distance.Between(this.p.x, this.p.y, t.x, t.y) < 600) { nearTorch = true; break; }
      }
      // deep freeze: in fog (far from furnace AND all torches)
      this.inDeepFreeze = !nearFurnace && !nearTorch;
      if (nearFurnace) {
        rate = 2;
      } else if (nearTorch) {
        rate = 1; // torches warm but less than furnace
      } else {
        // DEEP FREEZE: drain fast
        rate = -10;
      }
      if (this.sOn && rate > -10) rate = Math.min(rate, -5);
      else if (this.isNight && rate > -10) rate = Math.min(rate, -2);
      // outfit cold protection: steam 30%, hooded 50%
      if (rate < 0) {
        if (S.currentOutfit === 'hooded') rate *= 0.5;
        else if (S.currentOutfit === 'steam') rate *= 0.7;
      }
    }
    this.playerTemp = Phaser.Math.Clamp(this.playerTemp + rate * sec, 0, this.MAX_TEMP);
    // freezing damage
    if (this.playerTemp <= 0) {
      this.playerHp = Math.max(0, this.playerHp - 2 * sec);
      if (this.playerHp <= 0) this.gameOver('froze');
    }
  }

  /* ─── pile visuals ─── */
  pileVis() {
    const anchor = this.furnace?.sprite;
    if (!anchor) return;
    // wood pile (raw logs near furnace)
    if (this.wPile) { this.wPile.destroy(); this.wPile = null; }
    if (this.wPileLbl) { this.wPileLbl.destroy(); this.wPileLbl = null; }
    if (S.baseLogs > 0) {
      const wx = anchor.x + 140, wy = anchor.y - 20;
      this.wPile = this.lit(this.add.sprite(wx, wy, 'woodPile').setScale(0.12));
      this.wPileLbl = this.add.text(wx, wy - 45, `🪵 ${S.baseLogs}`, { fontSize: '14px', color: '#ffe', fontFamily: 'Arial Black,Arial', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(9000);
    }
    // stone pile (raw rubble near furnace)
    if (this.sPile) { this.sPile.destroy(); this.sPile = null; }
    if (this.sPileLbl) { this.sPileLbl.destroy(); this.sPileLbl = null; }
    if (S.baseRubble > 0) {
      const sx = anchor.x + 140, sy = anchor.y + 60;
      this.sPile = this.lit(this.add.sprite(sx, sy, 'stonePile').setScale(0.12));
      this.sPileLbl = this.add.text(sx, sy - 45, `🪨 ${S.baseRubble}`, { fontSize: '14px', color: '#ffe', fontFamily: 'Arial Black,Arial', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(9000);
    }
  }

  /* ─── HUD ─── */
  private createHUD() {
    this.hudEl = createStatusHUD(S.CAP);
    document.body.appendChild(this.hudEl);
    // pause button
    const pauseBtn = document.createElement('button'); pauseBtn.id = 'pause-btn'; pauseBtn.textContent = '⏸';
    document.body.appendChild(pauseBtn);
    pauseBtn.onclick = () => this.togglePause();
    // pause overlay
    this.pauseOverlay = document.createElement('div'); this.pauseOverlay.id = 'pause-overlay';
    this.pauseOverlay.innerHTML = '<img src="/logo.jpg" class="pause-logo" /><div class="pause-text">⏸ PAUSED</div><div class="pause-sub">Press P or click ⏸ to resume</div>';
    document.body.appendChild(this.pauseOverlay);
    // P key for pause
    window.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P') this.togglePause();
      if ((e.key === 'r' || e.key === 'R') && this.buildings.bMode && (this.buildings.bMode.includes('Wall') || this.buildings.bMode.includes('Gate'))) {
        this.buildings.rotateBuildDir();
      }
    });
    const btns = createButtonsPanel();
    wireDropdowns(btns);
    document.body.appendChild(btns);
    const timer = document.createElement('div'); timer.id = 'hud-timer'; document.body.appendChild(timer);
    document.getElementById('b-mill')!.onclick = () => this.buildings.enterBld('mill', 'lumberMill', 0.10);
    document.getElementById('b-qry')!.onclick = () => this.buildings.enterBld('quarry', 'stoneQuarry', 0.10);
    document.getElementById('b-anvil')!.onclick = () => this.buildings.enterBld('anvil', 'anvilTex', 0.10);
    document.getElementById('b-ig')!.onclick = () => this.buildings.enterBld('igloo', 'igloo', 0.10);
    document.getElementById('b-wh')!.onclick = () => this.buildings.enterBld('woodHouse', 'woodHouse', 0.10);
    document.getElementById('b-sh')!.onclick = () => this.buildings.enterBld('stoneHouse', 'stoneHouse', 0.10);
    document.getElementById('b-wwall')!.onclick = () => this.buildings.enterBld('woodWall', 'woodWall', 0.07);
    document.getElementById('b-wgate')!.onclick = () => this.buildings.enterBld('woodGate', 'woodGate', 0.07);
    document.getElementById('b-swall')!.onclick = () => this.buildings.enterBld('stoneWall', 'stoneWall', 0.07);
    document.getElementById('b-sgate')!.onclick = () => this.buildings.enterBld('stoneGate', 'stoneGate', 0.07);
    document.getElementById('c-stools')!.onclick = () => this.crafting.craftStoneTools();
    document.getElementById('c-itools')!.onclick = () => this.crafting.craftIronTools();
    document.getElementById('c-bow')!.onclick = () => this.crafting.craftBow();
    document.getElementById('c-arr')!.onclick = () => this.crafting.craftArrows();
    document.getElementById('c-coat')!.onclick = () => this.crafting.craftCoat();
    document.getElementById('c-bag')!.onclick = () => this.crafting.craftBag();
    document.getElementById('c-torch')!.onclick = () => this.crafting.craftTorch();
    document.getElementById('b-torch')!.onclick = () => this.crafting.placeTorchItem();
    document.getElementById('b-trap')!.onclick = () => this.combat.placeTrap();
    document.getElementById('b-eat')!.onclick = () => this.eatBerry();
    document.getElementById('b-meat')!.onclick = () => this.eatMeat();
    document.getElementById('b-fup2')!.onclick = () => this.crafting.upgradeFurnace(2);
    document.getElementById('b-fup3')!.onclick = () => this.crafting.upgradeFurnace(3);
    document.getElementById('b-tracks')!.onclick = () => this.crafting.buildTracks();
    // drop buttons
    document.getElementById('d-w')!.onclick = () => this.dropItem('logs');
    document.getElementById('d-s')!.onclick = () => this.dropItem('rubble');
    document.getElementById('d-n')!.onclick = () => this.dropItem('snow');
    document.getElementById('d-b')!.onclick = () => this.dropItem('berries');
    document.getElementById('d-a')!.onclick = () => this.dropItem('arrows');
    document.getElementById('d-p')!.onclick = () => this.dropItem('pelts');
    document.getElementById('d-m')!.onclick = () => this.dropItem('meat');
    document.getElementById('d-i')!.onclick = () => this.dropItem('iron');
    document.getElementById('d-t')!.onclick = () => this.dropItem('torches');
    document.getElementById('b-rtable')!.onclick = () => this.buildings.enterBld('researchTable', 'texResearchTable', 0.10);
    document.getElementById('c-sled')!.onclick = () => this.crafting.craftSled();
    document.getElementById('r-thick')!.onclick = () => this.crafting.researchThickSkin();
    document.getElementById('r-eff')!.onclick = () => this.crafting.researchEfficiency();
    document.getElementById('h-lumber')!.onclick = () => this.world.hireLumberjack();
    document.getElementById('h-miner')!.onclick = () => this.world.hireMiner();
    this.msgEl = document.createElement('div'); this.msgEl.id = 'game-msg'; document.body.appendChild(this.msgEl);
    // save button (hidden until inside shelter)
    this.saveBtnEl = document.createElement('button'); this.saveBtnEl.id = 'btn-save';
    this.saveBtnEl.textContent = '💾 Save Game'; this.saveBtnEl.style.display = 'none';
    btns.appendChild(this.saveBtnEl);
    this.saveBtnEl.onclick = () => this.saveGame();

    // ── Virtual Touch Controls ──
    createTouchControls();

    // D-pad event wiring
    const bindDir = (id: string, vxVal: number, vyVal: number) => {
      const el = document.getElementById(id)!;
      const start = () => { this.touchVx = vxVal; this.touchVy = vyVal; };
      const end = () => { if (this.touchVx === vxVal) this.touchVx = 0; if (this.touchVy === vyVal) this.touchVy = 0; };
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); start(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.stopPropagation(); end(); });
      el.addEventListener('touchcancel', end);
      el.addEventListener('mousedown', (e) => { e.stopPropagation(); start(); });
      el.addEventListener('mouseup', end);
      el.addEventListener('mouseleave', end);
    };
    bindDir('dpad-up', 0, -1);
    bindDir('dpad-down', 0, 1);
    bindDir('dpad-left', -1, 0);
    bindDir('dpad-right', 1, 0);

    // Action button
    const actEl = document.getElementById('touch-action')!;
    actEl.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.touchAction = true; }, { passive: false });
    actEl.addEventListener('touchend', (e) => { e.stopPropagation(); this.touchAction = false; });
    actEl.addEventListener('touchcancel', () => { this.touchAction = false; });
    actEl.addEventListener('mousedown', (e) => { e.stopPropagation(); this.touchAction = true; });
    actEl.addEventListener('mouseup', () => { this.touchAction = false; });
    actEl.addEventListener('mouseleave', () => { this.touchAction = false; });

    // Trap button
    const trapEl = document.getElementById('touch-trap')!;
    trapEl.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.combat.placeTrap(); }, { passive: false });
    trapEl.addEventListener('mousedown', (e) => { e.stopPropagation(); this.combat.placeTrap(); });

    // Rotate button
    const rotEl = document.getElementById('touch-rotate')!;
    const doRotate = () => {
      this.buildings.rotateBuildDir();
    };
    rotEl.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); doRotate(); }, { passive: false });
    rotEl.addEventListener('mousedown', (e) => { e.stopPropagation(); doRotate(); });

    // Cancel button
    const cancelEl = document.getElementById('touch-cancel')!;
    cancelEl.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.buildings.cancelBld(); }, { passive: false });
    cancelEl.addEventListener('mousedown', (e) => { e.stopPropagation(); this.buildings.cancelBld(); });

    // Stop propagation on dpad/action containers so canvas doesn't get touch events
    document.getElementById('touch-dpad')!.addEventListener('touchstart', (e: TouchEvent) => e.stopPropagation(), { passive: false });
    document.getElementById('touch-actions')!.addEventListener('touchstart', (e: TouchEvent) => e.stopPropagation(), { passive: false });
  }
  private dropItem(key: 'logs' | 'rubble' | 'snow' | 'berries' | 'arrows' | 'pelts' | 'meat' | 'iron' | 'torches') {
    if (this.bp[key] <= 0) { this.msg(`No ${key} to drop!`); return; }
    this.bp[key]--;
    this.msg(`Dropped 1 ${key}`);
  }
  private togglePause() {
    this.paused = !this.paused;
    if (this.pauseOverlay) this.pauseOverlay.style.display = this.paused ? 'flex' : 'none';
    if (this.paused) { this.pb.setVelocity(0, 0); if (this.waddle) { this.waddle.stop(); this.waddle = null; this.p.setScale(this.psc()); } }
  }
  private refreshHUD() {
    hudRefresh({
      playerHp: this.playerHp, maxHp: this.MAX_HP,
      playerHunger: this.playerHunger, maxHunger: this.MAX_HUNGER,
      playerTemp: this.playerTemp, maxTemp: this.MAX_TEMP,
      bp: { ...this.bp }, bpTotal: this.bpTotal(), cap: S.CAP,
      toolTier: S.toolTier, toolDurability: S.toolDurability, toolMaxDurability: S.toolMaxDurability,
      hasBow: S.hasBow, bowDurability: S.bowDurability, inDeepFreeze: this.inDeepFreeze,
      baseLogs: S.baseLogs, baseRubble: S.baseRubble, basePlanks: S.basePlanks, baseBricks: S.baseBricks, millInputLogs: S.millInputLogs, qryInputRubble: S.qryInputRubble,
      hasMill: !!this.mill, hasQry: !!this.qry, hasAnvil: !!this.anvil,
      hasResearchTable: !!this.researchTable,
      currentOutfit: S.currentOutfit, hasBag: S.hasBag, hasSled: S.hasSled, techThickSkin: S.techThickSkin, techEfficiency: S.techEfficiency,
      furnaceLvl: this.furnaceLvl, furnaceMobile: S.furnaceMobile,
      hasWorkerForMill: this.world.hasWorkerFor('mill'),
      hasWorkerForQry: this.world.hasWorkerFor('quarry'),
      stormOn: this.sOn, stormElapsed: this.world.sElap,
    });
  }
  msg(t: string) {
    this.msgEl.textContent = t; this.msgEl.style.opacity = '1';
    if (this.msgT) clearTimeout(this.msgT);
    this.msgT = window.setTimeout(() => { this.msgEl.style.opacity = '0'; }, 3000);
  }

  /* ─── shelter ─── */
  private enterShelter(b: Bld) {
    this.isInside = b; this.p.setAlpha(0.2); this.pb.setVelocity(0, 0);
    this.p.setPosition(b.sprite.x, b.sprite.y + 5);
    const names: Record<string, string> = { igloo: 'Igloo', woodHouse: 'Wood House', stoneHouse: 'Stone House' };
    this.msg(`Entered ${names[b.kind] || b.kind}. Press Space to exit.`);
    if (this.saveBtnEl) this.saveBtnEl.style.display = '';
  }
  exitShelter() {
    if (!this.isInside) return; const b = this.isInside; this.isInside = null;
    this.p.setAlpha(1); this.p.setPosition(b.sprite.x, b.sprite.y + b.sprite.displayHeight / 2 + 20);
    this.msg('Exited shelter.');
    if (this.saveBtnEl) this.saveBtnEl.style.display = 'none';
  }
  gameOver(cause: string = 'froze') {
    this.exitShelter(); this.p.setAlpha(1);
    this.scene.pause();
    const msgs: Record<string, string> = { froze: 'You froze to death!', starved: 'You starved to death!', mauled: 'You were mauled by wolves!' };
    const el = document.createElement('div'); el.id = 'game-over';
    el.innerHTML = `<div>☠️ GAME OVER</div><div style="font-size:18px;margin-top:8px">${msgs[cause] || msgs.froze}</div>
      <button id="restart-btn" style="margin-top:24px;padding:12px 36px;font-size:20px;background:#cc3344;color:#fff;border:none;border-radius:8px;cursor:pointer;pointer-events:auto;transition:transform .15s">⟳ Restart</button>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.style.opacity = '1');
    document.getElementById('restart-btn')!.onclick = () => {
      el.style.opacity = '0'; setTimeout(() => el.remove(), 600);
      this.scene.resume();
      this.showMainMenu();
      this.scene.pause();
    };
  }

  /* ─── save / load ─── */
  private saveGame() {
    const buildings: GameState['buildings'] = [];
    for (const b of this.blds) {
      if (b.kind === 'furnace') continue;
      buildings.push({ x: b.sprite.x, y: b.sprite.y, kind: b.kind, hp: b.hp, tex: b.sprite.texture.key });
    }
    const state: GameState = {
      player: { x: this.p.x, y: this.p.y, hp: this.playerHp, hunger: this.playerHunger, temp: this.playerTemp },
      bp: { ...this.bp },
      base: { baseLogs: S.baseLogs, baseRubble: S.baseRubble, basePlanks: S.basePlanks, baseBricks: S.baseBricks, millInputLogs: S.millInputLogs, qryInputRubble: S.qryInputRubble },
      progression: { hasBow: S.hasBow, currentOutfit: S.currentOutfit, hasBag: S.hasBag, furnaceLvl: this.furnaceLvl, furnaceEverFueled: S.furnaceEverFueled, furnaceLit: S.furnaceLit, toolTier: S.toolTier, toolDurability: S.toolDurability, toolMaxDurability: S.toolMaxDurability, bowDurability: S.bowDurability, glacialWallMelted: S.glacialWallMelted, hasSled: S.hasSled, techThickSkin: S.techThickSkin, techEfficiency: S.techEfficiency, furnaceMobile: S.furnaceMobile },
      dayClock: this.world.dayClock,
      buildings,
      placedTorches: this.placedTorches.map(t => ({ x: t.x, y: t.y })),
      workers: this.world.workers.map(w => ({ type: w.type, bldKind: w.targetBld.kind })),
      furnacePos: this.furnace ? { x: this.furnace.sprite.x, y: this.furnace.sprite.y } : undefined
    };
    SaveManager.save(state);
    this.msg('💾 Game Saved!');
  }

  private loadGame() {
    const state = SaveManager.load();
    if (!state) { this.msg('No save found!'); return; }

    // player
    this.p.setPosition(state.player.x, state.player.y);
    this.playerHp = state.player.hp;
    this.playerHunger = state.player.hunger;
    this.playerTemp = state.player.temp;
    this.hungerClock = 0;

    // backpack
    this.bp = { ...state.bp };

    // base storage
    S.baseLogs = state.base.baseLogs;
    S.baseRubble = state.base.baseRubble;
    S.basePlanks = state.base.basePlanks;
    S.baseBricks = state.base.baseBricks;
    S.millInputLogs = state.base.millInputLogs;
    S.qryInputRubble = state.base.qryInputRubble;

    // progression
    S.hasBow = state.progression.hasBow;
    S.currentOutfit = state.progression.currentOutfit ?? 'steam';
    this.p.setTexture(S.currentOutfit === 'steam' ? 'steamIdle' : 'playerIdle');
    this.p.setScale(S.currentOutfit === 'steam' ? STEAM_PSC : PSC);
    S.hasBag = state.progression.hasBag ?? false;
    if (S.hasBag) S.CAP = 35; else S.CAP = 20;
    this.furnaceLvl = state.progression.furnaceLvl;
    S.furnaceEverFueled = state.progression.furnaceEverFueled;
    S.furnaceLit = state.progression.furnaceLit;
    S.toolTier = state.progression.toolTier ?? 0;
    S.toolDurability = state.progression.toolDurability ?? 0;
    S.toolMaxDurability = state.progression.toolMaxDurability ?? 0;
    S.bowDurability = state.progression.bowDurability ?? 0;
    S.glacialWallMelted = state.progression.glacialWallMelted ?? false;
    S.hasSled = state.progression.hasSled ?? false;
    if (S.hasSled) S.SPEED = 350; else S.SPEED = 220;
    S.techThickSkin = state.progression.techThickSkin ?? false;
    S.techEfficiency = state.progression.techEfficiency ?? false;
    if (S.techThickSkin) this.MAX_HP = 150;
    S.furnaceMobile = state.progression.furnaceMobile ?? false;

    // reposition furnace if mobile
    if (this.furnace && (state as any).furnacePos) {
      this.furnace.sprite.setPosition((state as any).furnacePos.x, (state as any).furnacePos.y);
      this.buildings.drawBar(this.furnace);
      this.fLight.setPosition(this.furnace.sprite.x, this.furnace.sprite.y);
    }
    if (S.furnaceMobile && this.furnace) this.furnace.sprite.setTint(0xffffcc);

    // world
    this.world.dayClock = state.dayClock;

    // destroy existing non-furnace buildings
    for (const b of [...this.blds]) {
      if (b.kind === 'furnace') continue;
      b.sprite.destroy(); b.bar.destroy(); b.lbl.destroy();
    }
    this.blds = this.blds.filter(b => b.kind === 'furnace');
    this.mill = null; this.qry = null; this.anvil = null; this.researchTable = null;

    // destroy existing torches
    for (const t of this.placedTorches) { t.sprite.destroy(); this.lights.removeLight(t.light); }
    this.placedTorches = [];

    // rebuild saved buildings
    for (const sb of state.buildings) {
      const texMap: Record<string, string> = { mill: 'lumberMill', quarry: 'stoneQuarry', igloo: 'igloo', woodHouse: 'woodHouse', stoneHouse: 'stoneHouse', anvil: 'anvilTex', researchTable: 'texResearchTable' };
      const isWG = ['woodWall', 'woodGate', 'stoneWall', 'stoneGate'].includes(sb.kind);
      const tex = isWG ? (sb.tex || sb.kind + 'East') : (texMap[sb.kind] || sb.kind);
      const sc = isWG ? 0.07 : 0.10;
      const bld = this.buildings.addBld(sb.x, sb.y, tex, sb.kind, sb.hp, this.buildings.getBldHp(sb.kind), sc);
      if (sb.kind === 'mill') this.mill = bld;
      if (sb.kind === 'quarry') this.qry = bld;
      if (sb.kind === 'anvil') this.anvil = bld;
      if (sb.kind === 'researchTable') this.researchTable = bld;
      if (isWG) {
        bld.sprite.setOrigin(0.5, 1);
        this.physics.add.existing(bld.sprite, true);
        const body = bld.sprite.body as Phaser.Physics.Arcade.StaticBody;
        body.setSize(bld.sprite.displayWidth * 0.8, bld.sprite.displayHeight * 0.3);
        body.setOffset(bld.sprite.displayWidth * 0.1, bld.sprite.displayHeight * 0.6);
        for (const w of this.wolves) this.physics.add.collider(w.sprite, bld.sprite);
        this.physics.add.collider(this.p, bld.sprite);
      }
    }

    // rebuild torches
    if (state.placedTorches) {
      for (const pt of state.placedTorches) {
        const sprite = this.lit(this.add.sprite(pt.x, pt.y, 'torchTex').setScale(0.12).setDepth(2));
        const light = this.lights.addLight(pt.x, pt.y, 500, 0xffaa44, 1.5);
        this.placedTorches.push({ sprite, light, x: pt.x, y: pt.y });
      }
    }

    // restore expanded fog safe zone for furnace level
    this.clearBaseFog();

    // rebuild workers
    for (const w of this.world.workers) w.sprite.destroy();
    this.world.workers = [];
    if (state.workers) {
      for (const sw of state.workers) {
        const bld = this.blds.find(b => b.kind === sw.bldKind);
        if (!bld) continue;
        const tint = sw.type === 'lumberjack' ? 0x88ff88 : 0xaaaaaa;
        const sx = bld.sprite.x + (Math.random() - 0.5) * 40;
        const sy = bld.sprite.y + 30;
        const sprite = this.lit(this.add.sprite(sx, sy, 'playerIdle').setScale(PSC).setTint(tint).setDepth(5));
        this.world.workers.push({ sprite, type: sw.type, targetBld: bld, timer: 0, angle: 0 });
      }
    }

    // glacial wall
    if (S.glacialWallMelted) {
      for (const s of this.glacialWallSprites) s.destroy();
      this.glacialWallSprites = [];
      if (this.glacialWallColliders) { this.glacialWallColliders.clear(true, true); this.glacialWallColliders = null; }
    }

    // furnace visuals
    if (S.furnaceLit) {
      if (this.furnace) this.furnace.sprite.clearTint();
      const lightR = [380, 500, 800][this.furnaceLvl - 1];
      this.fLight.setRadius(lightR);
    } else {
      if (this.furnace) this.furnace.sprite.setTint(0x667788);
      this.fLight.setRadius(0);
    }
    if (this.furnace) this.buildings.drawBar(this.furnace);
    this.pileVis();
    this.msg('💾 Game Loaded!');
  }

  private resetGame() {
    // reset globals
    S.baseLogs = 0; S.baseRubble = 0; S.basePlanks = 0; S.baseBricks = 0;
    S.millInputLogs = 0; S.qryInputRubble = 0;
    S.furnaceLit = true; S.furnaceEverFueled = false;
    S.hasBow = false; S.currentOutfit = 'steam'; S.hasBag = false; S.CAP = 20;
    S.toolTier = 0; S.toolDurability = 0; S.toolMaxDurability = 0;
    S.bowDurability = 0; S.glacialWallMelted = false;
    S.hasSled = false; S.SPEED = 220;
    S.techThickSkin = false; S.techEfficiency = false;
    S.furnaceMobile = false;

    // reset player
    this.p.setPosition(MW / 2, MH / 2 + 120);
    this.p.setAlpha(1);
    this.p.setTexture('steamIdle');
    this.p.setScale(STEAM_PSC);
    this.MAX_HP = 100;
    this.playerHp = this.MAX_HP;
    this.playerHunger = this.MAX_HUNGER;
    this.hungerClock = 0;
    this.healTimer = 0;
    this.playerTemp = this.MAX_TEMP;
    this.bp = { logs: 0, rubble: 0, snow: 0, berries: 0, arrows: 0, pelts: 0, meat: 0, iron: 0, torches: 0 };
    this.world.dayClock = 0;
    this.isInside = null;
    this.furnaceLvl = 1;

    // destroy non-furnace buildings
    for (const b of [...this.blds]) {
      if (b.kind === 'furnace') continue;
      b.sprite.destroy(); b.bar.destroy(); b.lbl.destroy();
    }
    this.blds = this.blds.filter(b => b.kind === 'furnace');
    this.mill = null; this.qry = null; this.anvil = null; this.researchTable = null;

    // destroy torches
    for (const t of this.placedTorches) { t.sprite.destroy(); this.lights.removeLight(t.light); }
    this.placedTorches = [];

    // destroy workers
    for (const w of this.world.workers) w.sprite.destroy();
    this.world.workers = [];

    // destroy deer
    for (const d of this.deers) d.sprite.destroy();
    this.deers = [];

    // rebuild glacial wall
    this.buildGlacialWall();

    // furnace visuals
    if (this.furnace) {
      this.furnace.sprite.clearTint();
      this.buildings.drawBar(this.furnace);
    }
    this.fLight.setRadius(380);
    this.pileVis();
  }

  /* ─── main menu ─── */
  private showMainMenu() {
    // hide save button
    if (this.saveBtnEl) this.saveBtnEl.style.display = 'none';

    // pause scene
    if (!this.scene.isPaused()) this.scene.pause();

    // if menu already exists, just show it
    if (this.menuEl) {
      this.menuEl.style.display = 'flex';
      // update load button state
      const loadBtn = this.menuEl.querySelector('#menu-load') as HTMLButtonElement;
      if (loadBtn) {
        const hasSave = !!localStorage.getItem('frozenFortuneSave');
        loadBtn.disabled = !hasSave;
        loadBtn.style.opacity = hasSave ? '1' : '0.4';
        loadBtn.style.cursor = hasSave ? 'pointer' : 'not-allowed';
      }
      // hide settings
      if (this.settingsEl) this.settingsEl.style.display = 'none';
      const menuBtns = this.menuEl.querySelector('#menu-buttons') as HTMLDivElement;
      if (menuBtns) menuBtns.style.display = 'flex';
      return;
    }

    const hasSave = !!localStorage.getItem('frozenFortuneSave');

    this.menuEl = document.createElement('div');
    this.menuEl.id = 'main-menu';
    this.menuEl.innerHTML = `
      <img src="/logo.jpg" alt="Frozen Fortune" id="menu-logo" />
      <button id="menu-gear" title="Settings">⚙️</button>
      <div id="menu-buttons">
        <button class="menu-btn" id="menu-new">❄️ New Game</button>
        <button class="menu-btn" id="menu-load" ${hasSave ? '' : 'disabled'}
          style="${hasSave ? '' : 'opacity:0.4;cursor:not-allowed'}">💾 Load Game</button>
      </div>
      <div id="settings-panel" style="display:none">
        <h3>⚙️ Settings</h3>
        <label>🔊 Volume</label>
        <input type="range" id="vol-slider" min="0" max="100" value="${Math.round(sfx.getVolume() * 200)}" />
        <span id="vol-value">${Math.round(sfx.getVolume() * 200)}%</span>
        <button class="menu-btn" id="settings-back">← Back</button>
      </div>
    `;
    document.body.appendChild(this.menuEl);

    const menuBtns = document.getElementById('menu-buttons')!;
    this.settingsEl = document.getElementById('settings-panel') as HTMLDivElement;

    // helper: fade out menu then callback
    const fadeOut = (cb: () => void) => {
      this.menuEl!.style.transition = 'opacity 0.6s ease';
      this.menuEl!.style.opacity = '0';
      setTimeout(() => {
        this.menuEl!.style.display = 'none';
        this.menuEl!.style.opacity = '1';
        this.menuEl!.style.transition = '';
        cb();
      }, 600);
    };

    // New Game
    document.getElementById('menu-new')!.onclick = () => {
      this.resetGame();
      fadeOut(() => {
        this.scene.resume();
        this.paused = false;
        if (this.pauseOverlay) this.pauseOverlay.style.display = 'none';
        this.msg('🏔️ A new adventure begins!');
      });
    };

    // Load Game
    document.getElementById('menu-load')!.onclick = () => {
      if (!localStorage.getItem('frozenFortuneSave')) return;
      this.loadGame();
      fadeOut(() => {
        this.scene.resume();
        this.paused = false;
        if (this.pauseOverlay) this.pauseOverlay.style.display = 'none';
      });
    };

    // Settings (gear button)
    document.getElementById('menu-gear')!.onclick = () => {
      menuBtns.style.display = 'none';
      this.settingsEl!.style.display = 'flex';
    };

    // Volume slider
    const slider = document.getElementById('vol-slider') as HTMLInputElement;
    const volVal = document.getElementById('vol-value')!;
    slider.oninput = () => {
      const v = parseInt(slider.value);
      sfx.setVolume(v / 200); // 0..100 maps to 0..0.5
      volVal.textContent = `${v}%`;
    };

    // Back from settings
    document.getElementById('settings-back')!.onclick = () => {
      this.settingsEl!.style.display = 'none';
      menuBtns.style.display = 'flex';
    };
  }
}

/* ── boot ── */
new Phaser.Game({
  type: Phaser.WEBGL,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#f0f4f8',
  parent: 'app',
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: Game,
});
