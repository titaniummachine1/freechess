/**
 * Shared state for the report UI
 * This file provides access to shared state variables across different modules
 */

// @ts-nocheck

import type { Profile, Position, Evaluation, Report } from './types';

// State for report data
export let reportResults: Report | undefined;
export let evaluatedPositions: Position[] = [];
export let ongoingEvaluation = false;
export let isNewGame = false;
export let currentMoveIndex = 0;
export let boardFlipped = false;

// Player profiles
export const whitePlayer: Profile = {
    username: "White Player",
    rating: "?"
};

export const blackPlayer: Profile = {
    username: "Black Player",
    rating: "?"
};

// Last evaluation tracking
export let lastEvaluation: Evaluation = { type: "cp", value: 0 };

// Update the shared state with report results
export function updateReportResults(results: Report | undefined): void {
    reportResults = results;
}

// Update the evaluated positions
export function updateEvaluatedPositions(positions: Position[]): void {
    evaluatedPositions = positions;
}

// Update evaluation state
export function setOngoingEvaluation(state: boolean): void {
    ongoingEvaluation = state;
}

// Update game state
export function setNewGame(state: boolean): void {
    isNewGame = state;
}

// Update current move index
export function setCurrentMoveIndex(index: number): void {
    currentMoveIndex = index;
}

// Update board orientation
export function flipBoard(): void {
    boardFlipped = !boardFlipped;
}

// Update player information
export function updatePlayers(white: Profile, black: Profile): void {
    Object.assign(whitePlayer, white);
    Object.assign(blackPlayer, black);
}

// Update last evaluation
export function updateLastEvaluation(evaluation: Evaluation): void {
    lastEvaluation = evaluation;
}

// Import shared types
import type { EngineLine } from './types.js';

export interface PlayerInfo {
  username: string;
  rating?: number;
}

export interface ReportResults {
  positions: Position[];
}

// Shared state
export const State = {
  // Game state
  reportResults: null as ReportResults | null,
  currentMoveIndex: 0,
  startingPositionFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  
  // UI state
  boardFlipped: false,
  ongoingEvaluation: false,
  
  // Player information
  whitePlayer: { username: 'White' } as PlayerInfo,
  blackPlayer: { username: 'Black' } as PlayerInfo,
  
  // Classification colors
  classificationColours: {
    'book': '#808080',
    'blunder': '#ff0000',
    'mistake': '#ff6600',
    'inaccuracy': '#ffcc00',
    'good': '#00cc00',
    'excellent': '#00ff00',
    'brilliant': '#0066ff'
  }
};

// Utility functions
export function traverseMoves(count: number) {
  // To be implemented by board.ts
  console.log('traverseMoves needs implementation', count);
}

export function updateBoardPlayers() {
  // To be implemented by board.ts
  console.log('updateBoardPlayers needs implementation');
} 