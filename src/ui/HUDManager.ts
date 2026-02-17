import { FURNACE_LOG_CAP, FURNACE_RUBBLE_CAP, MILL_PLANK_CAP, QRY_BRICK_CAP, BOW_DUR, STORM_LEN, FUEL_TICK } from '../constants';

/** Data bag the Game scene passes to HUDManager.refresh() each frame */
export interface HUDState {
  playerHp: number;
  maxHp: number;
  playerHunger: number;
  maxHunger: number;
  playerTemp: number;
  maxTemp: number;
  bp: { logs: number; rubble: number; snow: number; berries: number; arrows: number; pelts: number; meat: number; iron: number; torches: number };
  bpTotal: number;
  cap: number;
  toolTier: number;
  toolDurability: number;
  toolMaxDurability: number;
  hasBow: boolean;
  bowDurability: number;
  inDeepFreeze: boolean;
  baseLogs: number;
  baseRubble: number;
  basePlanks: number;
  baseBricks: number;
  millInputLogs: number;
  qryInputRubble: number;
  hasMill: boolean;
  hasQry: boolean;
  hasAnvil: boolean;
  hasResearchTable: boolean;
  currentOutfit: 'steam' | 'hooded';
  hasBag: boolean;
  hasSled: boolean;
  techThickSkin: boolean;
  techEfficiency: boolean;
  furnaceLvl: number;
  furnaceMobile: boolean;
  hasWorkerForMill: boolean;
  hasWorkerForQry: boolean;
  stormOn: boolean;
  stormElapsed: number;
  fuelTimer: number;
  furnaceLit: boolean;
}

/**
 * Creates the left-side status HUD HTML.
 * Returns the outermost div element (not yet appended to body).
 */
export function createStatusHUD(cap: number): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'game-hud';
  el.innerHTML = `
    <div class="hud-section"><h3>🌡️ Warmth</h3><div id="temp-bar-outer"><div id="temp-bar-inner"></div></div></div>
    <div class="hud-section"><h3>❤️ Health</h3><div id="hp-bar-outer"><div id="hp-bar-inner"></div></div></div>
    <div class="hud-section"><h3>🍖 Hunger</h3><div id="hunger-bar-outer"><div id="hunger-bar-inner"></div></div></div>
    <div class="hud-section"><h3>🎒 Backpack <span id="bp-total">0/${cap}</span></h3>
      <div class="bp-row"><span id="bp-w">🪵 Logs: 0</span><button class="drop-btn" id="d-w">➖</button></div>
      <div class="bp-row"><span id="bp-s">🪨 Rubble: 0</span><button class="drop-btn" id="d-s">➖</button></div>
      <div class="bp-row"><span id="bp-n">❄️ Snow: 0</span><button class="drop-btn" id="d-n">➖</button></div>
      <div class="bp-row"><span id="bp-b">🪐 Berries: 0</span><button class="drop-btn" id="d-b">➖</button></div>
      <div class="bp-row"><span id="bp-a">🏹 Arrows: 0</span><button class="drop-btn" id="d-a">➖</button></div>
      <div class="bp-row"><span id="bp-p">🦊 Pelts: 0</span><button class="drop-btn" id="d-p">➖</button></div>
      <div class="bp-row"><span id="bp-m">🥩 Meat: 0</span><button class="drop-btn" id="d-m">➖</button></div>
      <div class="bp-row"><span id="bp-i">⛏️ Iron: 0</span><button class="drop-btn" id="d-i">➖</button></div>
      <div class="bp-row"><span id="bp-t">🔥 Torches: 0</span><button class="drop-btn" id="d-t">➖</button></div>
    </div>
    <div class="hud-section"><div id="tool-info" style="color:#aaa;font-size:12px">✋ No Tools</div></div>
    <div class="hud-section"><div id="bow-info" style="color:#aaa;font-size:12px"></div></div>
    <div id="deep-freeze-warn" style="display:none;color:#ff4444;font-weight:bold;text-align:center;padding:4px;background:rgba(0,0,40,0.7);border:1px solid #ff4444;border-radius:4px;margin:4px 0;font-size:12px">❄️ DEEP FREEZE ❄️</div>
    <div class="hud-section"><h3>🔥 Furnace</h3>
      <div id="bs-fl">🪵 Logs: 0/30</div><div id="bs-fr">🪨 Rubble: 0/30</div>
      <div id="fuel-bar-outer" style="height:8px;background:#333;border-radius:4px;margin-top:4px;overflow:hidden"><div id="fuel-bar-inner" style="height:100%;width:100%;background:#ff8822;transition:width 0.3s"></div></div>
      <div id="fuel-label" style="font-size:11px;color:#ccc;margin-top:2px">⏱ Fuel: --</div>
    </div>
    <div class="hud-section" id="hud-mill" style="display:none"><h3>🪵 Mill</h3>
      <div id="bs-mp">📦 Planks: 0/100</div><div id="bs-mi">🪵 Queue: 0</div></div>
    <div class="hud-section" id="hud-qry" style="display:none"><h3>⛏️ Quarry</h3>
      <div id="bs-qb">🧱 Bricks: 0/100</div><div id="bs-qi">🪨 Queue: 0</div></div>`;
  return el;
}

