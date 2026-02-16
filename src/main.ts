import Phaser from 'phaser';
import './style.css';

/* ── globals ── */
let baseWood = 0;
let baseStone = 0;

const MW = 2400, MH = 2400, CAP = 20, SPEED = 220, RANGE = 130;
const STORM_LEN = 15_000, STORM_TICK = 5_000;
const DAY_LEN = 60_000, NIGHT_LEN = 60_000, FULL_DAY = DAY_LEN + NIGHT_LEN;
const HUNGER_TICK = 2_000, BUSH_REGROW = 30_000;
const WOLF_N = 6, WOLF_RANGE = 300, WOLF_DMG = 15, WOLF_KB = 180, WOLF_CD = 1000;
const WOLF_SLOW = 40, WOLF_FAST = 80;

interface Res { sprite: Phaser.GameObjects.Sprite; kind: 'wood' | 'stone' | 'snow' }
interface Bld {
  sprite: Phaser.GameObjects.Sprite; kind: string;
  hp: number; maxHp: number;
  bar: Phaser.GameObjects.Graphics; lbl: Phaser.GameObjects.Text;
}
interface Bush { sprite: Phaser.GameObjects.Sprite; ready: boolean; timer: number }
interface Wolf { sprite: Phaser.GameObjects.Sprite; body: Phaser.Physics.Arcade.Body; angle: number; cd: number }

class Game extends Phaser.Scene {
  private p!: Phaser.GameObjects.Sprite;
  private pb!: Phaser.Physics.Arcade.Body;
  private waddle: Phaser.Tweens.Tween | null = null;
  private k!: Record<string, Phaser.Input.Keyboard.Key>;
  private arrows!: Phaser.Types.Input.Keyboard.CursorKeys;

  private bp = { wood: 0, stone: 0, snow: 0, berries: 0 };
  private res: Res[] = [];
  private blds: Bld[] = [];
  private furnace: Bld | null = null;
  private mill: Bld | null = null;
  private qry: Bld | null = null;
  private wPiles: Phaser.GameObjects.Sprite[] = [];
  private sPiles: Phaser.GameObjects.Sprite[] = [];

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
  private nightOvr!: Phaser.GameObjects.Rectangle;
  private dayLabel!: Phaser.GameObjects.Text;

  // storm (triggered by night)
  private sOn = false;
  private sElap = 0;
  private sDmg = 0;
  private sOvr!: Phaser.GameObjects.Rectangle;
  private sLbl!: Phaser.GameObjects.Text;

  // bushes & wolves
  private bushes: Bush[] = [];
  private wolves: Wolf[] = [];

  private hudEl!: HTMLDivElement;
  private msgEl!: HTMLDivElement;
  private msgT: number | null = null;

