import { Board } from './board.js';

/**
 * ChessboardComponent - A wrapper for the Board class 
 * that provides an easy way to integrate a chessboard into any webpage
 */
export class ChessboardComponent {
    /**
     * Create a new chessboard component
     * @param {string} containerId - The ID of the container element to place the board in
     * @param {Object} options - Configuration options for the board
     */
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Container element with ID "${containerId}" not found.`);
            return;
        }

        // Create the board elements
        this.createBoardElements();
        
        // Initialize the board
        this.board = new Board();
        
        // Setup initial position
        if (options.position) {
            this.setPosition(options.position);
        } else {
            this.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
        }
        
        // Setup event handlers
        if (options.onMove) {
            this.onMove = options.onMove;
            // We'll add the move event handler
        }
    }
    
    /**
     * Creates the HTML elements needed for the chessboard
     */
    createBoardElements() {
        // Clear the container
        this.container.innerHTML = '';
        
        // Add the chess box and board container
        const chessBox = document.createElement('div');
        chessBox.className = 'chess-box';
        
        const boardElements = document.createElement('canvas');
        boardElements.className = 'board-elements';
        
        const chessboard = document.createElement('div');
        chessboard.id = 'chessboard';
        
        chessBox.appendChild(boardElements);
        chessBox.appendChild(chessboard);
        
        this.container.appendChild(chessBox);
    }
    
    /**
     * Sets the position of the chess board using FEN notation
     * @param {string} fen - The FEN string to set
     */
    setPosition(fen) {
        if (this.board) {
            this.board.fen(fen);
        }
    }
    
    /**
     * Flips the orientation of the board
     */
    flip() {
        if (this.board) {
            this.board.flip();
        }
    }
    
    /**
     * Makes a move on the board
     * @param {string} from - The algebraic notation of the source square (e.g., "e2")
     * @param {string} to - The algebraic notation of the destination square (e.g., "e4")
     * @param {boolean} animate - Whether to animate the move
     * @returns {Object|null} - The move result object or null if the move is illegal
     */
    makeMove(from, to, animate = true) {
        if (this.board) {
            const result = this.board.move(from, to, animate);
            return result;
        }
        return null;
    }
    
    /**
     * Gets the current position of the board as a FEN string
     * @returns {string} - The current position in FEN notation
     */
    getPosition() {
        if (this.board) {
            return this.board.chess.fen();
        }
        return '';
    }
    
    /**
     * Highlights a square on the board
     * @param {string} square - The algebraic notation of the square to highlight (e.g., "e4")
     */
    highlightSquare(square) {
        if (this.board) {
            const index = this.board.algebraicToIndex(square, this.board.flipped);
            this.board.highlight(index);
        }
    }
    
    /**
     * Creates an arrow on the board
     * @param {string} from - The algebraic notation of the source square (e.g., "e2")
     * @param {string} to - The algebraic notation of the destination square (e.g., "e4")
     */
    drawArrow(from, to) {
        if (this.board) {
            const fromIndex = this.board.algebraicToIndex(from, this.board.flipped);
            const toIndex = this.board.algebraicToIndex(to, this.board.flipped);
            this.board.createArrow(fromIndex, toIndex);
        }
    }
    
    /**
     * Clears all highlights and arrows from the board
     */
    clearDrawings() {
        if (this.board) {
            this.board.clearBoard();
        }
    }
} 