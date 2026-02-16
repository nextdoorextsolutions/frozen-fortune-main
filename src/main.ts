import Phaser from 'phaser';
import './style.css';
import { SFX } from './sfx';

/* ── globals ── */
let baseWood = 0, baseStone = 0;
let hasBow = false, hasCoat = false;
const sfx = new SFX();

const MW = 2400, MH = 2400, CAP = 20, SPEED = 220, RANGE = 130, PSC = 0.09;
const STORM_LEN = 15_000, STORM_TICK = 5_000;
const DAY_LEN = 60_000, NIGHT_LEN = 60_000, FULL_DAY = DAY_LEN + NIGHT_LEN;
const HUNGER_TICK = 2_000, BUSH_REGROW = 30_000, TREE_REGROW = 60_000, STONE_REGROW = 120_000;
const WOLF_N = 3, WOLF_RANGE = 300, WOLF_DMG = 15, WOLF_KB = 180, WOLF_CD = 1000;
const WOLF_SLOW = 40, WOLF_FAST = 80, WOLF_HP = 30;
const ARROW_SPEED = 400, ARROW_DMG = 15, SHOOT_SLOW = 500;
const WOLF_MAX_MAP = 6;
const TREE_CAP = 5, STONE_CAP = 20;

interface Res { sprite: Phaser.GameObjects.Sprite; kind: 'wood' | 'stone' | 'snow'; capacity?: number; ready?: boolean; timer?: number }
interface Bld { sprite: Phaser.GameObjects.Sprite; kind: string; hp: number; maxHp: number; bar: Phaser.GameObjects.Graphics; lbl: Phaser.GameObjects.Text }
interface Bush { sprite: Phaser.GameObjects.Sprite; ready: boolean; timer: number }
interface Wolf { sprite: Phaser.GameObjects.Sprite; body: Phaser.Physics.Arcade.Body; angle: number; cd: number; hp: number; stunTimer: number }
interface Arrow { sprite: Phaser.GameObjects.Sprite; body: Phaser.Physics.Arcade.Body; vx: number; vy: number; life: number }
interface Trap { sprite: Phaser.GameObjects.Sprite; body: Phaser.Physics.Arcade.Body }

class Game extends Phaser.Scene {
  private p!: Phaser.GameObjects.Sprite;
  private pb!: Phaser.Physics.Arcade.Body;
  private waddle: Phaser.Tweens.Tween | null = null;
  private k!: Record<string, Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private bp = { wood: 0, stone: 0, snow: 0, berries: 0, arrows: 0, pelts: 0, meat: 0 };
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
  private gcd = 0;
  private playerHp = 100;
  private readonly MAX_HP = 100;
  private playerHunger = 100;
  private readonly MAX_HUNGER = 100;
  private hungerClock = 0;
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
  private groundItems: Phaser.GameObjects.Sprite[] = [];
  private fenceWalls: Phaser.GameObjects.Sprite[] = [];
  // combat
  private shootSlow = 0;
  // action pose
  private poseTimer = 0;
  // build timer
  private building: { kind: string; tex: string; sc: number; wx: number; wy: number; dur: number; elapsed: number; bar: Phaser.GameObjects.Graphics; bgBar: Phaser.GameObjects.Graphics; lbl: Phaser.GameObjects.Text } | null = null;
  // pause
  private paused = false;
  private pauseOverlay: HTMLDivElement | null = null;
  // HUD
  private hudEl!: HTMLDivElement;
  private msgEl!: HTMLDivElement;
  private msgT: number | null = null;
  private stepTimer = 0;

  constructor() { super('Game'); }
  private lit<T extends Phaser.GameObjects.Sprite>(s: T): T { s.setPipeline('Light2D'); return s; }
  private bpTotal(): number { return this.bp.wood + this.bp.stone + this.bp.snow + this.bp.berries + this.bp.arrows + this.bp.pelts + this.bp.meat; }

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

    this.genTex();