  constructor() { super('Game'); }

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
  }

  create() {
    this.physics.world.setBounds(0, 0, MW, MH);
    this.cameras.main.setBounds(0, 0, MW, MH);
    this.genTex();

    // ground snow dots
    for (let i = 0; i < 80; i++) {
      this.add.circle(
        Phaser.Math.Between(40, MW - 40), Phaser.Math.Between(40, MH - 40),
        Phaser.Math.Between(2, 7), 0xd4ecf7, 0.35
      ).setDepth(0);
    }

    // player
    this.p = this.add.sprite(MW / 2, MH / 2 + 120, 'plr');
    this.physics.add.existing(this.p);
    this.pb = this.p.body as Phaser.Physics.Arcade.Body;
    this.pb.setCollideWorldBounds(true);
    this.pb.setSize(22, 10).setOffset(3, 34);
    this.cameras.main.startFollow(this.p, true, 0.09, 0.09);

    // furnace
    this.furnace = this.addBld(MW / 2, MH / 2 - 80, 'baseFurnace', 'furnace', 999, 999, 0.22);

    // resources + bushes
    this.scatter();

    // wolves
    this.spawnWolves();

    // input
    const kb = this.input.keyboard!;
    this.k = { W: kb.addKey('W'), A: kb.addKey('A'), S: kb.addKey('S'), D: kb.addKey('D'), SP: kb.addKey('SPACE') };
    this.arrows = kb.createCursorKeys();
    kb.addKey('ESC').on('down', () => this.cancelBld());
    kb.addKey('F').on('down', () => this.eatBerry());
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this.bMode && ptr.leftButtonDown()) this.placeBld(ptr.worldX, ptr.worldY);
      if (this.bMode && ptr.rightButtonDown()) this.cancelBld();
    });

    // night overlay (depth 8900, below blizzard 9000)
    const cam = this.cameras.main;
    this.nightOvr = this.add.rectangle(cam.width / 2, cam.height / 2, cam.width + 200, cam.height + 200, 0x0a1128, 0)
      .setScrollFactor(0).setDepth(8900);

    // day label
    this.dayLabel = this.add.text(cam.width / 2, 20, '', {
      fontSize: '16px', color: '#ffe', fontFamily: 'Arial',
      stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9002);

    // storm overlay
    this.sOvr = this.add.rectangle(cam.width / 2, cam.height / 2, cam.width + 200, cam.height + 200, 0xaaddff, 0)
      .setScrollFactor(0).setDepth(9000);
    this.sLbl = this.add.text(cam.width / 2, 50, '❄️ BLIZZARD! ❄️', {
      fontSize: '32px', color: '#fff', fontFamily: 'Arial Black,Arial',
      stroke: '#1a3a5c', strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9001).setAlpha(0);

    this.createHUD();
  }

  update(_t: number, dt: number) {
    if (!this.isInside) {
      let vx = 0, vy = 0;
      if (this.k.A.isDown || this.arrows.left.isDown) vx = -1;
      else if (this.k.D.isDown || this.arrows.right.isDown) vx = 1;
      if (this.k.W.isDown || this.arrows.up.isDown) vy = -1;
      else if (this.k.S.isDown || this.arrows.down.isDown) vy = 1;
      const len = Math.sqrt(vx * vx + vy * vy) || 1;
      this.pb.setVelocity(vx / len * SPEED, vy / len * SPEED);
      const moving = vx !== 0 || vy !== 0;
      if (moving && !this.waddle) {
        this.waddle = this.tweens.add({ targets: this.p, scaleY: { from: 1, to: 0.88 }, scaleX: { from: 1, to: 1.12 }, duration: 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (!moving && this.waddle) {
        this.waddle.stop(); this.waddle = null; this.p.setScale(1);
      }
      if (vx < 0) this.p.setFlipX(true); else if (vx > 0) this.p.setFlipX(false);
    } else {
      this.pb.setVelocity(0, 0);
      if (this.waddle) { this.waddle.stop(); this.waddle = null; this.p.setScale(1); }
    }

    if (this.k.SP.isDown) { this.gcd -= dt; if (this.gcd <= 0) { this.interact(); this.gcd = 400; } } else this.gcd = 0;

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
    this.tickWolves(dt);
    this.refreshHUD();
  }

  /* ─── textures ─── */
  private genTex() {
    // player
    const pg = this.add.graphics();
    pg.fillStyle(0x4488ff); pg.fillRoundedRect(2, 4, 24, 32, 6);
    pg.fillStyle(0x88bbff); pg.fillRect(4, 28, 20, 8);
    pg.fillStyle(0xffffff); pg.fillCircle(10, 16, 4); pg.fillCircle(18, 16, 4);
    pg.fillStyle(0x222244); pg.fillCircle(11, 16, 2); pg.fillCircle(19, 16, 2);
    pg.fillStyle(0xcc3333); pg.fillRoundedRect(4, 0, 20, 10, { tl: 6, tr: 6, bl: 0, br: 0 });
    pg.fillStyle(0xffffff); pg.fillCircle(14, 0, 4);
    pg.generateTexture('plr', 28, 44); pg.destroy();

    // bush & wolf textures now loaded from PNGs in preload()
  }

  /* ─── resources ─── */
  private scatter() {
    const rng = (a: number, b: number) => Phaser.Math.Between(a, b);
    const cx = MW / 2, cy = MH / 2;
    const far = (x: number, y: number) => Phaser.Math.Distance.Between(x, y, cx, cy) > 350;
    const mk = (tex: string, kind: 'wood' | 'stone' | 'snow', n: number, sc: number) => {
      for (let i = 0; i < n; i++) {
        let x: number, y: number;
        do { x = rng(80, MW - 80); y = rng(80, MH - 80); } while (!far(x, y));
        this.res.push({ sprite: this.add.sprite(x, y, tex).setScale(sc), kind });
      }
    };
    mk('tree', 'wood', 35, 0.12);
    mk('rock', 'stone', 20, 0.12);
    mk('snowPile', 'snow', 18, 0.12);

    // bushes
    for (let i = 0; i < 15; i++) {
      let x: number, y: number;
      do { x = rng(80, MW - 80); y = rng(80, MH - 80); } while (!far(x, y));
      this.bushes.push({ sprite: this.add.sprite(x, y, 'bushFull').setScale(0.12), ready: true, timer: 0 });
    }
  }

  /* ─── wolves ─── */
  private spawnWolves() {
    const cx = MW / 2, cy = MH / 2;
    for (let i = 0; i < WOLF_N; i++) {
      let x: number, y: number;
      do {
        x = Phaser.Math.Between(100, MW - 100);
        y = Phaser.Math.Between(100, MH - 100);
      } while (Phaser.Math.Distance.Between(x, y, cx, cy) < 500);
      const sprite = this.add.sprite(x, y, 'wolfDay').setScale(0.12);
      this.physics.add.existing(sprite);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setCollideWorldBounds(true);
      this.wolves.push({ sprite, body, angle: Math.random() * Math.PI * 2, cd: 0 });
    }
  }

  /* ─── day/night ─── */
  private tickDayNight(dt: number) {
    this.dayClock += dt;
    if (this.dayClock >= FULL_DAY) this.dayClock -= FULL_DAY;

    const wasNight = this.isNight;
    this.isNight = this.dayClock >= DAY_LEN;

    // transition to night
    if (this.isNight && !wasNight) {
      this.tweens.add({ targets: this.nightOvr, alpha: 0.6, duration: 3000, ease: 'Sine.easeInOut' });
      if (!this.sOn) this.startStorm(); // daily blizzard at nightfall
    }
    // transition to day
    if (!this.isNight && wasNight) {
      this.tweens.add({ targets: this.nightOvr, alpha: 0, duration: 3000, ease: 'Sine.easeInOut' });
    }

    // day label
    if (this.isNight) {
      const left = Math.ceil((FULL_DAY - this.dayClock) / 1000);
      this.dayLabel.setText(`🌙 Night: ${left}s`);
    } else {
      const left = Math.ceil((DAY_LEN - this.dayClock) / 1000);
      this.dayLabel.setText(`☀️ Day: ${left}s`);
    }
  }

  /* ─── interact ─── */
  private interact() {
    if (this.isInside) { this.exitShelter(); return; }
    const px = this.p.x, py = this.p.y;
    // furnace deposit
    if (this.furnace) {
      const d = Phaser.Math.Distance.Between(px, py, this.furnace.sprite.x, this.furnace.sprite.y);
      if (d < RANGE && (this.bp.wood > 0 || this.bp.stone > 0)) {
        const w = this.bp.wood, s = this.bp.stone;
        this.bp.wood = 0; this.bp.stone = 0;
        baseWood += w; baseStone += s;
        const parts: string[] = [];
        if (w > 0) parts.push(`${w} wood`);
        if (s > 0) parts.push(`${s} stone`);
        this.msg(`+${parts.join(' + ')} → Base Storage`);
        this.pileVis(); return;
      }
    }
    // mill deposit
    if (this.mill) {
      const d = Phaser.Math.Distance.Between(px, py, this.mill.sprite.x, this.mill.sprite.y);
      if (d < RANGE && this.bp.wood > 0) { const a = this.bp.wood; this.bp.wood = 0; baseWood += a; this.msg(`+${a} wood → Base`); this.pileVis(); return; }
    }
    // quarry deposit
    if (this.qry) {
      const d = Phaser.Math.Distance.Between(px, py, this.qry.sprite.x, this.qry.sprite.y);
      if (d < RANGE && this.bp.stone > 0) { const a = this.bp.stone; this.bp.stone = 0; baseStone += a; this.msg(`+${a} stone → Base`); this.pileVis(); return; }
    }
    // enter shelter
    const shelterKinds = ['igloo', 'woodHouse', 'stoneHouse'];
    for (const b of this.blds) {
      if (!shelterKinds.includes(b.kind)) continue;
      const d = Phaser.Math.Distance.Between(px, py, b.sprite.x, b.sprite.y);
      if (d < RANGE) { this.enterShelter(b); return; }
    }
    // gather berries from bush
    for (const bu of this.bushes) {
      if (!bu.ready) continue;
      const d = Phaser.Math.Distance.Between(px, py, bu.sprite.x, bu.sprite.y);
      if (d < RANGE) {
        if (this.bp.berries >= CAP) { this.msg('Berries full!'); return; }
        this.bp.berries++;
        bu.ready = false; bu.timer = 0;
        bu.sprite.setTexture('bushHarvested');
        this.tweens.add({ targets: bu.sprite, scaleX: bu.sprite.scaleX * 0.85, scaleY: bu.sprite.scaleY * 0.85, duration: 80, yoyo: true });
        return;
      }
    }
    // gather nearest resource
    let best: Res | null = null, bd = RANGE;
    for (const r of this.res) { if (!r.sprite.active) continue; const d = Phaser.Math.Distance.Between(px, py, r.sprite.x, r.sprite.y); if (d < bd) { bd = d; best = r; } }
    if (!best) return;
    const k = best.kind;
    if (this.bp[k] >= CAP) { this.msg(`${k} full!`); return; }
    this.bp[k]++;
    if (k === 'stone') { best.sprite.setTexture('rockHit'); this.time.delayedCall(200, () => { if (best!.sprite.active) best!.sprite.setTexture('rock'); }); }
    if (k === 'wood') { best.sprite.setTexture('treeHit'); this.time.delayedCall(250, () => { if (best!.sprite.active) best!.sprite.setTexture(this.sOn ? 'treeBlizzard' : 'tree'); }); }
    this.tweens.add({ targets: best.sprite, scaleX: best.sprite.scaleX * 0.85, scaleY: best.sprite.scaleY * 0.85, duration: 80, yoyo: true });
  }

  /* ─── hunger ─── */
  private tickHunger(dt: number) {
    this.hungerClock += dt;
    if (this.hungerClock >= HUNGER_TICK) {
      this.hungerClock -= HUNGER_TICK;
      if (this.playerHunger > 0) {
        this.playerHunger--;
      } else {
        this.playerHp = Math.max(0, this.playerHp - 1);
        if (this.playerHp <= 0) this.gameOver('starved');
      }
    }
  }

  private eatBerry() {
    if (this.bp.berries <= 0) { this.msg('No berries to eat!'); return; }
    this.bp.berries--;
    this.playerHunger = Math.min(this.MAX_HUNGER, this.playerHunger + 20);
    this.msg(`Ate a berry! +20 hunger (${this.playerHunger}/${this.MAX_HUNGER})`);
  }

  private tickBushes(dt: number) {
    for (const bu of this.bushes) {
      if (bu.ready) continue;
      bu.timer += dt;
      if (bu.timer >= BUSH_REGROW) {
        bu.ready = true; bu.timer = 0;
        bu.sprite.setTexture('bushFull');
      }
    }
  }

  /* ─── wolves ─── */
  private tickWolves(dt: number) {
    const px = this.p.x, py = this.p.y;
    const aggro = this.isNight || this.sOn;
    const spd = aggro ? WOLF_FAST : WOLF_SLOW;

    for (const w of this.wolves) {
      w.cd = Math.max(0, w.cd - dt);
      const d = Phaser.Math.Distance.Between(w.sprite.x, w.sprite.y, px, py);

      if (aggro && d < WOLF_RANGE && !this.isInside) {
        // chase player
        const ang = Phaser.Math.Angle.Between(w.sprite.x, w.sprite.y, px, py);
        w.body.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd);
        if (w.sprite.texture.key !== 'wolfNight') w.sprite.setTexture('wolfNight');
        w.sprite.setFlipX(px < w.sprite.x);
      } else {
        // wander
        if (w.sprite.texture.key !== 'wolfDay') w.sprite.setTexture('wolfDay');
        if (Math.random() < 0.01) w.angle = Math.random() * Math.PI * 2;
        w.body.setVelocity(Math.cos(w.angle) * spd, Math.sin(w.angle) * spd);
        // bounce off edges
        if (w.sprite.x < 80 || w.sprite.x > MW - 80) w.angle = Math.PI - w.angle;
        if (w.sprite.y < 80 || w.sprite.y > MH - 80) w.angle = -w.angle;
      }

      // damage player on overlap
      if (!this.isInside && w.cd <= 0 && d < 30) {
        w.cd = WOLF_CD;
        this.playerHp = Math.max(0, this.playerHp - WOLF_DMG);
        this.cameras.main.shake(200, 0.008);
        // knockback
        const kb = Phaser.Math.Angle.Between(w.sprite.x, w.sprite.y, px, py);
        this.p.setPosition(px + Math.cos(kb) * WOLF_KB, py + Math.sin(kb) * WOLF_KB);
        this.msg(`🐺 Wolf attack! -${WOLF_DMG} HP`);
        if (this.playerHp <= 0) this.gameOver('mauled');
      }
    }
  }

  /* ─── buildings ─── */
  private addBld(x: number, y: number, tex: string, kind: string, hp: number, max: number, sc = 0.18): Bld {
    const sprite = this.add.sprite(x, y, tex).setScale(sc);
    const bar = this.add.graphics();
    const lbl = this.add.text(x, y - sprite.displayHeight / 2 - 20, '', { fontSize: '12px', color: '#fff', fontFamily: 'Arial', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    const b: Bld = { sprite, kind, hp, maxHp: max, bar, lbl };
    this.blds.push(b);
    this.drawBar(b);
    return b;
  }

  private drawBar(b: Bld) {
    b.bar.clear();
    const names: Record<string, string> = { furnace: '🔥 Furnace', mill: '🪵 Mill', quarry: '⛏️ Quarry', igloo: '🏠 Igloo', woodHouse: '🏡 Wood House', stoneHouse: '🏰 Stone House' };
    if (b.kind === 'furnace') { b.lbl.setPosition(b.sprite.x, b.sprite.y - b.sprite.displayHeight / 2 - 14); b.lbl.setText(names.furnace); return; }
    const w = 50, h = 6, bx = b.sprite.x - w / 2, by = b.sprite.y - b.sprite.displayHeight / 2 - 12;
    b.bar.fillStyle(0x333333, 0.8); b.bar.fillRect(bx, by, w, h);
    const pct = b.hp / b.maxHp;
    b.bar.fillStyle(pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xcccc44 : 0xcc4444); b.bar.fillRect(bx, by, w * pct, h);
    b.lbl.setPosition(b.sprite.x, by - 12);
    b.lbl.setText(`${names[b.kind] || b.kind} [${b.hp}/${b.maxHp}]`);
  }

  private enterBld(kind: string, tex: string, sc: number) {
    this.cancelBld();
    this.bMode = kind;
    this.bPrev = this.add.sprite(0, 0, tex).setScale(sc).setAlpha(0.5).setDepth(8000);
    this.msg(`Click to place. ESC to cancel.`);
  }
  private cancelBld() { if (this.bPrev) this.bPrev.destroy(); this.bPrev = null; this.bMode = null; }

  private placeBld(wx: number, wy: number) {
    const m = this.bMode!; this.cancelBld();
    switch (m) {
      case 'mill':
        if (this.mill) { this.msg('Already built!'); return; } if (this.bp.wood < 15) { this.msg('Need 15 wood in backpack'); return; }
        this.bp.wood -= 15; this.mill = this.addBld(wx, wy, 'lumberMill', 'mill', 15, 15); this.msg('Lumber Mill built!'); break;
      case 'quarry':
        if (this.qry) { this.msg('Already built!'); return; } if (this.bp.stone < 15) { this.msg('Need 15 stone in backpack'); return; }
        this.bp.stone -= 15; this.qry = this.addBld(wx, wy, 'stoneQuarry', 'quarry', 15, 15); this.msg('Quarry built!'); break;
      case 'igloo':
        if (this.bp.snow < 10 || this.bp.wood < 5) { this.msg('Need 10 snow + 5 wood (BP)'); return; }
        this.bp.snow -= 10; this.bp.wood -= 5; this.addBld(wx, wy, 'igloo', 'igloo', 3, 3); this.msg('Igloo built!'); break;
      case 'woodHouse':
        if (baseWood < 60) { this.msg('Need 60 wood in Base Storage'); return; }
        baseWood -= 60; this.addBld(wx, wy, 'woodHouse', 'woodHouse', 9, 9); this.pileVis(); this.msg('Wood House built!'); break;
      case 'stoneHouse':
        if (baseStone < 100 || baseWood < 40) { this.msg('Need 100 stone + 40 wood (Base)'); return; }
        baseStone -= 100; baseWood -= 40; this.addBld(wx, wy, 'stoneHouse', 'stoneHouse', 24, 24); this.pileVis(); this.msg('Stone House built!'); break;
    }
  }

  /* ─── pile visuals ─── */
  private pileVis() {
    for (const s of this.wPiles) s.destroy(); this.wPiles = [];
    if (this.mill) { const n = Math.min(Math.floor(baseWood / 5), 8); for (let i = 0; i < n; i++) this.wPiles.push(this.add.sprite(this.mill.sprite.x + 55 + (i % 4) * 22, this.mill.sprite.y + Math.floor(i / 4) * 22, 'woodPile').setScale(0.07)); }
    for (const s of this.sPiles) s.destroy(); this.sPiles = [];
    if (this.qry) { const n = Math.min(Math.floor(baseStone / 5), 8); for (let i = 0; i < n; i++) this.sPiles.push(this.add.sprite(this.qry.sprite.x + 55 + (i % 4) * 22, this.qry.sprite.y + Math.floor(i / 4) * 22, 'stonePile').setScale(0.07)); }
  }

  /* ─── blizzard ─── */
  private tickStorm(dt: number) {
    if (!this.sOn) return;
    this.sElap += dt;
    this.sOvr.setAlpha(0.15 + Math.sin(this.sElap / 400) * 0.05);
    this.sDmg -= dt;
    if (this.sDmg <= 0) { this.stormDmg(); this.sDmg = STORM_TICK; }
    if (this.sElap >= STORM_LEN) this.endStorm();
  }

  private startStorm() {
    this.sOn = true; this.sElap = 0; this.sDmg = STORM_TICK;
    this.sOvr.setFillStyle(0xaaddff, 0.15);
    this.sLbl.setAlpha(1);
    this.tweens.add({ targets: this.sLbl, alpha: { from: 1, to: 0.4 }, duration: 500, yoyo: true, repeat: -1 });
    for (const r of this.res) { if (r.kind === 'wood' && r.sprite.active) r.sprite.setTexture('treeBlizzard'); }
    this.msg('⚠️ Blizzard incoming!');
  }

  private stormDmg() {
    const rm: Bld[] = [];
    for (const b of this.blds) {
      if (b.kind === 'furnace') continue;
      b.hp--; this.drawBar(b);
      b.sprite.setTint(0xff6666); this.time.delayedCall(300, () => b.sprite.clearTint());
      if (b.hp <= 0) rm.push(b);
    }
    for (const b of rm) this.destroyBld(b);
    if (!this.isInside) {
      this.playerHp = Math.max(0, this.playerHp - 5);
      this.cameras.main.flash(300, 100, 150, 255, true);
      if (this.playerHp <= 0) this.gameOver('froze');
    }
  }

  private endStorm() {
    this.sOn = false;
    this.sOvr.setAlpha(0);
    this.tweens.killTweensOf(this.sLbl); this.sLbl.setAlpha(0);
    for (const r of this.res) { if (r.kind === 'wood' && r.sprite.active) r.sprite.setTexture('tree'); }
    this.msg('Blizzard passed.');
  }

  private destroyBld(b: Bld) {
    const wasInside = b === this.isInside;
    if (wasInside) this.exitShelter();
    this.tweens.add({ targets: b.sprite, alpha: 0, scaleX: 0, scaleY: 0, duration: 400, onComplete: () => { b.sprite.destroy(); b.bar.destroy(); b.lbl.destroy(); } });
    if (b === this.mill) { this.mill = null; this.pileVis(); }
    if (b === this.qry) { this.qry = null; this.pileVis(); }
    this.blds = this.blds.filter(x => x !== b);
    this.msg(wasInside ? 'Your shelter was destroyed! ❄️' : `${b.kind} destroyed!`);
  }

  /* ─── HUD ─── */
  private createHUD() {
    this.hudEl = document.createElement('div'); this.hudEl.id = 'game-hud';
    this.hudEl.innerHTML = `
      <div class="hud-section"><h3>❤️ Health</h3>
        <div id="hp-bar-outer"><div id="hp-bar-inner"></div></div></div>
      <div class="hud-section"><h3>🍖 Hunger</h3>
        <div id="hunger-bar-outer"><div id="hunger-bar-inner"></div></div></div>
      <div class="hud-section"><h3>🎒 Backpack</h3>
        <div id="bp-w">🪵 Wood: 0/${CAP}</div><div id="bp-s">🪨 Stone: 0/${CAP}</div>
        <div id="bp-n">❄️ Snow: 0/${CAP}</div><div id="bp-b">🫐 Berries: 0/${CAP}</div></div>
      <div class="hud-section"><h3>🏗️ Base Storage</h3>
        <div id="bs-w">🪵 Wood: 0</div><div id="bs-s">🪨 Stone: 0</div></div>`;
    document.body.appendChild(this.hudEl);

    const btns = document.createElement('div'); btns.id = 'hud-buttons';
    btns.innerHTML = `<h3>🔨 Build</h3>
      <button id="b-mill">🪵 Lumber Mill<br><small>15 Wood (BP)</small></button>
      <button id="b-qry">⛏️ Quarry<br><small>15 Stone (BP)</small></button>
      <button id="b-ig">🏠 Igloo<br><small>10 Snow+5 Wood (BP)</small></button>
      <button id="b-wh">🏡 Wood House<br><small>60 Wood (Base)</small></button>
      <button id="b-sh">🏰 Stone House<br><small>100 Stone+40 Wood (Base)</small></button>
      <hr style="border-color:rgba(255,255,255,.1);margin:6px 0">
      <button id="b-eat">🫐 Eat Berry [F]<br><small>+20 Hunger</small></button>`;
    document.body.appendChild(btns);

    const timer = document.createElement('div'); timer.id = 'hud-timer'; document.body.appendChild(timer);

    document.getElementById('b-mill')!.onclick = () => this.enterBld('mill', 'lumberMill', 0.18);
    document.getElementById('b-qry')!.onclick = () => this.enterBld('quarry', 'stoneQuarry', 0.18);
    document.getElementById('b-ig')!.onclick = () => this.enterBld('igloo', 'igloo', 0.18);
    document.getElementById('b-wh')!.onclick = () => this.enterBld('woodHouse', 'woodHouse', 0.18);
    document.getElementById('b-sh')!.onclick = () => this.enterBld('stoneHouse', 'stoneHouse', 0.18);
    document.getElementById('b-eat')!.onclick = () => this.eatBerry();

    this.msgEl = document.createElement('div'); this.msgEl.id = 'game-msg'; document.body.appendChild(this.msgEl);
  }

  private refreshHUD() {
    const $ = (id: string) => document.getElementById(id);
    if (!$('bp-w')) return;
    // health bar
    const hpI = $('hp-bar-inner') as HTMLDivElement;
    if (hpI) { const p = this.playerHp / this.MAX_HP; hpI.style.width = `${p * 100}%`; hpI.style.background = p > 0.5 ? '#e04050' : p > 0.25 ? '#cc8833' : '#ff2222'; }
    // hunger bar
    const huI = $('hunger-bar-inner') as HTMLDivElement;
    if (huI) { const p = this.playerHunger / this.MAX_HUNGER; huI.style.width = `${p * 100}%`; huI.style.background = p > 0.5 ? '#dd8822' : p > 0.25 ? '#cc6622' : '#ff3311'; }
    $('bp-w')!.textContent = `🪵 Wood: ${this.bp.wood}/${CAP}`;
    $('bp-s')!.textContent = `🪨 Stone: ${this.bp.stone}/${CAP}`;
    $('bp-n')!.textContent = `❄️ Snow: ${this.bp.snow}/${CAP}`;
    $('bp-b')!.textContent = `🫐 Berries: ${this.bp.berries}/${CAP}`;
    $('bs-w')!.textContent = `🪵 Wood: ${baseWood}`;
    $('bs-s')!.textContent = `🪨 Stone: ${baseStone}`;
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
    this.isInside = b;
    this.p.setAlpha(0.2);
    this.pb.setVelocity(0, 0);
    this.p.setPosition(b.sprite.x, b.sprite.y + 5);
    const names: Record<string, string> = { igloo: 'Igloo', woodHouse: 'Wood House', stoneHouse: 'Stone House' };
    this.msg(`Entered ${names[b.kind] || b.kind}. Press Space to exit.`);
  }

  private exitShelter() {
    if (!this.isInside) return;
    const b = this.isInside;
    this.isInside = null;
    this.p.setAlpha(1);
    this.p.setPosition(b.sprite.x, b.sprite.y + b.sprite.displayHeight / 2 + 20);
    this.msg('Exited shelter.');
  }

  private gameOver(cause: string = 'froze') {
    this.exitShelter();
    this.p.setAlpha(1);
    this.p.setPosition(MW / 2, MH / 2 + 120);
    this.playerHp = this.MAX_HP;
    this.playerHunger = this.MAX_HUNGER;
    this.hungerClock = 0;
    this.bp = { wood: 0, stone: 0, snow: 0, berries: 0 };
    const msgs: Record<string, string> = {
      froze: 'You froze to death!',
      starved: 'You starved to death!',
      mauled: 'You were mauled by wolves!',
    };
    const el = document.createElement('div');
    el.id = 'game-over';
    el.innerHTML = `<div>☠️ GAME OVER</div><div style="font-size:18px;margin-top:8px">${msgs[cause] || msgs.froze}</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.style.opacity = '1');
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }, 3000);
    this.msg('Respawned at base.');
  }
}

/* ── boot ── */
new Phaser.Game({
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#eef7fa',
  parent: 'app',
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: Game,
});
