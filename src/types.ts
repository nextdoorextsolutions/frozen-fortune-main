import Phaser from 'phaser';

export interface Res {
    sprite: Phaser.GameObjects.Sprite;
    kind: 'logs' | 'rubble' | 'snow' | 'iron';
    capacity?: number;
    ready?: boolean;
    timer?: number;
}

export interface Bld {
    sprite: Phaser.GameObjects.Sprite;
    kind: string;
    hp: number;
    maxHp: number;
    bar: Phaser.GameObjects.Graphics;
    lbl: Phaser.GameObjects.Text;
}

export interface Bush {
    sprite: Phaser.GameObjects.Sprite;
    ready: boolean;
    timer: number;
}

export interface Wolf {
    sprite: Phaser.GameObjects.Sprite;
    body: Phaser.Physics.Arcade.Body;
    angle: number;
    cd: number;
    hp: number;
    stunTimer: number;
    attackTarget: Bld | null;
    attackCd: number;
}

export interface Arrow {
    sprite: Phaser.GameObjects.Sprite;
    body: Phaser.Physics.Arcade.Body;
    vx: number;
    vy: number;
    life: number;
}

export interface Trap {
    sprite: Phaser.GameObjects.Sprite;
    body: Phaser.Physics.Arcade.Body;
}

export interface Deer {
    sprite: Phaser.GameObjects.Sprite;
    body: Phaser.Physics.Arcade.Body;
    angle: number;
    stunTimer: number;
}

export interface PlacedTorch {
    sprite: Phaser.GameObjects.Sprite;
    light: Phaser.GameObjects.Light;
    x: number;
    y: number;
}

export interface Worker {
    sprite: Phaser.GameObjects.Sprite;
    type: 'lumberjack' | 'miner';
    targetBld: Bld;
    timer: number;
    angle: number;
}

export interface GameState {
    player: { x: number; y: number; hp: number; hunger: number; temp: number };
    bp: { logs: number; rubble: number; snow: number; berries: number; arrows: number; pelts: number; meat: number; iron: number; torches: number };
    base: { baseLogs: number; baseRubble: number; basePlanks: number; baseBricks: number; millInputLogs: number; qryInputRubble: number };
    progression: {
        hasBow: boolean;
        currentOutfit: 'steam' | 'hooded';
        hasBag: boolean;
        furnaceLvl: number;
        furnaceEverFueled: boolean;
        furnaceLit: boolean;
        toolTier: number;
        toolDurability: number;
        toolMaxDurability: number;
        bowDurability: number;
        glacialWallMelted: boolean;
        hasSled: boolean;
        techThickSkin: boolean;
        techEfficiency: boolean;
        furnaceMobile: boolean;
    };
    dayClock: number;
    buildings: { x: number; y: number; kind: string; hp: number; tex?: string }[];
    placedTorches?: { x: number; y: number }[];
    workers?: { type: 'lumberjack' | 'miner'; bldKind: string }[];
    furnacePos?: { x: number; y: number };
}