/**
 * Creates the right-side action buttons panel HTML.
 * Returns the outermost div element (not yet appended to body).
 */
export function createButtonsPanel(): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'hud-buttons';
  el.innerHTML = `
    <div class="hud-dropdown">
      <h3 class="hud-dropdown-toggle">🔨 Build <span class="dd-arrow">▼</span></h3>
      <div class="hud-dropdown-content">
        <button id="b-mill">🪵 Lumber Mill<br><small>15 Logs (BP)</small></button>
        <button id="b-qry">⛏️ Quarry<br><small>15 Rubble (BP)</small></button>
        <button id="b-anvil">🔨 Anvil<br><small>15 Bricks+10 Iron (BP)</small></button>
        <button id="b-rtable">🔬 Research Table<br><small>15 Logs+10 Bricks</small></button>
        <button id="b-ig">🏠 Igloo<br><small>10 Snow+5 Logs (BP)</small></button>
        <button id="b-wh">🏡 Wood House<br><small>40 Planks (Mill)</small></button>
        <button id="b-sh">🏰 Stone House<br><small>60 Bricks+20 Planks</small></button>
        <button id="b-wwall">🧱 Wood Wall<br><small>2 Planks (Mill)</small></button>
        <button id="b-wgate">🚪 Wood Gate<br><small>5 Planks (Mill)</small></button>
        <button id="b-swall">🧱 Stone Wall<br><small>2 Bricks (Qry)</small></button>
        <button id="b-sgate">🚪 Stone Gate<br><small>5 Bricks (Qry)</small></button>
      </div>
    </div>
    <div class="hud-dropdown">
      <h3 class="hud-dropdown-toggle">⚔️ Craft <span class="dd-arrow">▼</span></h3>
      <div class="hud-dropdown-content">
        <button id="c-stools">🪨 Stone Tools<br><small>3 Logs+5 Rubble (BP)</small></button>
        <button id="c-itools">⛏️ Iron Tools<br><small>5 Iron+10 Planks (Anvil)</small></button>
        <button id="c-bow">🏹 Craft Bow<br><small>10 Planks (Mill)</small></button>
        <button id="c-arr">🏹 Craft 5× Arrows<br><small>2 Logs+2 Rubble (BP)</small></button>
        <button id="c-torch">🔥 Craft Torch<br><small>2 Logs+1 Pelt (BP)</small></button>
        <button id="c-coat">🧥 Hooded Parka<br><small>5 Pelts (🔬 Table)</small></button>
        <button id="c-bag">🎒 Leather Bag<br><small>10 Pelts+10 Planks (🔬 Table)</small></button>
        <button id="c-sled">🛷 Build Sled<br><small>20 Planks+5 Iron+5 Pelts (🔬 Table)</small></button>
      </div>
    </div>
    <div class="hud-dropdown">
      <h3 class="hud-dropdown-toggle">🍽️ Actions <span class="dd-arrow">▼</span></h3>
      <div class="hud-dropdown-content">
        <button id="b-torch">🔥 Place Torch [C]<br><small>1 Torch (BP)</small></button>
        <button id="b-trap">🪤 Snare Trap [T]<br><small>2 Logs+1 Meat (BP)</small></button>
        <button id="b-eat">🫐 Eat Berry [F]<br><small>+20 Hunger</small></button>
        <button id="b-meat">🥩 Eat Meat [E]<br><small>+50 Hunger</small></button>
      </div>
    </div>
    <div class="hud-dropdown">
      <h3 class="hud-dropdown-toggle">🔥 Furnace <span class="dd-arrow">▶</span></h3>
      <div class="hud-dropdown-content" style="display:none">
        <button id="b-fup2">⬆️ Upgrade Lvl 2<br><small>30 Planks+30 Bricks</small></button>
        <button id="b-fup3">⬆️ Upgrade Lvl 3<br><small>60P+60B+10 Pelts</small></button>
        <button id="b-tracks">🚜 Build Tracks<br><small>50 Bricks+50 Iron (BP)</small></button>
      </div>
    </div>
    <div class="hud-dropdown">
      <h3 class="hud-dropdown-toggle">🔬 Research <span class="dd-arrow">▶</span></h3>
      <div class="hud-dropdown-content" style="display:none">
        <button id="r-thick">🔬 Thick Skin<br><small>20 Pelts+10 Meat (Near Table)</small></button>
        <button id="r-eff">🔬 Efficiency<br><small>20 Iron+20 Planks (Near Table)</small></button>
      </div>
    </div>
    <div class="hud-dropdown">
      <h3 class="hud-dropdown-toggle">👷 Workers <span class="dd-arrow">▶</span></h3>
      <div class="hud-dropdown-content" style="display:none">
        <button id="h-lumber">👷 Hire Lumberjack<br><small>10 Meat+5 Planks (near Mill)</small></button>
        <button id="h-miner">👷 Hire Miner<br><small>10 Meat+5 Planks (near Quarry)</small></button>
      </div>
    </div>`;
  return el;
}

