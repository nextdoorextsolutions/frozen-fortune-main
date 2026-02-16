import type { GameState } from '../types';

const SAVE_KEY = 'frozenFortuneSave';

export class SaveManager {
    /** Write a GameState to localStorage */
    static save(state: GameState): void {
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    }

    /** Read a GameState from localStorage, or null if none exists */
    static load(): GameState | null {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as GameState;
    }

    /** Check whether a save exists */
    static hasSave(): boolean {
        return localStorage.getItem(SAVE_KEY) !== null;
    }

    /** Delete the save */
    static deleteSave(): void {
        localStorage.removeItem(SAVE_KEY);
    }
}