    // ground
    for (let i = 0; i < 80; i++)
      this.add.circle(Phaser.Math.Between(40, MW - 40), Phaser.Math.Between(40, MH - 40), Phaser.Math.Between(2, 7), 0xd4ecf7, 0.35).setDepth(0);

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
  }

  update(_t: number, dt: number) {
    if (this.paused) return;
    const isBusy = !!this.building;
    // build timer
    if (this.building) { this.tickBuilding(dt); }

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
      if (this.k.A.isDown || this.cursors.left.isDown) vx = -1;
      else if (this.k.D.isDown || this.cursors.right.isDown) vx = 1;
      if (this.k.W.isDown || this.cursors.up.isDown) vy = -1;
      else if (this.k.S.isDown || this.cursors.down.isDown) vy = 1;
      const len = Math.sqrt(vx * vx + vy * vy) || 1;
      this.pb.setVelocity(vx / len * SPEED * spdMul, vy / len * SPEED * spdMul);
      const moving = vx !== 0 || vy !== 0;
      if (moving && !this.waddle)
        this.waddle = this.tweens.add({ targets: this.p, scaleY: { from: PSC, to: PSC * 0.88 }, scaleX: { from: PSC, to: PSC * 1.12 }, duration: 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      else if (!moving && this.waddle) { this.waddle.stop(); this.waddle = null; this.p.setScale(PSC); }
      if (vx < 0) this.p.setFlipX(true); else if (vx > 0) this.p.setFlipX(false);
      if (moving) { this.stepTimer -= dt; if (this.stepTimer <= 0) { sfx.step(); this.stepTimer = 280; } }
      else this.stepTimer = 0;
    } else {
      this.pb.setVelocity(0, 0);
      if (this.waddle) { this.waddle.stop(); this.waddle = null; this.p.setScale(PSC); }
    }

    if (!isBusy && this.k.SP.isDown) { this.gcd -= dt; if (this.gcd <= 0) { this.interact(); this.gcd = 400; } } else if (!isBusy) this.gcd = 0;

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

    if (this.bMode && this.bPrev) { const ptr = this.input.activePointer; this.bPrev.setPosition(ptr.worldX, ptr.worldY); }

    this.tickDayNight(dt);
    this.tickStorm(dt);
    this.tickHunger(dt);
    this.tickBushes(dt);
    this.tickResources(dt);
    this.tickWolves(dt);
    this.tickProjectiles(dt);
    this.refreshHUD();
  }

  /* ─── player pose helper ─── */
  private setPose(tex: string, dur: number) {
    this.p.setTexture(tex);
    this.poseTimer = dur;
  }

  /* ─── textures ─── */
  private genTex() {
    // fence
    const fg = this.add.graphics();
    fg.fillStyle(0x8B5E3C); fg.fillRect(0, 0, 6, 28);
    fg.fillStyle(0x6B3F1F); fg.fillRect(1, 0, 4, 4);
    fg.fillStyle(0xA57548); fg.fillRect(0, 10, 6, 3); fg.fillRect(0, 20, 6, 3);
    fg.generateTexture('fenceTex', 6, 28); fg.destroy();
    // fence wall segment (horizontal plank)
    const fw = this.add.graphics();
    fw.fillStyle(0x8B5E3C); fw.fillRect(0, 0, 20, 6);
    fw.fillStyle(0xA57548); fw.fillRect(0, 2, 20, 2);
    fw.generateTexture('fenceWallTex', 20, 6); fw.destroy();
    // arrow projectile
    const ag = this.add.graphics();
    ag.fillStyle(0x8B5E3C); ag.fillRect(0, 3, 16, 2);
    ag.fillStyle(0xaaaaaa); ag.fillTriangle(16, 0, 20, 4, 16, 8);
    ag.fillStyle(0xcc8844); ag.fillRect(0, 2, 3, 4);
    ag.generateTexture('arrowTex', 20, 8); ag.destroy();
    // trap
    const tg = this.add.graphics();
    tg.fillStyle(0x6B3F1F); tg.fillCircle(10, 10, 10);
    tg.fillStyle(0x8B5E3C); tg.fillCircle(10, 10, 6);
    tg.lineStyle(2, 0xaaaaaa); tg.strokeCircle(10, 10, 8);
    tg.generateTexture('trapTex', 20, 20); tg.destroy();
  }

  /* ─── resources ─── */
  private scatter() {
    const rng = (a: number, b: number) => Phaser.Math.Between(a, b);
    const cx = MW / 2, cy = MH / 2;
    const far = (x: number, y: number) => Phaser.Math.Distance.Between(x, y, cx, cy) > 450;
    const mk = (tex: string, kind: 'wood' | 'stone' | 'snow', n: number, sc: number, cap?: number) => {
      for (let i = 0; i < n; i++) {
        let x: number, y: number;
        do { x = rng(80, MW - 80); y = rng(80, MH - 80); } while (!far(x, y));
        const r: Res = { sprite: this.lit(this.add.sprite(x, y, tex).setScale(sc)), kind };
        if (cap !== undefined) { r.capacity = cap; r.ready = true; r.timer = 0; }
        this.res.push(r);
      }
    };
    mk('tree', 'wood', 35, 0.12, TREE_CAP);
    mk('rock', 'stone', 20, 0.12, STONE_CAP);
    mk('snowPile', 'snow', 18, 0.12);
    for (let i = 0; i < 15; i++) {
      let x: number, y: number;
      do { x = rng(80, MW - 80); y = rng(80, MH - 80); } while (!far(x, y));
      this.bushes.push({ sprite: this.lit(this.add.sprite(x, y, 'bushFull').setScale(0.12)), ready: true, timer: 0 });
    }
  }

  /* ─── resource regrowth ─── */
  private tickResources(dt: number) {
    for (const r of this.res) {
      if (r.ready !== false) continue;
      r.timer = (r.timer ?? 0) + dt;
      if (r.kind === 'wood' && r.timer >= TREE_REGROW) {
        r.ready = true; r.capacity = TREE_CAP; r.timer = 0;
        r.sprite.setScale(0.12);
        r.sprite.setTexture(this.sOn ? 'treeBlizzard' : 'tree');
      }
      if (r.kind === 'stone' && r.timer >= STONE_REGROW) {
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
    this.wolves.push({ sprite, body, angle: Math.random() * Math.PI * 2, cd: 0, hp: WOLF_HP, stunTimer: 0 });
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

    // auto-deposit at base (furnace, mill, quarry, or fence area)
    if (this.nearBase() && (this.bp.wood > 0 || this.bp.stone > 0)) {
      const w = this.bp.wood, s = this.bp.stone; this.bp.wood = 0; this.bp.stone = 0;
      baseWood += w; baseStone += s;
      const parts: string[] = []; if (w > 0) parts.push(`${w} wood`); if (s > 0) parts.push(`${s} stone`);
      this.msg(`+${parts.join(' + ')} → Base Storage`); sfx.build(); this.pileVis(); return;
    }
    if (this.mill) {
      const d = Phaser.Math.Distance.Between(px, py, this.mill.sprite.x, this.mill.sprite.y);
      if (d < RANGE && this.bp.wood > 0) { const a = this.bp.wood; this.bp.wood = 0; baseWood += a; this.msg(`+${a} wood → Base`); sfx.build(); this.pileVis(); return; }
    }
    if (this.qry) {
      const d = Phaser.Math.Distance.Between(px, py, this.qry.sprite.x, this.qry.sprite.y);
      if (d < RANGE && this.bp.stone > 0) { const a = this.bp.stone; this.bp.stone = 0; baseStone += a; this.msg(`+${a} stone → Base`); sfx.build(); this.pileVis(); return; }
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
    }
    if (k === 'stone') {
      this.setPose('playerMine', 300);
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
    if (k === 'wood') {
      this.setPose('playerCut', 300);
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
          w.sprite.setTint(0xffffff);
          this.time.delayedCall(150, () => { if (w.sprite.active) w.sprite.clearTint(); });
          rem.push(a);
          if (w.hp <= 0) this.killWolf(w);
          break;
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
    if (this.bp.wood < 5 || this.bp.stone < 5) { this.msg('Need 5 wood + 5 stone (BP)'); return; }
    this.bp.wood -= 5; this.bp.stone -= 5;
    const sprite = this.add.sprite(this.p.x, this.p.y, 'trapTex').setDepth(1);
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
      } else {
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
    // near furnace
    if (this.furnace) {
      if (Phaser.Math.Distance.Between(px, py, this.furnace.sprite.x, this.furnace.sprite.y) < RANGE * 2) return true;
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
    if (baseWood < 20) { this.msg('Need 20 wood (Base)'); return; }
    baseWood -= 20;
    // spawn bow on ground at player's feet
    const bowSprite = this.lit(this.add.sprite(this.p.x, this.p.y + 20, 'bowGround').setScale(0.12));
    this.groundItems.push(bowSprite);
    sfx.build(); this.msg('🏹 Bow crafted! Walk to it and press Space to equip.');
    this.pileVis();
  }
  private craftArrows() {
    if (this.bp.wood < 2 || this.bp.stone < 2) { this.msg('Need 2 wood + 2 stone (BP)'); return; }
    const space = CAP - this.bpTotal() + 4; // +4 because we'll remove 2 wood + 2 stone first
    const add = Math.min(5, space);
    if (add <= 0) { this.msg('Backpack full!'); return; }
    this.bp.wood -= 2; this.bp.stone -= 2;
    this.bp.arrows += add;
    sfx.build(); this.msg(`Crafted ${add} arrows (${this.bp.arrows} total)`);
  }
  private craftCoat() {
    if (hasCoat) { this.msg('Already have a fur coat!'); return; }
    if (this.bp.pelts < 5) { this.msg('Need 5 pelts (BP)'); return; }
    this.bp.pelts -= 5; hasCoat = true;
    sfx.build(); this.msg('🧥 Fur Coat crafted! Blizzard damage reduced.');
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
    const names: Record<string, string> = { furnace: '🔥 Furnace', mill: '🪵 Mill', quarry: '⛏️ Quarry', igloo: '🏠 Igloo', woodHouse: '🏡 Wood House', stoneHouse: '🏰 Stone House', fence: '🪵 Fence' };
    if (b.kind === 'furnace') { b.lbl.setPosition(b.sprite.x, b.sprite.y - b.sprite.displayHeight / 2 - 14); b.lbl.setText(names.furnace); return; }
    const w = 50, h = 6, bx = b.sprite.x - w / 2, by = b.sprite.y - b.sprite.displayHeight / 2 - 12;
    b.bar.fillStyle(0x333333, 0.8); b.bar.fillRect(bx, by, w, h);
    const pct = b.hp / b.maxHp;
    b.bar.fillStyle(pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xcccc44 : 0xcc4444); b.bar.fillRect(bx, by, w * pct, h);
    b.lbl.setPosition(b.sprite.x, by - 12); b.lbl.setText(`${names[b.kind] || b.kind} [${b.hp}/${b.maxHp}]`);
  }
  private enterBld(kind: string, tex: string, sc: number) {
    this.cancelBld(); this.bMode = kind;
    this.bPrev = this.lit(this.add.sprite(0, 0, tex).setScale(sc).setAlpha(0.5)).setDepth(8000);
    this.msg('Click to place. ESC to cancel.');
  }
  private cancelBld() { if (this.bPrev) this.bPrev.destroy(); this.bPrev = null; this.bMode = null; }
  private placeBld(wx: number, wy: number) {
    const m = this.bMode!; this.cancelBld();
    // build durations in ms
    const timers: Record<string, number> = { mill: 60_000, quarry: 60_000, igloo: 5_000, woodHouse: 10_000, stoneHouse: 20_000 };
    switch (m) {
      case 'mill':
        if (this.mill) { this.msg('Already built!'); return; } if (this.bp.wood < 15) { this.msg('Need 15 wood'); return; }
        this.bp.wood -= 15; this.startBuild('mill', 'lumberMill', 0.18, wx, wy, timers.mill); break;
      case 'quarry':
        if (this.qry) { this.msg('Already built!'); return; } if (this.bp.stone < 15) { this.msg('Need 15 stone'); return; }
        this.bp.stone -= 15; this.startBuild('quarry', 'stoneQuarry', 0.18, wx, wy, timers.quarry); break;
      case 'igloo':
        if (this.bp.snow < 10 || this.bp.wood < 5) { this.msg('Need 10 snow+5 wood'); return; }
        this.bp.snow -= 10; this.bp.wood -= 5; this.startBuild('igloo', 'igloo', 0.18, wx, wy, timers.igloo); break;
      case 'woodHouse':
        if (!this.nearBase()) { this.msg('Must be near base!'); return; }
        if (baseWood < 60) { this.msg('Need 60 wood (Base)'); return; }
        baseWood -= 60; this.startBuild('woodHouse', 'woodHouse', 0.18, wx, wy, timers.woodHouse); this.pileVis(); break;
      case 'stoneHouse':
        if (!this.nearBase()) { this.msg('Must be near base!'); return; }
        if (baseStone < 100 || baseWood < 40) { this.msg('Need 100 stone+40 wood (Base)'); return; }
        baseStone -= 100; baseWood -= 40; this.startBuild('stoneHouse', 'stoneHouse', 0.18, wx, wy, timers.stoneHouse); this.pileVis(); break;
      case 'fence':
        if (this.bp.wood < 5) { this.msg('Need 5 wood (BP)'); return; }
        this.bp.wood -= 5;
        const fb = this.addBld(wx, wy, 'fenceTex', 'fence', 6, 6, 1.0);
        this.physics.add.existing(fb.sprite, true);
        for (const w of this.wolves) this.physics.add.collider(w.sprite, fb.sprite);
        this.connectFences(fb);
        sfx.build(); this.msg('Fence built!'); break;
    }
  }

  /* ─── fence connections ─── */
  private connectFences(newFence: Bld) {
    const fences = this.blds.filter(b => b.kind === 'fence' && b !== newFence && b.sprite.active);
    if (fences.length === 0) return;
    let nearest: Bld | null = null, nearDist = 200;
    for (const f of fences) {
      const d = Phaser.Math.Distance.Between(newFence.sprite.x, newFence.sprite.y, f.sprite.x, f.sprite.y);
      if (d < nearDist) { nearDist = d; nearest = f; }
    }
    if (!nearest) return;
    const x1 = newFence.sprite.x, y1 = newFence.sprite.y;
    const x2 = nearest.sprite.x, y2 = nearest.sprite.y;
    const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const segLen = 12;
    const count = Math.floor(dist / segLen);
    for (let i = 1; i < count; i++) {
      const t = i / count;
      const sx = x1 + (x2 - x1) * t;
      const sy = y1 + (y2 - y1) * t;
      const seg = this.add.sprite(sx, sy, 'fenceWallTex').setRotation(angle).setDepth(sy);
      this.physics.add.existing(seg, true);
      for (const w of this.wolves) this.physics.add.collider(w.sprite, seg);
      this.fenceWalls.push(seg);
    }
  }

  /* ─── build timer ─── */
  private startBuild(kind: string, tex: string, sc: number, wx: number, wy: number, dur: number) {
    // move player to build site
    this.p.setPosition(wx, wy + 40);
    this.pb.setVelocity(0, 0);
    // set pose based on kind
    const snowKinds = ['igloo'];
    this.p.setTexture(snowKinds.includes(kind) ? 'playerSnow' : 'playerBuilding');
    // create progress bar
    const barW = 60, barH = 8;
    const bgBar = this.add.graphics().setDepth(9100);
    bgBar.fillStyle(0x222222, 0.8); bgBar.fillRect(wx - barW / 2, wy - 30, barW, barH);
    const bar = this.add.graphics().setDepth(9101);
    const lbl = this.add.text(wx, wy - 42, `Building...`, { fontSize: '11px', color: '#ffe', fontFamily: 'Arial', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(9102);
    this.building = { kind, tex, sc, wx, wy, dur, elapsed: 0, bar, bgBar, lbl };
    this.msg(`🔨 Building ${kind}... (${Math.ceil(dur / 1000)}s)`);
  }
  private tickBuilding(dt: number) {
    const b = this.building!;
    b.elapsed += dt;
    // lock player
    this.pb.setVelocity(0, 0);
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
    // create the actual building
    const bld = this.addBld(b.wx, b.wy, b.tex, b.kind, this.getBldHp(b.kind), this.getBldHp(b.kind), b.sc);
    if (b.kind === 'mill') this.mill = bld;
    if (b.kind === 'quarry') this.qry = bld;
    if (b.kind === 'fence') {
      this.physics.add.existing(bld.sprite, true);
      for (const w of this.wolves) this.physics.add.collider(w.sprite, bld.sprite);
    }
    sfx.build();
    this.p.setTexture('playerIdle');
    this.poseTimer = 0;
    this.building = null;
    this.pileVis();
    const names: Record<string, string> = { mill: 'Lumber Mill', quarry: 'Quarry', igloo: 'Igloo', woodHouse: 'Wood House', stoneHouse: 'Stone House' };
    this.msg(`✅ ${names[b.kind] || b.kind} built!`);
  }
  private getBldHp(kind: string): number {
    const hps: Record<string, number> = { mill: 15, quarry: 15, igloo: 3, woodHouse: 9, stoneHouse: 24, fence: 6 };
    return hps[kind] ?? 10;
  }

  /* ─── pile visuals ─── */
  private pileVis() {
    const anchor = this.furnace?.sprite;
    if (!anchor) return;
    // wood pile - positioned to the right of furnace
    if (this.wPile) { this.wPile.destroy(); this.wPile = null; }
    if (this.wPileLbl) { this.wPileLbl.destroy(); this.wPileLbl = null; }
    if (baseWood > 0) {
      const wx = anchor.x + 140, wy = anchor.y - 20;
      this.wPile = this.lit(this.add.sprite(wx, wy, 'woodPile').setScale(0.12));
      this.wPileLbl = this.add.text(wx, wy - 45, `🪵 ${baseWood}`, { fontSize: '14px', color: '#ffe', fontFamily: 'Arial Black,Arial', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(9000);
    }
    // stone pile - positioned to the right of furnace, below wood
    if (this.sPile) { this.sPile.destroy(); this.sPile = null; }
    if (this.sPileLbl) { this.sPileLbl.destroy(); this.sPileLbl = null; }
    if (baseStone > 0) {
      const sx = anchor.x + 140, sy = anchor.y + 60;
      this.sPile = this.lit(this.add.sprite(sx, sy, 'stonePile').setScale(0.12));
      this.sPileLbl = this.add.text(sx, sy - 45, `🪨 ${baseStone}`, { fontSize: '14px', color: '#ffe', fontFamily: 'Arial Black,Arial', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(9000);
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
    for (const r of this.res) { if (r.kind === 'wood' && r.sprite.active && r.ready !== false) r.sprite.setTexture('treeBlizzard'); }
    sfx.startWind(); this.msg('⚠️ Blizzard incoming!');
  }
  private stormDmg() {
    const rm: Bld[] = [];
    for (const b of this.blds) { if (b.kind === 'furnace') continue; b.hp--; this.drawBar(b); b.sprite.setTint(0xff6666); this.time.delayedCall(300, () => b.sprite.clearTint()); if (b.hp <= 0) rm.push(b); }
    for (const b of rm) this.destroyBld(b);
    if (!this.isInside) {
      const dmg = hasCoat ? 1 : 5;
      this.playerHp = Math.max(0, this.playerHp - dmg);
      this.cameras.main.flash(300, 100, 150, 255, true); sfx.hurt();
      if (this.playerHp <= 0) this.gameOver('froze');
    }
  }
  private endStorm() {
    this.sOn = false; this.sOvr.setAlpha(0);
    this.tweens.killTweensOf(this.sLbl); this.sLbl.setAlpha(0);
    for (const r of this.res) { if (r.kind === 'wood' && r.sprite.active && r.ready !== false) r.sprite.setTexture('tree'); }
    sfx.stopWind(); this.msg('Blizzard passed.');
  }
  private destroyBld(b: Bld) {
    const wasInside = b === this.isInside; if (wasInside) this.exitShelter();
    this.tweens.add({ targets: b.sprite, alpha: 0, scaleX: 0, scaleY: 0, duration: 400, onComplete: () => { b.sprite.destroy(); b.bar.destroy(); b.lbl.destroy(); } });
    if (b === this.mill) { this.mill = null; this.pileVis(); } if (b === this.qry) { this.qry = null; this.pileVis(); }
    this.blds = this.blds.filter(x => x !== b);
    this.msg(wasInside ? 'Your shelter was destroyed! ❄️' : `${b.kind} destroyed!`);
  }

  /* ─── HUD ─── */
  private createHUD() {
    this.hudEl = document.createElement('div'); this.hudEl.id = 'game-hud';
    this.hudEl.innerHTML = `
      <div class="hud-section"><h3>❤️ Health</h3><div id="hp-bar-outer"><div id="hp-bar-inner"></div></div></div>
      <div class="hud-section"><h3>🍖 Hunger</h3><div id="hunger-bar-outer"><div id="hunger-bar-inner"></div></div></div>
      <div class="hud-section"><h3>🎒 Backpack <span id="bp-total">0/${CAP}</span></h3>
        <div class="bp-row"><span id="bp-w">🪵0</span><button class="drop-btn" id="d-w">➖</button></div>
        <div class="bp-row"><span id="bp-s">🪨0</span><button class="drop-btn" id="d-s">➖</button></div>
        <div class="bp-row"><span id="bp-n">❄️0</span><button class="drop-btn" id="d-n">➖</button></div>
        <div class="bp-row"><span id="bp-b">🫐0</span><button class="drop-btn" id="d-b">➖</button></div>
        <div class="bp-row"><span id="bp-a">🏹0</span><button class="drop-btn" id="d-a">➖</button></div>
        <div class="bp-row"><span id="bp-p">🦊0</span><button class="drop-btn" id="d-p">➖</button></div>
        <div class="bp-row"><span id="bp-m">🥩0</span><button class="drop-btn" id="d-m">➖</button></div></div>
      <div class="hud-section"><h3>🏗️ Base Storage</h3>
        <div id="bs-w">🪵0</div><div id="bs-s">🪨0</div></div>`;
    document.body.appendChild(this.hudEl);
    // pause button
    const pauseBtn = document.createElement('button'); pauseBtn.id = 'pause-btn'; pauseBtn.textContent = '⏸';
    document.body.appendChild(pauseBtn);
    pauseBtn.onclick = () => this.togglePause();
    // pause overlay
    this.pauseOverlay = document.createElement('div'); this.pauseOverlay.id = 'pause-overlay';
    this.pauseOverlay.innerHTML = '<div class="pause-text">⏸ PAUSED</div><div class="pause-sub">Press P or click ⏸ to resume</div>';
    document.body.appendChild(this.pauseOverlay);
    // P key for pause
    window.addEventListener('keydown', (e) => { if (e.key === 'p' || e.key === 'P') this.togglePause(); });
    const btns = document.createElement('div'); btns.id = 'hud-buttons';
    btns.innerHTML = `<h3>🔨 Build</h3>
      <button id="b-mill">🪵 Lumber Mill<br><small>15 Wood (BP)</small></button>
      <button id="b-qry">⛏️ Quarry<br><small>15 Stone (BP)</small></button>
      <button id="b-ig">🏠 Igloo<br><small>10 Snow+5 Wood (BP)</small></button>
      <button id="b-wh">🏡 Wood House<br><small>60 Wood (Base)</small></button>
      <button id="b-sh">🏰 Stone House<br><small>100 Stone+40 Wood (Base)</small></button>
      <button id="b-fence">🪵 Fence<br><small>5 Wood (BP)</small></button>
      <hr style="border-color:rgba(255,255,255,.1);margin:6px 0">
      <h3>⚔️ Craft</h3>
      <button id="c-bow">🏹 Craft Bow<br><small>20 Wood (Base)</small></button>
      <button id="c-arr">🏹 Craft 5× Arrows<br><small>2 Wood+2 Stone (BP)</small></button>
      <button id="c-coat">🧥 Fur Coat<br><small>5 Pelts (BP)</small></button>
      <hr style="border-color:rgba(255,255,255,.1);margin:6px 0">
      <button id="b-eat">🫐 Eat Berry [F]<br><small>+20 Hunger</small></button>
      <button id="b-meat">🥩 Eat Meat [E]<br><small>+50 Hunger</small></button>`;
    document.body.appendChild(btns);
    const timer = document.createElement('div'); timer.id = 'hud-timer'; document.body.appendChild(timer);
    document.getElementById('b-mill')!.onclick = () => this.enterBld('mill', 'lumberMill', 0.18);
    document.getElementById('b-qry')!.onclick = () => this.enterBld('quarry', 'stoneQuarry', 0.18);
    document.getElementById('b-ig')!.onclick = () => this.enterBld('igloo', 'igloo', 0.18);
    document.getElementById('b-wh')!.onclick = () => this.enterBld('woodHouse', 'woodHouse', 0.18);
    document.getElementById('b-sh')!.onclick = () => this.enterBld('stoneHouse', 'stoneHouse', 0.18);
    document.getElementById('b-fence')!.onclick = () => this.enterBld('fence', 'fenceTex', 1.0);
    document.getElementById('c-bow')!.onclick = () => this.craftBow();
    document.getElementById('c-arr')!.onclick = () => this.craftArrows();
    document.getElementById('c-coat')!.onclick = () => this.craftCoat();
    document.getElementById('b-eat')!.onclick = () => this.eatBerry();
    document.getElementById('b-meat')!.onclick = () => this.eatMeat();
    // drop buttons
    document.getElementById('d-w')!.onclick = () => this.dropItem('wood');
    document.getElementById('d-s')!.onclick = () => this.dropItem('stone');
    document.getElementById('d-n')!.onclick = () => this.dropItem('snow');
    document.getElementById('d-b')!.onclick = () => this.dropItem('berries');
    document.getElementById('d-a')!.onclick = () => this.dropItem('arrows');
    document.getElementById('d-p')!.onclick = () => this.dropItem('pelts');
    document.getElementById('d-m')!.onclick = () => this.dropItem('meat');
    this.msgEl = document.createElement('div'); this.msgEl.id = 'game-msg'; document.body.appendChild(this.msgEl);
  }
  private dropItem(key: 'wood' | 'stone' | 'snow' | 'berries' | 'arrows' | 'pelts' | 'meat') {
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
    $('bp-w')!.textContent = `🪵 Wood: ${this.bp.wood}`;
    $('bp-s')!.textContent = `🪨 Stone: ${this.bp.stone}`;
    $('bp-n')!.textContent = `❄️ Snow: ${this.bp.snow}`;
    $('bp-b')!.textContent = `🫐 Berries: ${this.bp.berries}`;
    $('bp-a')!.textContent = `🏹 Arrows: ${this.bp.arrows}`;
    $('bp-p')!.textContent = `🦊 Pelts: ${this.bp.pelts}`;
    $('bp-m')!.textContent = `🥩 Meat: ${this.bp.meat}`;
    const tot = $('bp-total'); if (tot) tot.textContent = `${this.bpTotal()}/${CAP}`;
    $('bs-w')!.textContent = `🪵 Wood: ${baseWood}`;
    $('bs-s')!.textContent = `🪨 Stone: ${baseStone}`;
    const bowBtn = $('c-bow'); if (bowBtn) (bowBtn as HTMLButtonElement).style.display = hasBow ? 'none' : '';
    const coatBtn = $('c-coat'); if (coatBtn) (coatBtn as HTMLButtonElement).style.display = hasCoat ? 'none' : '';
    const t = $('hud-timer')!;
    if (this.sOn) { const l = Math.ceil((STORM_LEN - this.sElap) / 1000); t.textContent = `❄️ Blizzard: ${l}s`; t.style.color = '#ff6666'; }
    else { t.textContent = ''; }
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
  }
  private exitShelter() {
    if (!this.isInside) return; const b = this.isInside; this.isInside = null;
    this.p.setAlpha(1); this.p.setPosition(b.sprite.x, b.sprite.y + b.sprite.displayHeight / 2 + 20);
    this.msg('Exited shelter.');
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
      this.p.setPosition(MW / 2, MH / 2 + 120);
      this.playerHp = this.MAX_HP; this.playerHunger = this.MAX_HUNGER; this.hungerClock = 0;
      this.bp = { wood: 0, stone: 0, snow: 0, berries: 0, arrows: 0, pelts: 0, meat: 0 };
      this.scene.resume();
      this.msg('Respawned at base.');
    };
  }
}

/* ── boot ── */
new Phaser.Game({
  type: Phaser.WEBGL,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#eef7fa',
  parent: 'app',
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: Game,
});