/** Wire up the dropdown toggle click handlers on a buttons panel */
export function wireDropdowns(container: HTMLElement): void {
  container.querySelectorAll('.hud-dropdown-toggle').forEach(toggle => {
    (toggle as HTMLElement).style.cursor = 'pointer';
    (toggle as HTMLElement).style.pointerEvents = 'auto';
    toggle.addEventListener('click', () => {
      const content = toggle.nextElementSibling as HTMLElement;
      const arrow = toggle.querySelector('.dd-arrow') as HTMLElement;
      if (!content) return;
      const open = content.style.display !== 'none';
      content.style.display = open ? 'none' : 'flex';
      if (arrow) arrow.textContent = open ? '▶' : '▼';
    });
  });
}

/** Create the virtual touch controls (D-pad + action buttons) */
export function createTouchControls(): { dpad: HTMLDivElement; actions: HTMLDivElement } {
  const dpad = document.createElement('div');
  dpad.id = 'touch-dpad';
  dpad.innerHTML = `<button class="dpad-btn" id="dpad-up">▲</button><div class="dpad-row"><button class="dpad-btn" id="dpad-left">◄</button><button class="dpad-btn" id="dpad-right">►</button></div><button class="dpad-btn" id="dpad-down">▼</button>`;
  document.body.appendChild(dpad);

  const actions = document.createElement('div');
  actions.id = 'touch-actions';
  actions.innerHTML = `<button class="touch-btn" id="touch-action">⛏️</button><button class="touch-btn" id="touch-trap">🪤</button><button class="touch-btn" id="touch-rotate" style="display:none">🔄</button><button class="touch-btn" id="touch-cancel" style="display:none">✖️</button>`;
  document.body.appendChild(actions);

  return { dpad, actions };
}

