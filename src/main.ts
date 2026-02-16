import Phaser from 'phaser';
import './style.css';
import { SFX } from './sfx';

/* ── globals ── */
let baseLogs = 0, baseRubble = 0;
let basePlanks = 0, baseBricks = 0;
let millInputLogs = 0, qryInputRubble = 0;
let furnaceLit = true;
let furnaceEverFueled = false;
let hasBow = false, hasCoat = false, hasBag = false;
const sfx = new SFX();

const MW = 2400, MH = 2400, SPEED = 220, RANGE = 130, PSC = 0.09;
let CAP = 20;
const STORM_LEN = 15_000, STORM_TICK = 5_000;
const DAY_LEN = 60_000, NIGHT_LEN = 60_000, FULL_DAY = DAY_LEN + NIGHT_LEN;
const HUNGER_TICK = 2_000, BUSH_REGROW = 30_000, TREE_REGROW = 60_000, STONE_REGROW = 120_000;
const WOLF_N = 3, WOLF_RANGE = 300, WOLF_DMG = 15, WOLF_KB = 180, WOLF_CD = 1000;
const WOLF_SLOW = 40, WOLF_FAST = 80, WOLF_HP = 30;
const ARROW_SPEED = 400, ARROW_DMG = 15, SHOOT_SLOW = 500;
const WOLF_MAX_MAP = 6;
const TREE_CAP = 5, STONE_CAP = 20;
const FURNACE_LOG_CAP = 30, FURNACE_RUBBLE_CAP = 30;
const MILL_PLANK_CAP = 100, QRY_BRICK_CAP = 100;
const REFINE_TICK = 2_000, FUEL_TICK = 5_000;

interface Res { sprite: Phaser.GameObjects.Sprite; kind: 'logs' | 'rubble' | 'snow'; capacity?: number; ready?: boolean; timer?: number }
interface Bld { sprite: Phaser.GameObjects.Sprite; kind: string; hp: number; maxHp: number; bar: Phaser.GameObjects.Graphics; lbl: Phaser.GameObjects.Text }
interface Bush { sprite: Phaser.GameObjects.Sprite; ready: boolean; timer: number }
interface Wolf { sprite: Phaser.GameObjects.Sprite; body: Phaser.Physics.Arcade.Body; angle: number; cd: number; hp: number; stunTimer: number; attackTarget: Bld | null; attackCd: number }
interface Arrow { sprite: Phaser.GameObjects.Sprite; body: Phaser.Physics.Arcade.Body; vx: number; vy: number; life: number }
interface Trap { sprite: Phaser.GameObjects.Sprite; body: Phaser.Physics.Arcade.Body }
interface Deer { sprite: Phaser.GameObjects.Sprite; body: Phaser.Physics.Arcade.Body; angle: number; stunTimer: number }

interface GameState {
  player: { x: number; y: number; hp: number; hunger: number; temp: number };
  bp: { logs: number; rubble: number; snow: number; berries: number; arrows: number; pelts: number; meat: number };
  base: { baseLogs: number; baseRubble: number; basePlanks: number; baseBricks: number; millInputLogs: number; qryInputRubble: number };
  progression: { hasBow: boolean; hasCoat: boolean; hasBag: boolean; furnaceLvl: number; furnaceEverFueled: boolean; furnaceLit: boolean };
  dayClock: number;
  buildings: { x: number; y: number; kind: string; hp: number; tex?: string }[];
}

class Game extends Phaser.Scene {
  private p!: Phaser.GameObjects.Sprite;
  private pb!: Phaser.Physics.Arcade.Body;
  private waddle: Phaser.Tweens.Tween | null = null;
  private k!: Record<string, Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private bp = { logs: 0, rubble: 0, snow: 0, berries: 0, arrows: 0, pelts: 0, meat: 0 };
  private res: Res[] = [];
  private blds: Bld[] = [];
  private furnace: Bld | null = null;
  private mill: Bld | null = null;
  private qry: Bld | null = null;
  private wPile: Phaser.GameObjects.Sprite | null = null;
  private sPile: Phaser.GameObjects.Sprite | null = null;
  private wPileLbl: Phaser.GameObjects.Text | null = null;
  private sPileLbl: Phaser.GameObjects.Text | null = null;
  private bMode: string | null = null;
  private bPrev: Phaser.GameObjects.Sprite | null = null;
  private buildDir: 'East' | 'West' = 'East';
  // touch controls
  private touchVx = 0;
  private touchVy = 0;
  private touchAction = false;
  private gcd = 0;
  private playerHp = 100;
  private readonly MAX_HP = 100;
  private playerHunger = 100;
  private readonly MAX_HUNGER = 100;
  private hungerClock = 0;
  private playerTemp = 100;
  private readonly MAX_TEMP = 100;
  private furnaceLvl = 1;
  private millTimer = 0;
  private qryTimer = 0;
  private fuelTimer = 0;
  private isInside: Bld | null = null;
  // day/night
  private dayClock = 0;
  private isNight = false;
  private ambTarget = 1;
  private ambCurrent = 1;
  private dayLabel!: Phaser.GameObjects.Text;
  // storm
  private sOn = false;
  private sElap = 0;
  private sDmg = 0;
  private sOvr!: Phaser.GameObjects.Rectangle;
  private sLbl!: Phaser.GameObjects.Text;
  // lighting
  private pLight!: Phaser.GameObjects.Light;
  private fLight!: Phaser.GameObjects.Light;
  // world
  private bushes: Bush[] = [];
  private wolves: Wolf[] = [];
  private projectiles: Arrow[] = [];
  private traps: Trap[] = [];
  private deers: Deer[] = [];
  private groundItems: Phaser.GameObjects.Sprite[] = [];
  private healTimer = 0;

  // combat
  private shootSlow = 0;
  // action pose
  private poseTimer = 0;
  // build timer
  private building: { kind: string; tex: string; sc: number; wx: number; wy: number; dur: number; elapsed: number; bar: Phaser.GameObjects.Graphics; bgBar: Phaser.GameObjects.Graphics; lbl: Phaser.GameObjects.Text; paused: boolean; ghost: Phaser.GameObjects.Sprite | null } | null = null;
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

  constructor() { super('Game'); }
  private lit<T extends Phaser.GameObjects.Sprite>(s: T): T { s.setPipeline('Light2D'); return s; }
  private bpTotal(): number { return this.bp.logs + this.bp.rubble + this.bp.snow + this.bp.berries + this.bp.arrows + this.bp.pelts + this.bp.meat; }
  /** Total logs available (backpack + furnace storage) */
  private totalLogs(): number { return this.bp.logs + baseLogs; }
  /** Total rubble available (backpack + furnace storage) */
  private totalRubble(): number { return this.bp.rubble + baseRubble; }
  /** Spend n logs: deducts from backpack first, then furnace storage */
  private spendLogs(n: number) {
    const fromBp = Math.min(this.bp.logs, n); this.bp.logs -= fromBp; n -= fromBp;
    if (n > 0) { baseLogs -= n; this.pileVis(); }
  }
  /** Spend n rubble: deducts from backpack first, then furnace storage */
  private spendRubble(n: number) {
    const fromBp = Math.min(this.bp.rubble, n); this.bp.rubble -= fromBp; n -= fromBp;
    if (n > 0) { baseRubble -= n; this.pileVis(); }
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
    this.load.image('deer', '/deer.png');
    this.load.image('player', '/player.png');
    // action sprites
    this.load.image('playerIdle', '/player.png');
    this.load.image('playerCut', '/Player_cutting.png');
    this.load.image('playerMine', '/PLayer_mining.png');
    this.load.image('playerShoot', '/PLayer_Shooting.png');
    this.load.image('treeStump', '/Tree_stump.png');
    this.load.image('bowGround', '/Bow_and_Arrow_ground.png');
    this.load.image('playerSnow', '/Player_snow.png');
    this.load.image('playerBuilding', '/PLayer_building.png');
    this.load.image('playerBuilding2', '/Player_Building_2.png');
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
  }

