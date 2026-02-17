/**
 * Shared mutable game state — imported by main.ts and subsystem modules.
 * Uses a single exported object so any module can read AND write via `S.basePlanks -= 10`.
 */

export const S = {
    /* furnace / base storage */
    baseLogs: 0,
    baseRubble: 0,
    basePlanks: 0,
    baseBricks: 0,
    millInputLogs: 0,
    qryInputRubble: 0,
    furnaceLit: true,
    furnaceEverFueled: false,
    furnaceMobile: false,

    /* outfit & equipment */
    currentOutfit: 'steam' as 'steam' | 'hooded',
    hasBow: false,
    hasBag: false,
    hasSled: false,

    /* tools */
    toolTier: 0,
    toolDurability: 0,
    toolMaxDurability: 0,
    bowDurability: 0,

    /* research */
    techThickSkin: false,
    techEfficiency: false,

    /* progression flags */
    glacialWallMelted: false,

    /* dynamic caps */
    SPEED: 220,
    CAP: 20,

    /* difficulty: 0=Relaxed, 1=Standard, 2=Brutal */
    difficulty: 1 as number,
};

/** Reset all mutable state to defaults (new game) */
export function resetState() {
    S.baseLogs = 0; S.baseRubble = 0; S.basePlanks = 0; S.baseBricks = 0;
    S.millInputLogs = 0; S.qryInputRubble = 0;
    S.furnaceLit = true; S.furnaceEverFueled = false; S.furnaceMobile = false;
    S.currentOutfit = 'steam'; S.hasBow = false; S.hasBag = false; S.hasSled = false;
    S.toolTier = 0; S.toolDurability = 0; S.toolMaxDurability = 0; S.bowDurability = 0;
    S.techThickSkin = false; S.techEfficiency = false; S.glacialWallMelted = false;
    S.SPEED = 220; S.CAP = 20;
    S.difficulty = 1;
}