/** Update all HUD DOM elements from the current game state */
export function refreshHUD(s: HUDState): void {
  const $ = (id: string) => document.getElementById(id);
  if (!$('bp-w')) return;

  // bars
  const hpI = $('hp-bar-inner') as HTMLDivElement;
  if (hpI) { const p = s.playerHp / s.maxHp; hpI.style.width = `${p * 100}%`; hpI.style.background = p > 0.5 ? '#e04050' : p > 0.25 ? '#cc8833' : '#ff2222'; }
  const huI = $('hunger-bar-inner') as HTMLDivElement;
  if (huI) { const p = s.playerHunger / s.maxHunger; huI.style.width = `${p * 100}%`; huI.style.background = p > 0.5 ? '#dd8822' : p > 0.25 ? '#cc6622' : '#ff3311'; }
  const tmpI = $('temp-bar-inner') as HTMLDivElement;
  if (tmpI) { const p = s.playerTemp / s.maxTemp; tmpI.style.width = `${p * 100}%`; tmpI.style.background = p > 0.5 ? '#44aadd' : p > 0.25 ? '#6688cc' : '#8866aa'; }

  // backpack
  $('bp-w')!.textContent = `🪵 Logs: ${s.bp.logs}`;
  $('bp-s')!.textContent = `🪨 Rubble: ${s.bp.rubble}`;
  $('bp-n')!.textContent = `❄️ Snow: ${s.bp.snow}`;
  $('bp-b')!.textContent = `🪐 Berries: ${s.bp.berries}`;
  $('bp-a')!.textContent = `🏹 Arrows: ${s.bp.arrows}`;
  $('bp-p')!.textContent = `🦊 Pelts: ${s.bp.pelts}`;
  $('bp-m')!.textContent = `🥩 Meat: ${s.bp.meat}`;
  const ib = $('bp-i'); if (ib) ib.textContent = `⛏️ Iron: ${s.bp.iron}`;
  const tb = $('bp-t'); if (tb) tb.textContent = `🔥 Torches: ${s.bp.torches}`;
  const tot = $('bp-total'); if (tot) tot.textContent = `${s.bpTotal}/${s.cap}`;

  // tool & bow
  const ti = $('tool-info');
  if (ti) {
    const names = ['✋ Hands', '🪨 Stone Tools', '⛏️ Iron Tools'];
    ti.textContent = s.toolTier > 0 ? `${names[s.toolTier]} (${s.toolDurability}/${s.toolMaxDurability})` : names[0];
    ti.style.color = s.toolTier === 0 ? '#aaa' : s.toolTier === 1 ? '#ccbb66' : '#ff9944';
  }
  const bi = $('bow-info');
  if (bi) bi.textContent = s.hasBow ? `🏹 Bow (${s.bowDurability}/${BOW_DUR})` : '';

  // deep freeze warning
  const df = $('deep-freeze-warn');
  if (df) df.style.display = s.inDeepFreeze ? '' : 'none';

  // furnace storage
  $('bs-fl')!.textContent = `🪵 Logs: ${s.baseLogs}/${FURNACE_LOG_CAP}`;
  $('bs-fr')!.textContent = `🪨 Rubble: ${s.baseRubble}/${FURNACE_RUBBLE_CAP}`;

  // mill & quarry sections
  const hudMill = $('hud-mill'); if (hudMill) hudMill.style.display = s.hasMill ? '' : 'none';
  $('bs-mp')!.textContent = `📦 Planks: ${s.basePlanks}/${MILL_PLANK_CAP}`;
  $('bs-mi')!.textContent = `🪵 Queue: ${s.millInputLogs}`;
  const hudQry = $('hud-qry'); if (hudQry) hudQry.style.display = s.hasQry ? '' : 'none';
  $('bs-qb')!.textContent = `🧱 Bricks: ${s.baseBricks}/${QRY_BRICK_CAP}`;
  $('bs-qi')!.textContent = `🪨 Queue: ${s.qryInputRubble}`;

  // fuel burn bar
  const fuelBar = $('fuel-bar-inner') as HTMLDivElement;
  const fuelLbl = $('fuel-label');
  if (fuelBar) {
    const remaining = FUEL_TICK - s.fuelTimer;
    const pct = s.furnaceLit ? (remaining / FUEL_TICK) * 100 : 0;
    fuelBar.style.width = `${pct}%`;
    fuelBar.style.background = s.furnaceLit ? '#ff8822' : '#555';
  }
  if (fuelLbl) {
    if (s.furnaceLit) {
      const secs = Math.ceil((FUEL_TICK - s.fuelTimer) / 1000);
      fuelLbl.textContent = `⏱ Next log in ${secs}s`;
      fuelLbl.style.color = '#ffaa44';
    } else {
      fuelLbl.textContent = '⏱ Furnace is OUT — add logs!';
      fuelLbl.style.color = '#ff4444';
    }
  }

  // conditional button visibility
  const hide = (id: string, cond: boolean) => { const e = $(id); if (e) (e as HTMLButtonElement).style.display = cond ? 'none' : ''; };
  hide('c-bow', s.hasBow);
  hide('c-coat', s.currentOutfit === 'hooded');
  hide('c-bag', s.hasBag);
  hide('c-sled', s.hasSled);
  hide('b-rtable', s.hasResearchTable);
  hide('r-thick', s.techThickSkin);
  hide('r-eff', s.techEfficiency);
  hide('b-anvil', s.hasAnvil);
  hide('h-lumber', !s.hasMill || s.hasWorkerForMill);
  hide('h-miner', !s.hasQry || s.hasWorkerForQry);
  hide('b-fup2', s.furnaceLvl >= 2);
  hide('b-fup3', s.furnaceLvl >= 3 || s.furnaceLvl < 2);
  const trBtn = $('b-tracks'); if (trBtn) (trBtn as HTMLButtonElement).style.display = (s.furnaceLvl >= 3 && !s.furnaceMobile) ? '' : 'none';

  // storm timer
  const t = $('hud-timer')!;
  if (s.stormOn) { const l = Math.ceil((STORM_LEN - s.stormElapsed) / 1000); t.textContent = `❄️ Blizzard: ${l}s`; t.style.color = '#ff6666'; }
  else { t.textContent = ''; }
}