  create() {
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

    // player – use playerIdle as default
    this.p = this.lit(this.add.sprite(MW / 2, MH / 2 + 120, 'playerIdle').setScale(PSC));
    this.physics.add.existing(this.p);
    this.pb = this.p.body as Phaser.Physics.Arcade.Body;
    this.pb.setCollideWorldBounds(true);
    this.pb.setSize(22, 10).setOffset(3, 34);
    this.cameras.main.startFollow(this.p, true, 0.09, 0.09);

    this.furnace = this.addBld(MW / 2, MH / 2 - 80, 'baseFurnace', 'furnace', 999, 999, 0.22);
    this.scatter();
    this.spawnWolves();
    this.spawnDeer();

    // input
    const kb = this.input.keyboard!;
    this.k = { W: kb.addKey('W'), A: kb.addKey('A'), S: kb.addKey('S'), D: kb.addKey('D'), SP: kb.addKey('SPACE') };
    this.cursors = kb.createCursorKeys();
    kb.addKey('ESC').on('down', () => this.cancelBld());
    kb.addKey('F').on('down', () => this.eatBerry());
    kb.addKey('E').on('down', () => this.eatMeat());
    kb.addKey('T').on('down', () => this.placeTrap());
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this.bMode && ptr.leftButtonDown()) { this.placeBld(ptr.worldX, ptr.worldY); return; }
      if (this.bMode && ptr.rightButtonDown()) { this.cancelBld(); return; }
      if (ptr.leftButtonDown()) this.shootArrow(ptr);
    });

    // day label
    const cam = this.cameras.main;
    this.dayLabel = this.add.text(cam.width / 2, 20, '', { fontSize: '16px', color: '#ffe', fontFamily: 'Arial', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(9002);

    this.sOvr = this.add.rectangle(cam.width / 2, cam.height / 2, cam.width + 200, cam.height + 200, 0xaaddff, 0)
      .setScrollFactor(0).setDepth(9000);
    this.sLbl = this.add.text(cam.width / 2, 50, '❄️ BLIZZARD! ❄️', { fontSize: '32px', color: '#fff', fontFamily: 'Arial Black,Arial', stroke: '#1a3a5c', strokeThickness: 5 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(9001).setAlpha(0);

    this.createHUD();

    // show main menu on boot — delay 1 frame so scene is fully running
    this.time.delayedCall(1, () => {
      this.scene.pause();
      this.showMainMenu();
    });
  }

  update(_t: number, dt: number) {
    if (this.paused) return;
    const isBusy = !!this.building && !this.building.paused;
    // build timer
    if (this.building && !this.building.paused) { this.tickBuilding(dt); }

    // pose timer (skip if building)
    if (!isBusy) {
      this.poseTimer = Math.max(0, this.poseTimer - dt);
      if (this.poseTimer <= 0 && this.p.texture.key !== 'playerIdle') this.p.setTexture('playerIdle');
    }

    // movement
    const spdMul = this.shootSlow > 0 ? 0.5 : 1;
    this.shootSlow = Math.max(0, this.shootSlow - dt);
    if (isBusy) {
      this.pb.setVelocity(0, 0);
      if (this.waddle) { this.waddle.stop(); this.waddle = null; this.p.setScale(PSC); }
    } else if (!this.isInside) {
      let vx = 0, vy = 0;
      if (this.k.A.isDown || this.cursors.left.isDown || this.touchVx < 0) vx = -1;
      else if (this.k.D.isDown || this.cursors.right.isDown || this.touchVx > 0) vx = 1;
      if (this.k.W.isDown || this.cursors.up.isDown || this.touchVy < 0) vy = -1;
      else if (this.k.S.isDown || this.cursors.down.isDown || this.touchVy > 0) vy = 1;
      const len = Math.sqrt(vx * vx + vy * vy) || 1;
      this.pb.setVelocity(vx / len * SPEED * spdMul, vy / len * SPEED * spdMul);
      const moving = vx !== 0 || vy !== 0;
      if (moving && !this.waddle)
        this.waddle = this.tweens.add({ targets: this.p, scaleY: { from: PSC, to: PSC * 0.88 }, scaleX: { from: PSC, to: PSC * 1.12 }, duration: 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      else if (!moving && this.waddle) { this.waddle.stop(); this.waddle = null; this.p.setScale(PSC); }
      if (vx < 0) this.p.setFlipX(true); else if (vx > 0) this.p.setFlipX(false);
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
      if (this.waddle) { this.waddle.stop(); this.waddle = null; this.p.setScale(PSC); }
    }

    const actionHeld = !isBusy && (this.k.SP.isDown || this.touchAction);
    if (actionHeld) { this.gcd -= dt; if (this.gcd <= 0) { this.interact(); this.gcd = 400; } }
    else if (!isBusy) { this.gcd = Math.max(0, this.gcd - dt); }

    this.pLight.setPosition(this.p.x, this.p.y - 10);
    this.ambCurrent = Phaser.Math.Linear(this.ambCurrent, this.ambTarget, 0.0008 * dt);
    const c = Math.floor(this.ambCurrent * 255);
    this.lights.setAmbientColor(Phaser.Display.Color.GetColor(c, c, Math.min(255, Math.floor(c * 1.15))));

    // y-sort
    this.p.setDepth(this.p.y);
    for (const r of this.res) r.sprite.setDepth(r.sprite.y);
    for (const b of this.blds) { b.sprite.setDepth(b.sprite.y); b.bar.setDepth(b.sprite.y + 1); b.lbl.setDepth(b.sprite.y + 1); }
    for (const bu of this.bushes) bu.sprite.setDepth(bu.sprite.y);
    for (const w of this.wolves) w.sprite.setDepth(w.sprite.y);
    for (const de of this.deers) de.sprite.setDepth(de.sprite.y);

    if (this.bMode && this.bPrev) {
      const ptr = this.input.activePointer;
      const isWallGate = this.bMode.includes('Wall') || this.bMode.includes('Gate');
      if (isWallGate) {
        const gx = Math.round(ptr.worldX / 40) * 40;
        const gy = Math.round(ptr.worldY / 20) * 20;
        this.bPrev.setPosition(gx, gy);
      } else {
        this.bPrev.setPosition(ptr.worldX, ptr.worldY);
      }
    }

    this.tickDayNight(dt);
    this.tickStorm(dt);
    this.tickHunger(dt);
    this.tickTemperature(dt);
    this.tickBushes(dt);
    this.tickResources(dt);
    this.tickRefinement(dt);
    this.tickFuel(dt);
    this.tickWolves(dt);
    this.tickDeers(dt);
    this.tickProjectiles(dt);
    // HP regen: if well-fed and warm
    if (this.playerHunger > 80 && this.playerTemp > 80) {
      this.healTimer += dt;
      if (this.healTimer >= 1000) { this.healTimer = 0; this.playerHp = Math.min(this.playerHp + 1, this.MAX_HP); }
    } else { this.healTimer = 0; }
    this.refreshHUD();
  }

  /* ─── player pose helper ─── */
  private setPose(tex: string, dur: number) {
    this.p.setTexture(tex);
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
  }

  /* ─── particles ─── */
  private emitParticles(x: number, y: number, tex: string, count = 6) {
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
    g.lineStyle(1, 0xcddceb, 0.08);
    for (let i = 0; i < 60; i++) {
      const sx = rng(0, MW), sy = rng(0, MH);
      g.lineBetween(sx, sy, sx + rng(40, 150), sy + rng(-5, 5));
    }
  }

  /* ─── resources ─── */
  private scatter() {
    const rng = (a: number, b: number) => Phaser.Math.Between(a, b);
    const cx = MW / 2, cy = MH / 2;
    const far = (x: number, y: number) => Phaser.Math.Distance.Between(x, y, cx, cy) > 450;
    // track all placed positions so we can enforce minimum spacing
    const placed: { x: number; y: number }[] = [];
    const MIN_DIST = 80; // minimum distance between any two resource objects
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
        const r: Res = { sprite: this.lit(this.add.sprite(x, y, tex).setScale(sc)), kind };
        if (cap !== undefined) { r.capacity = cap; r.ready = true; r.timer = 0; }
        this.res.push(r);
      }
    };
    mk('tree', 'logs', 35, 0.12, TREE_CAP);
    mk('rock', 'rubble', 20, 0.12, STONE_CAP);
    mk('snowPile', 'snow', 18, 0.12);
    for (let i = 0; i < 15; i++) {
      let x: number, y: number, tries = 0;
      do { x = rng(80, MW - 80); y = rng(80, MH - 80); tries++; } while ((!far(x, y) || !spaced(x, y)) && tries < 200);
      placed.push({ x, y });
      this.bushes.push({ sprite: this.lit(this.add.sprite(x, y, 'bushFull').setScale(0.12)), ready: true, timer: 0 });
    }
  }

  /* ─── resource regrowth ─── */
  private tickResources(dt: number) {
    for (const r of this.res) {
      if (r.ready !== false) continue;
      r.timer = (r.timer ?? 0) + dt;
      if (r.kind === 'logs' && r.timer >= TREE_REGROW) {
        r.ready = true; r.capacity = TREE_CAP; r.timer = 0;
        r.sprite.setScale(0.12);
        r.sprite.setTexture(this.sOn ? 'treeBlizzard' : 'tree');
      }
      if (r.kind === 'rubble' && r.timer >= STONE_REGROW) {
        r.ready = true; r.capacity = STONE_CAP; r.timer = 0;
        r.sprite.setScale(0.12);
        r.sprite.setTexture('rock');
        r.sprite.setAlpha(1);
      }
    }
  }

  /* ─── wolves ─── */
  private spawnWolves() {
    const cx = MW / 2, cy = MH / 2;
    for (let i = 0; i < WOLF_N; i++) this.spawnOneWolf(cx, cy, 800);
  }
  private spawnOneWolf(avoidX: number, avoidY: number, minDist: number) {
    let x: number, y: number;
    do { x = Phaser.Math.Between(100, MW - 100); y = Phaser.Math.Between(100, MH - 100); }
    while (Phaser.Math.Distance.Between(x, y, avoidX, avoidY) < minDist);
    const sprite = this.lit(this.add.sprite(x, y, 'wolfDay').setScale(0.12));
    this.physics.add.existing(sprite);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    for (const b of this.blds) {
      if (b.kind === 'fence') this.physics.add.collider(sprite, b.sprite);
    }
    this.wolves.push({ sprite, body, angle: Math.random() * Math.PI * 2, cd: 0, hp: WOLF_HP, stunTimer: 0, attackTarget: null, attackCd: 0 });
  }

  /* ─── deer ─── */
  private spawnDeer() {
    const cx = MW / 2, cy = MH / 2;
    const n = Phaser.Math.Between(4, 5);
    for (let i = 0; i < n; i++) this.spawnOneDeer(cx, cy, 600);
  }
  private spawnOneDeer(avoidX: number, avoidY: number, minDist: number) {
    let x: number, y: number;
    do { x = Phaser.Math.Between(100, MW - 100); y = Phaser.Math.Between(100, MH - 100); }
    while (Phaser.Math.Distance.Between(x, y, avoidX, avoidY) < minDist);
    const sprite = this.lit(this.add.sprite(x, y, 'deer').setScale(0.12));
    this.physics.add.existing(sprite);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    this.deers.push({ sprite, body, angle: Math.random() * Math.PI * 2, stunTimer: 0 });
  }
  private tickDeers(dt: number) {
    const px = this.p.x, py = this.p.y;
    for (const d of this.deers) {
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
      for (const w of this.wolves) {
        const wd = Phaser.Math.Distance.Between(d.sprite.x, d.sprite.y, w.sprite.x, w.sprite.y);
        if (wd < threatDist) { threatDist = wd; threatX = w.sprite.x; threatY = w.sprite.y; }
      }
      if (threatDist < 400) {
        // flee away from threat
        const fleeAngle = Math.atan2(d.sprite.y - threatY, d.sprite.x - threatX);
        d.angle = fleeAngle;
        const spd = SPEED * 0.9;
        d.body.setVelocity(Math.cos(fleeAngle) * spd, Math.sin(fleeAngle) * spd);
        d.sprite.setFlipX(d.body.velocity.x < 0);
      } else {
        // wander slowly
        if (Math.random() < 0.01) d.angle = Math.random() * Math.PI * 2;
        const wSpd = 30;
        d.body.setVelocity(Math.cos(d.angle) * wSpd, Math.sin(d.angle) * wSpd);
        d.sprite.setFlipX(d.body.velocity.x < 0);
      }
      // bounce off world edges
      if (d.sprite.x < 80 || d.sprite.x > MW - 80) d.angle = Math.PI - d.angle;
      if (d.sprite.y < 80 || d.sprite.y > MH - 80) d.angle = -d.angle;
      // trap collision
      for (let i = this.traps.length - 1; i >= 0; i--) {
        const tr = this.traps[i];
        if (Phaser.Math.Distance.Between(d.sprite.x, d.sprite.y, tr.sprite.x, tr.sprite.y) < 25) {
          d.stunTimer = 4000; d.body.setVelocity(0, 0);
          tr.sprite.destroy(); this.traps.splice(i, 1);
          this.msg('🪤 Deer trapped!'); break;
        }
      }
    }
  }
  private killDeer(d: Deer) {
    const dx = d.sprite.x, dy = d.sprite.y;
    if (this.bpTotal() < CAP) this.bp.meat += Math.min(2, CAP - this.bpTotal());
    if (this.bpTotal() < CAP) this.bp.pelts++;
    const lt = this.add.text(dx, dy - 20, '+2 🥩 Meat  +1 🦊 Pelt', {
      fontSize: '13px', color: '#ffe', fontFamily: 'Arial', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(9999);
    this.tweens.add({ targets: lt, y: dy - 80, alpha: 0, duration: 2000, onComplete: () => lt.destroy() });
    this.emitParticles(dx, dy, 'partBlood');
    d.sprite.destroy();
    this.deers = this.deers.filter(x => x !== d);
    sfx.hit();
  }

  /* ─── day/night ─── */
  private tickDayNight(dt: number) {
    this.dayClock += dt;
    if (this.dayClock >= FULL_DAY) {
      this.dayClock -= FULL_DAY;
      if (this.wolves.length < WOLF_MAX_MAP) {
        this.spawnOneWolf(this.p.x, this.p.y, 600);
      }
    }
    // respawn deer if low
    if (this.deers.length < 4) {
      this.spawnOneDeer(this.p.x, this.p.y, 400);
    }
    const wasNight = this.isNight;
    this.isNight = this.dayClock >= DAY_LEN;
    this.ambTarget = this.isNight ? 0.55 : 1;
    if (this.isNight && !wasNight) { if (!this.sOn) this.startStorm(); }
    if (this.isNight) {
      this.dayLabel.setText(`🌙 Night: ${Math.ceil((FULL_DAY - this.dayClock) / 1000)}s`);
    } else {
      this.dayLabel.setText(`☀️ Day: ${Math.ceil((DAY_LEN - this.dayClock) / 1000)}s`);
    }
  }

  /* ─── interact ─── */
  private interact() {
    if (this.isInside) { this.exitShelter(); return; }
    const px = this.p.x, py = this.p.y;

    // resume paused build if near site
    if (this.building && this.building.paused) {
      const d = Phaser.Math.Distance.Between(px, py, this.building.wx, this.building.wy);
      if (d < 100) { this.resumeBuild(); return; }
    }

    // harvest stunned deer (melee)
    for (const deer of this.deers) {
      if (!deer.sprite.active) continue;
      const dd = Phaser.Math.Distance.Between(px, py, deer.sprite.x, deer.sprite.y);
      if (dd < RANGE && deer.stunTimer > 0) { this.killDeer(deer); return; }
    }

    // pick up ground items (bow)
    for (let i = this.groundItems.length - 1; i >= 0; i--) {
      const gi = this.groundItems[i];
      if (!gi.active) { this.groundItems.splice(i, 1); continue; }
      const d = Phaser.Math.Distance.Between(px, py, gi.x, gi.y);
      if (d < RANGE) {
        if (gi.texture.key === 'bowGround') {
          hasBow = true; gi.destroy(); this.groundItems.splice(i, 1);
          this.msg('🏹 Equipped Wooden Bow!'); sfx.build(); return;
        }
      }
    }

    // auto-deposit at furnace (logs + rubble, partial deposit)
    if (this.furnace && Phaser.Math.Distance.Between(px, py, this.furnace.sprite.x, this.furnace.sprite.y) < 350 && (this.bp.logs > 0 || this.bp.rubble > 0)) {
      const depL = Math.min(this.bp.logs, FURNACE_LOG_CAP - baseLogs);
      const depR = Math.min(this.bp.rubble, FURNACE_RUBBLE_CAP - baseRubble);
      if (depL > 0 || depR > 0) {
        this.bp.logs -= depL; this.bp.rubble -= depR;
        baseLogs += depL; baseRubble += depR;
        if (depL > 0) furnaceEverFueled = true;
        const parts: string[] = []; if (depL > 0) parts.push(`${depL} logs`); if (depR > 0) parts.push(`${depR} rubble`);
        this.msg(`+${parts.join(' + ')} → Furnace`); sfx.build(); this.pileVis(); return;
      } else {
        this.msg('Furnace storage full!');
      }
    }
    // deposit logs at mill for refining
    if (this.mill) {
      const d = Phaser.Math.Distance.Between(px, py, this.mill.sprite.x, this.mill.sprite.y);
      if (d < RANGE && this.bp.logs > 0) { const a = this.bp.logs; this.bp.logs = 0; millInputLogs += a; this.msg(`+${a} logs → Mill (refining)`); sfx.build(); this.pileVis(); return; }
    }
    // deposit rubble at quarry for refining
    if (this.qry) {
      const d = Phaser.Math.Distance.Between(px, py, this.qry.sprite.x, this.qry.sprite.y);
      if (d < RANGE && this.bp.rubble > 0) { const a = this.bp.rubble; this.bp.rubble = 0; qryInputRubble += a; this.msg(`+${a} rubble → Quarry (refining)`); sfx.build(); this.pileVis(); return; }
    }
    // shelter
    const shelterKinds = ['igloo', 'woodHouse', 'stoneHouse'];
    for (const b of this.blds) {
      if (!shelterKinds.includes(b.kind)) continue;
      const d = Phaser.Math.Distance.Between(px, py, b.sprite.x, b.sprite.y);
      if (d < RANGE) { this.enterShelter(b); return; }
    }
    // bushes
    for (const bu of this.bushes) {
      if (!bu.ready) continue;
      const d = Phaser.Math.Distance.Between(px, py, bu.sprite.x, bu.sprite.y);
      if (d < RANGE) {
        if (this.bpTotal() >= CAP) { this.msg('Backpack full!'); return; }
        this.bp.berries++; bu.ready = false; bu.timer = 0;
        bu.sprite.setTexture('bushHarvested'); sfx.hit();
        this.tweens.add({ targets: bu.sprite, scaleX: bu.sprite.scaleX * 0.85, scaleY: bu.sprite.scaleY * 0.85, duration: 80, yoyo: true });
        return;
      }
    }
    // resources
    let best: Res | null = null, bd = RANGE;
    for (const r of this.res) {
      if (!r.sprite.active) continue;
      // skip depleted resources (stumps / exhausted stones)
      if (r.ready === false) continue;
      const d = Phaser.Math.Distance.Between(px, py, r.sprite.x, r.sprite.y);
      if (d < bd) { bd = d; best = r; }
    }
    if (!best) return;
    const k = best.kind;
    if (this.bpTotal() >= CAP) { this.msg('Backpack full!'); return; }
    this.bp[k]++; sfx.hit();

    if (k === 'snow') {
      this.setPose('playerSnow', 300);
      this.emitParticles(best.sprite.x, best.sprite.y, 'partStone', 3);
    }
    if (k === 'rubble') {
      this.setPose('playerMine', 300);
      this.emitParticles(best.sprite.x, best.sprite.y, 'partStone');
      // stone capacity system
      if (best.capacity !== undefined) {
        best.capacity--;
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
      this.setPose('playerCut', 300);
      this.emitParticles(best.sprite.x, best.sprite.y, 'partWood');
      // tree capacity system
      best.capacity = (best.capacity ?? TREE_CAP) - 1;
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
  private tickBushes(dt: number) {
    for (const bu of this.bushes) { if (bu.ready) continue; bu.timer += dt; if (bu.timer >= BUSH_REGROW) { bu.ready = true; bu.timer = 0; bu.sprite.setTexture('bushFull'); } }
  }

  /* ─── refinement & fuel ─── */
  private tickRefinement(dt: number) {
    // mill: logs → planks
    if (this.mill) {
      this.millTimer += dt;
      if (this.millTimer >= REFINE_TICK && millInputLogs > 0 && basePlanks < MILL_PLANK_CAP) {
        this.millTimer = 0; millInputLogs--; basePlanks++;
      }
    }
    // quarry: rubble → bricks
    if (this.qry) {
      this.qryTimer += dt;
      if (this.qryTimer >= REFINE_TICK && qryInputRubble > 0 && baseBricks < QRY_BRICK_CAP) {
        this.qryTimer = 0; qryInputRubble--; baseBricks++;
      }
    }
  }
  private tickFuel(dt: number) {
    if (!furnaceEverFueled) return; // don't consume fuel until player has deposited logs
    this.fuelTimer += dt;
    if (this.fuelTimer >= FUEL_TICK) {
      this.fuelTimer = 0;
      if (baseLogs > 0) {
        baseLogs--;
        furnaceLit = true;
        if (this.furnace) this.furnace.sprite.clearTint();
        const lightR = [380, 500, 800][this.furnaceLvl - 1];
        this.fLight.setRadius(lightR);
      } else {
        furnaceLit = false;
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
    } else {
      // near furnace?
      const heatRadius = [150, 300, 600][this.furnaceLvl - 1];
      const nearFurnace = furnaceLit && this.furnace && Phaser.Math.Distance.Between(this.p.x, this.p.y, this.furnace.sprite.x, this.furnace.sprite.y) < heatRadius;
      if (nearFurnace) {
        rate = 2;
      } else if (this.sOn) {
        rate = -5;
      } else if (this.isNight) {
        rate = -2;
      } else {
        rate = -0.5;
      }
      // fur coat halves cold
      if (rate < 0 && hasCoat) rate *= 0.5;
    }
    this.playerTemp = Phaser.Math.Clamp(this.playerTemp + rate * sec, 0, this.MAX_TEMP);
    // freezing damage
    if (this.playerTemp <= 0) {
      this.playerHp = Math.max(0, this.playerHp - 2 * sec);
      if (this.playerHp <= 0) this.gameOver('froze');
    }
  }

  /* ─── combat: bow & arrow ─── */
  private shootArrow(ptr: Phaser.Input.Pointer) {
    if (!hasBow || this.bp.arrows <= 0 || this.isInside) return;
    this.bp.arrows--;
    this.shootSlow = SHOOT_SLOW;
    this.setPose('playerShoot', 500);
    const px = this.p.x, py = this.p.y;
    const ang = Phaser.Math.Angle.Between(px, py, ptr.worldX, ptr.worldY);
    const sprite = this.add.sprite(px, py, 'arrowTex').setDepth(9500).setRotation(ang);
    this.physics.add.existing(sprite);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const vx = Math.cos(ang) * ARROW_SPEED, vy = Math.sin(ang) * ARROW_SPEED;
    body.setVelocity(vx, vy);
    sfx.hit();
    this.projectiles.push({ sprite, body, vx, vy, life: 2000 });
  }
  private tickProjectiles(dt: number) {
    const rem: Arrow[] = [];
    for (const a of this.projectiles) {
      a.life -= dt;
      if (a.life <= 0 || !a.sprite.active) { rem.push(a); continue; }
      for (const w of this.wolves) {
        if (w.hp <= 0) continue;
        const d = Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, w.sprite.x, w.sprite.y);
        if (d < 30) {
          w.hp -= ARROW_DMG;
          this.emitParticles(w.sprite.x, w.sprite.y, 'partBlood');
          w.sprite.setTint(0xffffff);
          this.time.delayedCall(150, () => { if (w.sprite.active) w.sprite.clearTint(); });
          rem.push(a);
          if (w.hp <= 0) this.killWolf(w);
          break;
        }
      }
      // deer arrow hit
      if (!rem.includes(a)) {
        for (const deer of this.deers) {
          if (!deer.sprite.active) continue;
          const dd = Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, deer.sprite.x, deer.sprite.y);
          if (dd < 30) {
            rem.push(a);
            this.killDeer(deer);
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

  /* ─── combat: snare trap ─── */
  private placeTrap() {
    if (this.isInside) { this.msg("Can't place traps inside!"); return; }
    if (this.bp.logs < 2) { this.msg('Need 2 Logs (BP)'); return; }
    if (this.bp.meat < 1) { this.msg('Need 1 Meat (BP)'); return; }
    this.bp.logs -= 2; this.bp.meat -= 1;
    const sprite = this.add.sprite(this.p.x, this.p.y, 'snareTrap').setScale(0.12).setDepth(1);
    this.physics.add.existing(sprite, true);
    this.traps.push({ sprite, body: sprite.body as Phaser.Physics.Arcade.Body });
    sfx.build(); this.msg('Snare trap placed!');
  }

  /* ─── wolves ─── */
  private tickWolves(dt: number) {
    const px = this.p.x, py = this.p.y;
    const aggro = this.isNight || this.sOn;
    const spd = aggro ? WOLF_FAST : WOLF_SLOW;
    for (const w of this.wolves) {
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
      if (aggro && d < WOLF_RANGE && !this.isInside) {
        const ang = Phaser.Math.Angle.Between(w.sprite.x, w.sprite.y, px, py);
        w.body.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd);
        if (w.sprite.texture.key !== 'wolfNight') w.sprite.setTexture('wolfNight');
        w.sprite.setFlipX(px < w.sprite.x);
        if (Math.random() < 0.003) sfx.growl();
        // siege: if wolf is barely moving, it's blocked by a structure
        const vel = Math.sqrt(w.body.velocity.x ** 2 + w.body.velocity.y ** 2);
        if (vel < 10) {
          // find nearest building to attack
          if (!w.attackTarget || !w.attackTarget.sprite.active) {
            let closest: Bld | null = null, cd = 60;
            for (const b of this.blds) {
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
              this.drawBar(w.attackTarget);
              w.attackTarget.sprite.setTint(0xff6666);
              this.time.delayedCall(200, () => { if (w.attackTarget?.sprite.active) w.attackTarget.sprite.clearTint(); });
              this.emitParticles(w.attackTarget.sprite.x, w.attackTarget.sprite.y, 'partWood', 3);
              if (Math.random() < 0.4) sfx.growl();
              if (w.attackTarget.hp <= 0) {
                this.destroyBld(w.attackTarget);
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
          this.msg('🪤 Wolf trapped!'); break;
        }
      }
      if (!this.isInside && w.cd <= 0 && d < 30) {
        w.cd = WOLF_CD;
        this.playerHp = Math.max(0, this.playerHp - WOLF_DMG);
        this.cameras.main.shake(200, 0.008); sfx.hurt(); sfx.growl();
        this.emitParticles(px, py, 'partBlood', 8);
        const kb = Phaser.Math.Angle.Between(w.sprite.x, w.sprite.y, px, py);
        this.p.setPosition(px + Math.cos(kb) * WOLF_KB, py + Math.sin(kb) * WOLF_KB);
        this.msg(`🐺 Wolf attack! -${WOLF_DMG} HP`);
        if (this.playerHp <= 0) this.gameOver('mauled');
      }
    }
  }
  private killWolf(w: Wolf) {
    const wx = w.sprite.x, wy = w.sprite.y;
    if (this.bpTotal() < CAP) this.bp.meat++;
    if (this.bpTotal() < CAP) this.bp.pelts++;
    const lt = this.add.text(wx, wy - 20, '+1 🥩 Meat  +1 🦊 Pelt', {
      fontSize: '13px', color: '#ffe', fontFamily: 'Arial', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(9999);
    this.tweens.add({ targets: lt, y: wy - 80, alpha: 0, duration: 2000, onComplete: () => lt.destroy() });
    w.sprite.destroy();
    this.wolves = this.wolves.filter(x => x !== w);
    sfx.hit();
  }

  /* ─── crafting ─── */
  private nearBase(): boolean {
    const px = this.p.x, py = this.p.y;
    // near furnace (generous range for base building)
    if (this.furnace) {
      if (Phaser.Math.Distance.Between(px, py, this.furnace.sprite.x, this.furnace.sprite.y) < 350) return true;
    }
    // inside any fence perimeter (use blds to check fence bounds)
    const fences = this.blds.filter(b => b.kind === 'fence');
    if (fences.length >= 2) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const f of fences) { minX = Math.min(minX, f.sprite.x); maxX = Math.max(maxX, f.sprite.x); minY = Math.min(minY, f.sprite.y); maxY = Math.max(maxY, f.sprite.y); }
      // expand bounds by a small margin
      const m = 40;
      if (px >= minX - m && px <= maxX + m && py >= minY - m && py <= maxY + m) return true;
    }
    return false;
  }
  private craftBow() {
    if (hasBow) { this.msg('Already have a bow!'); return; }
    if (!this.nearBase()) { this.msg('Must be near base to craft!'); return; }
    if (basePlanks < 10) { this.msg('Need 10 Planks (Mill)'); return; }
    basePlanks -= 10;
    // spawn bow on ground at player's feet
    const bowSprite = this.lit(this.add.sprite(this.p.x, this.p.y + 20, 'bowGround').setScale(0.12));
    this.groundItems.push(bowSprite);
    sfx.build(); this.msg('🏹 Bow crafted! Walk to it and press Space to equip.');
    this.pileVis();
  }
  private craftArrows() {
    if (this.totalLogs() < 2 || this.totalRubble() < 2) { this.msg('Need 2 Logs + 2 Rubble'); return; }
    const space = CAP - this.bpTotal() + 4;
    const add = Math.min(5, space);
    if (add <= 0) { this.msg('Backpack full!'); return; }
    this.spendLogs(2); this.spendRubble(2);
    this.bp.arrows += add;
    sfx.build(); this.msg(`Crafted ${add} arrows (${this.bp.arrows} total)`);
  }
  private craftCoat() {
    if (hasCoat) { this.msg('Already have a fur coat!'); return; }
    if (this.bp.pelts < 5) { this.msg('Need 5 pelts (BP)'); return; }
    this.bp.pelts -= 5; hasCoat = true;
    sfx.build(); this.msg('🧥 Fur Coat crafted! Blizzard damage reduced.');
  }
  private craftBag() {
    if (hasBag) { this.msg('Already have a leather bag!'); return; }
    if (this.bp.pelts < 10) { this.msg('Need 10 Pelts (BP)'); return; }
    if (basePlanks < 10) { this.msg('Need 10 Planks (Mill)'); return; }
    this.bp.pelts -= 10; basePlanks -= 10;
    hasBag = true; CAP = 35;
    sfx.build(); this.msg('🎒 Leather Bag crafted! Backpack: 35 slots.');
  }
  private upgradeFurnace(level: number) {
    if (this.furnaceLvl >= level) { this.msg('Already upgraded!'); return; }
    if (level === 2) {
      if (basePlanks < 30 || baseBricks < 30) { this.msg('Need 30 Planks + 30 Bricks'); return; }
      basePlanks -= 30; baseBricks -= 30;
    } else if (level === 3) {
      if (this.furnaceLvl < 2) { this.msg('Upgrade to Lvl 2 first!'); return; }
      if (basePlanks < 60 || baseBricks < 60 || this.bp.pelts < 10) { this.msg('Need 60 Planks + 60 Bricks + 10 Pelts'); return; }
      basePlanks -= 60; baseBricks -= 60; this.bp.pelts -= 10;
    }
    this.furnaceLvl = level;
    const lightR = [380, 500, 800][level - 1];
    this.fLight.setRadius(lightR);
    if (this.furnace) this.drawBar(this.furnace);
    this.pileVis();
    sfx.build(); this.msg(`🔥 Furnace upgraded to Lvl ${level}!`);
  }

  /* ─── buildings ─── */
  private addBld(x: number, y: number, tex: string, kind: string, hp: number, max: number, sc = 0.18): Bld {
    const sprite = this.lit(this.add.sprite(x, y, tex).setScale(sc));
    const bar = this.add.graphics();
    const lbl = this.add.text(x, y - sprite.displayHeight / 2 - 20, '', { fontSize: '12px', color: '#fff', fontFamily: 'Arial', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    const b: Bld = { sprite, kind, hp, maxHp: max, bar, lbl }; this.blds.push(b); this.drawBar(b); return b;
  }
  private drawBar(b: Bld) {
    b.bar.clear();
    const names: Record<string, string> = { furnace: '🔥 Furnace', mill: '🪵 Mill', quarry: '⛏️ Quarry', igloo: '🏠 Igloo', woodHouse: '🏡 Wood House', stoneHouse: '🏰 Stone House', woodWall: '🧱 Wood Wall', woodGate: '🚪 Wood Gate', stoneWall: '🧱 Stone Wall', stoneGate: '🚪 Stone Gate' };
    if (b.kind === 'furnace') { b.lbl.setPosition(b.sprite.x, b.sprite.y - b.sprite.displayHeight / 2 - 14); b.lbl.setText(`🔥 Furnace Lvl ${this.furnaceLvl}`); return; }
    const w = 50, h = 6, bx = b.sprite.x - w / 2, by = b.sprite.y - b.sprite.displayHeight / 2 - 12;
    b.bar.fillStyle(0x333333, 0.8); b.bar.fillRect(bx, by, w, h);
    const pct = b.hp / b.maxHp;
    b.bar.fillStyle(pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xcccc44 : 0xcc4444); b.bar.fillRect(bx, by, w * pct, h);
    b.lbl.setPosition(b.sprite.x, by - 12); b.lbl.setText(`${names[b.kind] || b.kind} [${b.hp}/${b.maxHp}]`);
  }
  private enterBld(kind: string, tex: string, sc: number) {
    this.cancelBld(); this.bMode = kind;
    // for wall/gate kinds, append the current direction to the texture key
    const isWallGate = kind.includes('Wall') || kind.includes('Gate');
    const actualTex = isWallGate ? tex + this.buildDir : tex;
    this.bPrev = this.lit(this.add.sprite(0, 0, actualTex).setScale(sc).setAlpha(0.5)).setDepth(8000);
    if (isWallGate) this.bPrev.setOrigin(0.5, 1);
    // show/hide rotate + cancel buttons for mobile
    const rotBtn = document.getElementById('touch-rotate');
    const cancelBtn = document.getElementById('touch-cancel');
    if (rotBtn) rotBtn.style.display = isWallGate ? 'flex' : 'none';
    if (cancelBtn) cancelBtn.style.display = 'flex';
    this.msg(isWallGate ? 'Click to place. R=rotate, ESC=cancel.' : 'Click to place. ESC to cancel.');
  }
  private cancelBld() {
    if (this.bPrev) this.bPrev.destroy(); this.bPrev = null; this.bMode = null;
    const rotBtn = document.getElementById('touch-rotate');
    const cancelBtn = document.getElementById('touch-cancel');
    if (rotBtn) rotBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
  }
  private placeBld(wx: number, wy: number) {
    const m = this.bMode!; this.cancelBld();
    // build durations in ms
    const timers: Record<string, number> = { mill: 5_000, quarry: 5_000, igloo: 5_000, woodHouse: 5_000, stoneHouse: 5_000 };
    switch (m) {
      case 'mill':
        if (this.mill) { this.msg('Already built!'); return; } if (this.totalLogs() < 15) { this.msg('Need 15 Logs'); return; }
        this.spendLogs(15); this.startBuild('mill', 'lumberMill', 0.18, wx, wy, timers.mill); break;
      case 'quarry':
        if (this.qry) { this.msg('Already built!'); return; } if (this.totalRubble() < 15) { this.msg('Need 15 Rubble'); return; }
        this.spendRubble(15); this.startBuild('quarry', 'stoneQuarry', 0.18, wx, wy, timers.quarry); break;
      case 'igloo':
        if (this.bp.snow < 10 || this.totalLogs() < 5) { this.msg('Need 10 Snow + 5 Logs'); return; }
        this.bp.snow -= 10; this.spendLogs(5); this.startBuild('igloo', 'igloo', 0.18, wx, wy, timers.igloo); break;
      case 'woodHouse':
        if (!this.nearBase()) { this.msg('Must be near base!'); return; }
        if (basePlanks < 40) { this.msg('Need 40 Planks (Mill)'); return; }
        basePlanks -= 40; this.startBuild('woodHouse', 'woodHouse', 0.18, wx, wy, timers.woodHouse); this.pileVis(); break;
      case 'stoneHouse':
        if (!this.nearBase()) { this.msg('Must be near base!'); return; }
        if (baseBricks < 60 || basePlanks < 20) { this.msg('Need 60 Bricks + 20 Planks'); return; }
        baseBricks -= 60; basePlanks -= 20; this.startBuild('stoneHouse', 'stoneHouse', 0.18, wx, wy, timers.stoneHouse); this.pileVis(); break;
      case 'woodWall': case 'woodGate': case 'stoneWall': case 'stoneGate': {
        const costs: Record<string, { res: 'planks' | 'bricks'; amt: number }> = {
          woodWall: { res: 'planks', amt: 2 }, woodGate: { res: 'planks', amt: 5 },
          stoneWall: { res: 'bricks', amt: 2 }, stoneGate: { res: 'bricks', amt: 5 }
        };
        const cost = costs[m];
        if (cost.res === 'planks') {
          if (basePlanks < cost.amt) { this.msg(`Need ${cost.amt} Planks (Mill)`); return; }
          basePlanks -= cost.amt;
        } else {
          if (baseBricks < cost.amt) { this.msg(`Need ${cost.amt} Bricks (Quarry)`); return; }
          baseBricks -= cost.amt;
        }
        const tex = m + this.buildDir; // e.g. woodWallEast
        const bld = this.addBld(wx, wy, tex, m, this.getBldHp(m), this.getBldHp(m), 0.12);
        bld.sprite.setOrigin(0.5, 1);
        this.physics.add.existing(bld.sprite, true);
        const body = bld.sprite.body as Phaser.Physics.Arcade.StaticBody;
        body.setSize(bld.sprite.displayWidth * 0.8, bld.sprite.displayHeight * 0.3);
        body.setOffset(bld.sprite.displayWidth * 0.1, bld.sprite.displayHeight * 0.6);
        for (const w of this.wolves) this.physics.add.collider(w.sprite, bld.sprite);
        this.physics.add.collider(this.p, bld.sprite);
        sfx.build(); this.msg(`${m.includes('Wall') ? 'Wall' : 'Gate'} placed!`); this.pileVis(); break;
      }
    }
  }

  /* ─── build timer ─── */
  private startBuild(kind: string, tex: string, sc: number, wx: number, wy: number, dur: number) {
    // move player to build site
    this.p.setPosition(wx, wy + 40);
    this.pb.setVelocity(0, 0);
    // set pose based on kind
    const snowKinds = ['igloo'];
    this.p.setTexture(snowKinds.includes(kind) ? 'playerSnow' : 'playerBuilding2');
    // create ghost placeholder sprite (translucent preview)
    const ghost = this.add.sprite(wx, wy, tex).setScale(sc).setAlpha(0.35).setDepth(1).setTint(0x88ccff);
    // create progress bar
    const barW = 60, barH = 8;
    const bgBar = this.add.graphics().setDepth(9100);
    bgBar.fillStyle(0x222222, 0.8); bgBar.fillRect(wx - barW / 2, wy - 30, barW, barH);
    const bar = this.add.graphics().setDepth(9101);
    const lbl = this.add.text(wx, wy - 42, `Building...`, { fontSize: '11px', color: '#ffe', fontFamily: 'Arial', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(9102);
    this.building = { kind, tex, sc, wx, wy, dur, elapsed: 0, bar, bgBar, lbl, paused: false, ghost };
    this.msg(`🔨 Building ${kind}... (${Math.ceil(dur / 1000)}s)`);
  }
  private pauseBuild() {
    if (!this.building || this.building.paused) return;
    this.building.paused = true;
    // update label to show paused state
    const remain = Math.ceil((this.building.dur - this.building.elapsed) / 1000);
    this.building.lbl.setText(`⏸ Paused ${remain}s left`);
    this.building.lbl.setColor('#ffcc44');
    // restore idle player pose
    this.p.setTexture('playerIdle');
    this.msg(`🔨 Build paused — return to site to resume`);
  }
  private resumeBuild() {
    if (!this.building || !this.building.paused) return;
    const b = this.building;
    b.paused = false;
    b.lbl.setColor('#ffe');
    // move player to build site
    this.p.setPosition(b.wx, b.wy + 40);
    this.pb.setVelocity(0, 0);
    const snowKinds = ['igloo'];
    this.p.setTexture(snowKinds.includes(b.kind) ? 'playerSnow' : 'playerBuilding2');
    const remain = Math.ceil((b.dur - b.elapsed) / 1000);
    this.msg(`🔨 Resuming build... (${remain}s left)`);
  }
  private tickBuilding(dt: number) {
    const b = this.building!;
    b.elapsed += dt;
    // lock player
    this.pb.setVelocity(0, 0);
    // detect movement keys to pause build
    if (this.k.A.isDown || this.k.D.isDown || this.k.W.isDown || this.k.S.isDown || this.cursors.left.isDown || this.cursors.right.isDown || this.cursors.up.isDown || this.cursors.down.isDown) {
      this.pauseBuild(); return;
    }
    // hammer swing animation — alternate sprites every 400ms
    const snowKinds = ['igloo'];
    const isSnow = snowKinds.includes(b.kind);
    const frame = Math.floor(b.elapsed / 400) % 2;
    this.p.setTexture(isSnow ? 'playerSnow' : (frame === 0 ? 'playerBuilding' : 'playerBuilding2'));
    // update bar
    const pct = Math.min(1, b.elapsed / b.dur);
    const barW = 60, barH = 8;
    b.bar.clear();
    b.bar.fillStyle(0x44cc44); b.bar.fillRect(b.wx - barW / 2, b.wy - 30, barW * pct, barH);
    const remain = Math.ceil((b.dur - b.elapsed) / 1000);
    b.lbl.setText(`Building... ${remain}s`);
    if (b.elapsed >= b.dur) this.finishBuild();
  }
  private finishBuild() {
    const b = this.building!;
    b.bar.destroy(); b.bgBar.destroy(); b.lbl.destroy();
    if (b.ghost) b.ghost.destroy();
    // create the actual building
    const bld = this.addBld(b.wx, b.wy, b.tex, b.kind, this.getBldHp(b.kind), this.getBldHp(b.kind), b.sc);
    if (b.kind === 'mill') this.mill = bld;
    if (b.kind === 'quarry') this.qry = bld;
    const isWG = ['woodWall', 'woodGate', 'stoneWall', 'stoneGate'].includes(b.kind);
    if (isWG) {
      bld.sprite.setOrigin(0.5, 1);
      this.physics.add.existing(bld.sprite, true);
      const body = bld.sprite.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(bld.sprite.displayWidth * 0.8, bld.sprite.displayHeight * 0.3);
      body.setOffset(bld.sprite.displayWidth * 0.1, bld.sprite.displayHeight * 0.6);
      for (const w of this.wolves) this.physics.add.collider(w.sprite, bld.sprite);
      this.physics.add.collider(this.p, bld.sprite);
    }
    sfx.build();
    this.p.setTexture('playerIdle');
    this.poseTimer = 0;
    this.building = null;
    this.pileVis();
    const names: Record<string, string> = { mill: 'Lumber Mill', quarry: 'Quarry', igloo: 'Igloo', woodHouse: 'Wood House', stoneHouse: 'Stone House', woodWall: 'Wood Wall', woodGate: 'Wood Gate', stoneWall: 'Stone Wall', stoneGate: 'Stone Gate' };
    this.msg(`✅ ${names[b.kind] || b.kind} built!`);
  }
  private getBldHp(kind: string): number {
    const hps: Record<string, number> = { mill: 15, quarry: 15, igloo: 3, woodHouse: 9, stoneHouse: 24, woodWall: 6, woodGate: 8, stoneWall: 12, stoneGate: 14 };
    return hps[kind] ?? 10;
  }

  /* ─── pile visuals ─── */
  private pileVis() {
    const anchor = this.furnace?.sprite;
    if (!anchor) return;
    // wood pile (raw logs near furnace)
    if (this.wPile) { this.wPile.destroy(); this.wPile = null; }
    if (this.wPileLbl) { this.wPileLbl.destroy(); this.wPileLbl = null; }
    if (baseLogs > 0) {
      const wx = anchor.x + 140, wy = anchor.y - 20;
      this.wPile = this.lit(this.add.sprite(wx, wy, 'woodPile').setScale(0.12));
      this.wPileLbl = this.add.text(wx, wy - 45, `🪵 ${baseLogs}`, { fontSize: '14px', color: '#ffe', fontFamily: 'Arial Black,Arial', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(9000);
    }
    // stone pile (raw rubble near furnace)
    if (this.sPile) { this.sPile.destroy(); this.sPile = null; }
    if (this.sPileLbl) { this.sPileLbl.destroy(); this.sPileLbl = null; }
    if (baseRubble > 0) {
      const sx = anchor.x + 140, sy = anchor.y + 60;
      this.sPile = this.lit(this.add.sprite(sx, sy, 'stonePile').setScale(0.12));
      this.sPileLbl = this.add.text(sx, sy - 45, `🪨 ${baseRubble}`, { fontSize: '14px', color: '#ffe', fontFamily: 'Arial Black,Arial', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(9000);
    }
  }

  /* ─── blizzard ─── */
  private tickStorm(dt: number) {
    if (!this.sOn) return;
    this.sElap += dt;
    this.sOvr.setAlpha(0.04 + Math.sin(this.sElap / 400) * 0.02);
    this.sDmg -= dt;
    if (this.sDmg <= 0) { this.stormDmg(); this.sDmg = STORM_TICK; }
    if (this.sElap >= STORM_LEN) this.endStorm();
  }
  private startStorm() {
    this.sOn = true; this.sElap = 0; this.sDmg = STORM_TICK;
    this.sOvr.setFillStyle(0xaaddff, 0.04); this.sLbl.setAlpha(1);
    this.tweens.add({ targets: this.sLbl, alpha: { from: 1, to: 0.4 }, duration: 500, yoyo: true, repeat: -1 });
    for (const r of this.res) { if (r.kind === 'logs' && r.sprite.active && r.ready !== false) r.sprite.setTexture('treeBlizzard'); }
    sfx.startWind(); this.msg('⚠️ Blizzard incoming!');
  }
  private stormDmg() {
    const rm: Bld[] = [];
    for (const b of this.blds) { if (b.kind === 'furnace') continue; b.hp--; this.drawBar(b); b.sprite.setTint(0xff6666); this.time.delayedCall(300, () => b.sprite.clearTint()); if (b.hp <= 0) rm.push(b); }
    for (const b of rm) this.destroyBld(b);
    // temperature handles player damage now — just flash if outside
    if (!this.isInside) {
      this.cameras.main.flash(300, 100, 150, 255, true);
    }
  }
  private endStorm() {
    this.sOn = false; this.sOvr.setAlpha(0);
    this.tweens.killTweensOf(this.sLbl); this.sLbl.setAlpha(0);
    for (const r of this.res) { if (r.kind === 'logs' && r.sprite.active && r.ready !== false) r.sprite.setTexture('tree'); }
    sfx.stopWind(); this.msg('Blizzard passed.');
  }
  private destroyBld(b: Bld) {
    const wasInside = b === this.isInside; if (wasInside) this.exitShelter();
    this.tweens.add({ targets: b.sprite, alpha: 0, scaleX: 0, scaleY: 0, duration: 400, onComplete: () => { b.sprite.destroy(); b.bar.destroy(); b.lbl.destroy(); } });
    if (b === this.mill) { this.mill = null; basePlanks = 0; millInputLogs = 0; this.pileVis(); }
    if (b === this.qry) { this.qry = null; baseBricks = 0; qryInputRubble = 0; this.pileVis(); }
    this.blds = this.blds.filter(x => x !== b);
    this.msg(wasInside ? 'Your shelter was destroyed! ❄️' : `${b.kind} destroyed!`);
  }

  /* ─── HUD ─── */
  private createHUD() {
    this.hudEl = document.createElement('div'); this.hudEl.id = 'game-hud';
    this.hudEl.innerHTML = `
      <div class="hud-section"><h3>🌡️ Warmth</h3><div id="temp-bar-outer"><div id="temp-bar-inner"></div></div></div>
      <div class="hud-section"><h3>❤️ Health</h3><div id="hp-bar-outer"><div id="hp-bar-inner"></div></div></div>
      <div class="hud-section"><h3>🍖 Hunger</h3><div id="hunger-bar-outer"><div id="hunger-bar-inner"></div></div></div>
      <div class="hud-section"><h3>🎒 Backpack <span id="bp-total">0/${CAP}</span></h3>
        <div class="bp-row"><span id="bp-w">🪵 Logs: 0</span><button class="drop-btn" id="d-w">➖</button></div>
        <div class="bp-row"><span id="bp-s">🪨 Rubble: 0</span><button class="drop-btn" id="d-s">➖</button></div>
        <div class="bp-row"><span id="bp-n">❄️ Snow: 0</span><button class="drop-btn" id="d-n">➖</button></div>
        <div class="bp-row"><span id="bp-b">🪐 Berries: 0</span><button class="drop-btn" id="d-b">➖</button></div>
        <div class="bp-row"><span id="bp-a">🏹 Arrows: 0</span><button class="drop-btn" id="d-a">➖</button></div>
        <div class="bp-row"><span id="bp-p">🦊 Pelts: 0</span><button class="drop-btn" id="d-p">➖</button></div>
        <div class="bp-row"><span id="bp-m">🥩 Meat: 0</span><button class="drop-btn" id="d-m">➖</button></div></div>
      <div class="hud-section"><h3>🔥 Furnace</h3>
        <div id="bs-fl">🪵 Logs: 0/30</div><div id="bs-fr">🪨 Rubble: 0/30</div></div>
      <div class="hud-section" id="hud-mill" style="display:none"><h3>🪵 Mill</h3>
        <div id="bs-mp">📦 Planks: 0/100</div><div id="bs-mi">🪵 Queue: 0</div></div>
      <div class="hud-section" id="hud-qry" style="display:none"><h3>⛏️ Quarry</h3>
        <div id="bs-qb">🧱 Bricks: 0/100</div><div id="bs-qi">🪨 Queue: 0</div></div>`;
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
      if ((e.key === 'r' || e.key === 'R') && this.bMode && (this.bMode.includes('Wall') || this.bMode.includes('Gate'))) {
        this.buildDir = this.buildDir === 'East' ? 'West' : 'East';
        if (this.bPrev) {
          const baseTex = this.bMode; // e.g. 'woodWall'
          this.bPrev.setTexture(baseTex + this.buildDir);
        }
        this.msg(`🔄 Direction: ${this.buildDir}`);
      }
    });
    const btns = document.createElement('div'); btns.id = 'hud-buttons';
    btns.innerHTML = `<h3>🔨 Build</h3>
      <button id="b-mill">🪵 Lumber Mill<br><small>15 Logs (BP)</small></button>
      <button id="b-qry">⛏️ Quarry<br><small>15 Rubble (BP)</small></button>
      <button id="b-ig">🏠 Igloo<br><small>10 Snow+5 Logs (BP)</small></button>
      <button id="b-wh">🏡 Wood House<br><small>40 Planks (Mill)</small></button>
      <button id="b-sh">🏰 Stone House<br><small>60 Bricks+20 Planks</small></button>
      <button id="b-wwall">🧱 Wood Wall<br><small>2 Planks (Mill)</small></button>
      <button id="b-wgate">🚪 Wood Gate<br><small>5 Planks (Mill)</small></button>
      <button id="b-swall">🧱 Stone Wall<br><small>2 Bricks (Qry)</small></button>
      <button id="b-sgate">🚪 Stone Gate<br><small>5 Bricks (Qry)</small></button>
      <hr style="border-color:rgba(255,255,255,.1);margin:6px 0">
      <h3>⚔️ Craft</h3>
      <button id="c-bow">🏹 Craft Bow<br><small>10 Planks (Mill)</small></button>
      <button id="c-arr">🏹 Craft 5× Arrows<br><small>2 Logs+2 Rubble (BP)</small></button>
      <button id="c-coat">🧥 Fur Coat<br><small>5 Pelts (BP)</small></button>
      <button id="c-bag">🎒 Leather Bag<br><small>10 Pelts+10 Planks</small></button>
      <hr style="border-color:rgba(255,255,255,.1);margin:6px 0">
      <button id="b-trap">🪤 Snare Trap [T]<br><small>2 Logs+1 Meat (BP)</small></button>
      <hr style="border-color:rgba(255,255,255,.1);margin:6px 0">
      <button id="b-eat">🫐 Eat Berry [F]<br><small>+20 Hunger</small></button>
      <button id="b-meat">🥩 Eat Meat [E]<br><small>+50 Hunger</small></button>
      <hr style="border-color:rgba(255,255,255,.1);margin:6px 0">
      <h3>🔥 Furnace</h3>
      <button id="b-fup2">⬆️ Upgrade Lvl 2<br><small>30 Planks+30 Bricks</small></button>
      <button id="b-fup3">⬆️ Upgrade Lvl 3<br><small>60P+60B+10 Pelts</small></button>`;
    document.body.appendChild(btns);
    const timer = document.createElement('div'); timer.id = 'hud-timer'; document.body.appendChild(timer);
    document.getElementById('b-mill')!.onclick = () => this.enterBld('mill', 'lumberMill', 0.18);
    document.getElementById('b-qry')!.onclick = () => this.enterBld('quarry', 'stoneQuarry', 0.18);
    document.getElementById('b-ig')!.onclick = () => this.enterBld('igloo', 'igloo', 0.18);
    document.getElementById('b-wh')!.onclick = () => this.enterBld('woodHouse', 'woodHouse', 0.18);
    document.getElementById('b-sh')!.onclick = () => this.enterBld('stoneHouse', 'stoneHouse', 0.18);
    document.getElementById('b-wwall')!.onclick = () => this.enterBld('woodWall', 'woodWall', 0.12);
    document.getElementById('b-wgate')!.onclick = () => this.enterBld('woodGate', 'woodGate', 0.12);
    document.getElementById('b-swall')!.onclick = () => this.enterBld('stoneWall', 'stoneWall', 0.12);
    document.getElementById('b-sgate')!.onclick = () => this.enterBld('stoneGate', 'stoneGate', 0.12);
    document.getElementById('c-bow')!.onclick = () => this.craftBow();
    document.getElementById('c-arr')!.onclick = () => this.craftArrows();
    document.getElementById('c-coat')!.onclick = () => this.craftCoat();
    document.getElementById('c-bag')!.onclick = () => this.craftBag();
    document.getElementById('b-trap')!.onclick = () => this.placeTrap();
    document.getElementById('b-eat')!.onclick = () => this.eatBerry();
    document.getElementById('b-meat')!.onclick = () => this.eatMeat();
    document.getElementById('b-fup2')!.onclick = () => this.upgradeFurnace(2);
    document.getElementById('b-fup3')!.onclick = () => this.upgradeFurnace(3);
    // drop buttons
    document.getElementById('d-w')!.onclick = () => this.dropItem('logs');
    document.getElementById('d-s')!.onclick = () => this.dropItem('rubble');
    document.getElementById('d-n')!.onclick = () => this.dropItem('snow');
    document.getElementById('d-b')!.onclick = () => this.dropItem('berries');
    document.getElementById('d-a')!.onclick = () => this.dropItem('arrows');
    document.getElementById('d-p')!.onclick = () => this.dropItem('pelts');
    document.getElementById('d-m')!.onclick = () => this.dropItem('meat');
    this.msgEl = document.createElement('div'); this.msgEl.id = 'game-msg'; document.body.appendChild(this.msgEl);
    // save button (hidden until inside shelter)
    this.saveBtnEl = document.createElement('button'); this.saveBtnEl.id = 'btn-save';
    this.saveBtnEl.textContent = '💾 Save Game'; this.saveBtnEl.style.display = 'none';
    btns.appendChild(this.saveBtnEl);
    this.saveBtnEl.onclick = () => this.saveGame();

    // ── Virtual Touch Controls ──
    // D-Pad (bottom-left)
    const dpad = document.createElement('div');
    dpad.id = 'touch-dpad';
    dpad.innerHTML = `
      <button class="dpad-btn" id="dpad-up">▲</button>
      <div class="dpad-row">
        <button class="dpad-btn" id="dpad-left">◄</button>
        <button class="dpad-btn" id="dpad-right">►</button>
      </div>
      <button class="dpad-btn" id="dpad-down">▼</button>`;
    document.body.appendChild(dpad);

    // Action buttons (bottom-right)
    const touchBtns = document.createElement('div');
    touchBtns.id = 'touch-actions';
    touchBtns.innerHTML = `
      <button class="touch-btn" id="touch-action">⛏️</button>
      <button class="touch-btn" id="touch-trap">🪤</button>
      <button class="touch-btn" id="touch-rotate" style="display:none">🔄</button>
      <button class="touch-btn" id="touch-cancel" style="display:none">✖️</button>`;
    document.body.appendChild(touchBtns);

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
    trapEl.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.placeTrap(); }, { passive: false });
    trapEl.addEventListener('mousedown', (e) => { e.stopPropagation(); this.placeTrap(); });

    // Rotate button
    const rotEl = document.getElementById('touch-rotate')!;
    const doRotate = () => {
      if (!this.bMode) return;
      this.buildDir = this.buildDir === 'East' ? 'West' : 'East';
      if (this.bPrev) this.bPrev.setTexture(this.bMode + this.buildDir);
      this.msg(`🔄 Direction: ${this.buildDir}`);
    };
    rotEl.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); doRotate(); }, { passive: false });
    rotEl.addEventListener('mousedown', (e) => { e.stopPropagation(); doRotate(); });

    // Cancel button
    const cancelEl = document.getElementById('touch-cancel')!;
    cancelEl.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.cancelBld(); }, { passive: false });
    cancelEl.addEventListener('mousedown', (e) => { e.stopPropagation(); this.cancelBld(); });

    // Stop propagation on dpad/action containers so canvas doesn't get touch events
    dpad.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
    touchBtns.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
  }
  private dropItem(key: 'logs' | 'rubble' | 'snow' | 'berries' | 'arrows' | 'pelts' | 'meat') {
    if (this.bp[key] <= 0) { this.msg(`No ${key} to drop!`); return; }
    this.bp[key]--;
    this.msg(`Dropped 1 ${key}`);
  }
  private togglePause() {
    this.paused = !this.paused;
    if (this.pauseOverlay) this.pauseOverlay.style.display = this.paused ? 'flex' : 'none';
    if (this.paused) { this.pb.setVelocity(0, 0); if (this.waddle) { this.waddle.stop(); this.waddle = null; this.p.setScale(PSC); } }
  }
  private refreshHUD() {
    const $ = (id: string) => document.getElementById(id); if (!$('bp-w')) return;
    const hpI = $('hp-bar-inner') as HTMLDivElement;
    if (hpI) { const p = this.playerHp / this.MAX_HP; hpI.style.width = `${p * 100}%`; hpI.style.background = p > 0.5 ? '#e04050' : p > 0.25 ? '#cc8833' : '#ff2222'; }
    const huI = $('hunger-bar-inner') as HTMLDivElement;
    if (huI) { const p = this.playerHunger / this.MAX_HUNGER; huI.style.width = `${p * 100}%`; huI.style.background = p > 0.5 ? '#dd8822' : p > 0.25 ? '#cc6622' : '#ff3311'; }
    $('bp-w')!.textContent = `🪵 Logs: ${this.bp.logs}`;
    $('bp-s')!.textContent = `🪨 Rubble: ${this.bp.rubble}`;
    $('bp-n')!.textContent = `❄️ Snow: ${this.bp.snow}`;
    $('bp-b')!.textContent = `🪐 Berries: ${this.bp.berries}`;
    $('bp-a')!.textContent = `🏹 Arrows: ${this.bp.arrows}`;
    $('bp-p')!.textContent = `🦊 Pelts: ${this.bp.pelts}`;
    $('bp-m')!.textContent = `🥩 Meat: ${this.bp.meat}`;
    const tot = $('bp-total'); if (tot) tot.textContent = `${this.bpTotal()}/${CAP}`;
    // furnace storage
    $('bs-fl')!.textContent = `🪵 Logs: ${baseLogs}/${FURNACE_LOG_CAP}`;
    $('bs-fr')!.textContent = `🪨 Rubble: ${baseRubble}/${FURNACE_RUBBLE_CAP}`;
    // mill section
    const hudMill = $('hud-mill'); if (hudMill) hudMill.style.display = this.mill ? '' : 'none';
    $('bs-mp')!.textContent = `📦 Planks: ${basePlanks}/${MILL_PLANK_CAP}`;
    $('bs-mi')!.textContent = `🪵 Queue: ${millInputLogs}`;
    // quarry section
    const hudQry = $('hud-qry'); if (hudQry) hudQry.style.display = this.qry ? '' : 'none';
    $('bs-qb')!.textContent = `🧱 Bricks: ${baseBricks}/${QRY_BRICK_CAP}`;
    $('bs-qi')!.textContent = `🪨 Queue: ${qryInputRubble}`;
    // craft buttons
    const bowBtn = $('c-bow'); if (bowBtn) (bowBtn as HTMLButtonElement).style.display = hasBow ? 'none' : '';
    const coatBtn = $('c-coat'); if (coatBtn) (coatBtn as HTMLButtonElement).style.display = hasCoat ? 'none' : '';
    const bagBtn = $('c-bag'); if (bagBtn) (bagBtn as HTMLButtonElement).style.display = hasBag ? 'none' : '';
    const t = $('hud-timer')!;
    if (this.sOn) { const l = Math.ceil((STORM_LEN - this.sElap) / 1000); t.textContent = `❄️ Blizzard: ${l}s`; t.style.color = '#ff6666'; }
    else { t.textContent = ''; }
    // warmth bar
    const tmpI = $('temp-bar-inner') as HTMLDivElement;
    if (tmpI) { const p = this.playerTemp / this.MAX_TEMP; tmpI.style.width = `${p * 100}%`; tmpI.style.background = p > 0.5 ? '#44aadd' : p > 0.25 ? '#6688cc' : '#8866aa'; }
    // furnace upgrade buttons
    const fu2 = $('b-fup2'); if (fu2) (fu2 as HTMLButtonElement).style.display = this.furnaceLvl >= 2 ? 'none' : '';
    const fu3 = $('b-fup3'); if (fu3) (fu3 as HTMLButtonElement).style.display = this.furnaceLvl >= 3 ? 'none' : (this.furnaceLvl < 2 ? 'none' : '');
  }
  private msg(t: string) {
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
  private exitShelter() {
    if (!this.isInside) return; const b = this.isInside; this.isInside = null;
    this.p.setAlpha(1); this.p.setPosition(b.sprite.x, b.sprite.y + b.sprite.displayHeight / 2 + 20);
    this.msg('Exited shelter.');
    if (this.saveBtnEl) this.saveBtnEl.style.display = 'none';
  }
  private gameOver(cause: string = 'froze') {
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
      base: { baseLogs, baseRubble, basePlanks, baseBricks, millInputLogs, qryInputRubble },
      progression: { hasBow, hasCoat, hasBag, furnaceLvl: this.furnaceLvl, furnaceEverFueled, furnaceLit },
      dayClock: this.dayClock,
      buildings
    };
    localStorage.setItem('frozenFortuneSave', JSON.stringify(state));
    this.msg('💾 Game Saved!');
  }

  private loadGame() {
    const raw = localStorage.getItem('frozenFortuneSave');
    if (!raw) { this.msg('No save found!'); return; }
    const state: GameState = JSON.parse(raw);

    // player
    this.p.setPosition(state.player.x, state.player.y);
    this.playerHp = state.player.hp;
    this.playerHunger = state.player.hunger;
    this.playerTemp = state.player.temp;
    this.hungerClock = 0;

    // backpack
    this.bp = { ...state.bp };

    // base storage
    baseLogs = state.base.baseLogs;
    baseRubble = state.base.baseRubble;
    basePlanks = state.base.basePlanks;
    baseBricks = state.base.baseBricks;
    millInputLogs = state.base.millInputLogs;
    qryInputRubble = state.base.qryInputRubble;

    // progression
    hasBow = state.progression.hasBow;
    hasCoat = state.progression.hasCoat;
    hasBag = state.progression.hasBag ?? false;
    if (hasBag) CAP = 35; else CAP = 20;
    this.furnaceLvl = state.progression.furnaceLvl;
    furnaceEverFueled = state.progression.furnaceEverFueled;
    furnaceLit = state.progression.furnaceLit;

    // world
    this.dayClock = state.dayClock;

    // destroy existing non-furnace buildings
    for (const b of [...this.blds]) {
      if (b.kind === 'furnace') continue;
      b.sprite.destroy(); b.bar.destroy(); b.lbl.destroy();
    }
    this.blds = this.blds.filter(b => b.kind === 'furnace');
    this.mill = null; this.qry = null;

    // rebuild saved buildings
    for (const sb of state.buildings) {
      const texMap: Record<string, string> = { mill: 'lumberMill', quarry: 'stoneQuarry', igloo: 'igloo', woodHouse: 'woodHouse', stoneHouse: 'stoneHouse' };
      const isWG = ['woodWall', 'woodGate', 'stoneWall', 'stoneGate'].includes(sb.kind);
      const tex = isWG ? (sb.tex || sb.kind + 'East') : (texMap[sb.kind] || sb.kind);
      const sc = isWG ? 0.12 : 0.18;
      const bld = this.addBld(sb.x, sb.y, tex, sb.kind, sb.hp, this.getBldHp(sb.kind), sc);
      if (sb.kind === 'mill') this.mill = bld;
      if (sb.kind === 'quarry') this.qry = bld;
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

    // furnace visuals
    if (furnaceLit) {
      if (this.furnace) this.furnace.sprite.clearTint();
      const lightR = [380, 500, 800][this.furnaceLvl - 1];
      this.fLight.setRadius(lightR);
    } else {
      if (this.furnace) this.furnace.sprite.setTint(0x667788);
      this.fLight.setRadius(0);
    }
    if (this.furnace) this.drawBar(this.furnace);
    this.pileVis();
    this.msg('💾 Game Loaded!');
  }

  private resetGame() {
    // reset globals
    baseLogs = 0; baseRubble = 0; basePlanks = 0; baseBricks = 0;
    millInputLogs = 0; qryInputRubble = 0;
    furnaceLit = true; furnaceEverFueled = false;
    hasBow = false; hasCoat = false; hasBag = false; CAP = 20;

    // reset player
    this.p.setPosition(MW / 2, MH / 2 + 120);
    this.p.setAlpha(1);
    this.playerHp = this.MAX_HP;
    this.playerHunger = this.MAX_HUNGER;
    this.hungerClock = 0;
    this.healTimer = 0;
    this.playerTemp = this.MAX_TEMP;
    this.bp = { logs: 0, rubble: 0, snow: 0, berries: 0, arrows: 0, pelts: 0, meat: 0 };
    this.dayClock = 0;
    this.isInside = null;
    this.furnaceLvl = 1;

    // destroy non-furnace buildings
    for (const b of [...this.blds]) {
      if (b.kind === 'furnace') continue;
      b.sprite.destroy(); b.bar.destroy(); b.lbl.destroy();
    }
    this.blds = this.blds.filter(b => b.kind === 'furnace');
    this.mill = null; this.qry = null;

    // destroy deer
    for (const d of this.deers) d.sprite.destroy();
    this.deers = [];

    // furnace visuals
    if (this.furnace) {
      this.furnace.sprite.clearTint();
      this.drawBar(this.furnace);
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
