import { Chess } from '../../libs/chess.js';

const Css = {
	HIGHLIGHT: "highlight",
	SELECTED: "selected-square",
	DROPPABLE: "ui-droppable-active",
	JUST_MOVED: "just-moved"
};

const Sound = {
	MOVE: "move",
	CAPTURE: "capture",
	CHECK: "check",
	CASTLE: "castle",
	PROMOTE: "promote"
}

export class Board {
	constructor() {
		this.flipped = false;
		this.selectedPiece = undefined;

		this.pieceCache = {};
		this.piecesCached = false;

		this.audioContext = new AudioContext();
		this.volumeNode = this.audioContext.createGain();
		this.audioBuffers = {};

		this.arrows = [];
		this.highlights = [];

		this.chess = new Chess();

		this.settings = {
			theme: {
				board: 'default',
				pieces: 'default',
				sounds: 'default'
			},
			revertDuration: 0,
		}
		
		// Track promotion state
		this.pendingPromotion = null;

		this.firstLoad();
	}

	/**
	 * Initializes the board for first load by:
	 * - Creating the board squares
	 * - Setting up arrow drawing functionality
	 * - Binding resize handlers
	 * - Disabling context menu on chess board
	 */
	async firstLoad() {
		// Initialize board squares and arrow functionality
		this.init();
		this.initializeArrowInput();
		this.cachePieces();
		this.cacheAudio();

		// Handle board resizing
		$(window).on("resize", () => {
			this.onResize();
		});

		// Prevent context menu from appearing on right click
		$(".chess-box").on("contextmenu", (event) => {
			event.preventDefault();
			return false;
		});
	}

	async cachePieces() {
		const colors = ['w', 'b'];
		const pieces = ['k', 'q', 'r', 'b', 'n', 'p'];
		const baseUrl = 'assets/pieces';

		// Create a promise array for parallel loading
		const loadPromises = [];

		// Set up all piece loading in parallel
		$.each(colors, (_, color) => {
			$.each(pieces, (_, type) => {
				const key = `${color}_${type}`;
				const url = `${baseUrl}/${this.settings.theme.pieces}/${color}/${type}.svg`;

				const promise = $.ajax({
					url: url,
					dataType: 'text'
				})
				.then(svgText => {
					// Convert SVG to base64 data URI
					const base64 = btoa(unescape(encodeURIComponent(svgText)));
					const dataUri = `data:image/svg+xml;base64,${base64}`;

					// Create and cache the image
					const $img = $('<img>', {
						src: dataUri,
						alt: type
					})[0]; // Get the DOM element

					this.pieceCache[key] = $img;
					return key;
				})
				.catch(error => {
					console.error(`Failed to load ${url}:`, error);
					return null;
				});

				loadPromises.push(promise);
			});
		});

		// Wait for all pieces to load
		await Promise.allSettled(loadPromises);

        // So we can check for server loading before the images are all cached
        this.piecesCached = true;
	}

	async cacheAudio() {
		this.volumeNode.gain.value = 0.5;
		this.volumeNode.connect(this.audioContext.destination);

		const sounds = ["move", "capture", "check", "castle", "promote"];
		for (const sound of sounds) {
			const resp = await fetch(`assets/sounds/${this.settings.theme.sounds}/${sound}.mp3`);
			const array = await resp.arrayBuffer();
		
			this.audioBuffers[sound] = await this.audioContext.decodeAudioData(array);
		}
	}

	/**
	 * Creates the base board squares.
	 */
	init() {
		for (let i = 0; i < 64; i++) {
			let color = (Math.floor(i / 8) + i) % 2 ? "dark" : "light";
			$("#chessboard").append(`<div class="square ${color}" id="square${i}"></div>`);
		}
	}


	/**
	 * Returns the jQuery object for a square element by its index.
	 * @param {boolean} [beingFlipped=false] - Whether the board is being flipped, so don't clear the board elements.
	 */
	refresh(beingFlipped = false) {
		// Clear any existing selections and highlights
		this.selectedPiece = undefined;
		if (!beingFlipped) this.clearBoardElements();
		
		// Empty all squares and reload pieces
		$(".square").empty();
		this.load();

		// Initialize drag and click handlers
		this.initializeDragInput();
		this.initializeClickInput();
	}


	/**
	 * Flips the display board perspective from white to black.
	 */
	flip() {
		this.flipped = !this.flipped;
		this.refresh(true);

		// Redraw the squares that were removed during the refresh
		this.highlights.forEach(highlight => this.getSquare(this.flipped ? 63 - highlight : highlight).addClass(Css.HIGHLIGHT));
		this.arrows.forEach(arrow => arrow.forEach((_, j) => arrow[j] = 63 - arrow[j]));
		this.render();
	}


	/**
	 * Loads the position (creates and positions the pieces) for the first time.
	 */
	load() {
		const position = this.chess.board();

		for (const row of position) {
			for (const square of row) {
				if (!square) continue;

				const index = this.algebraicToIndex(square.square, this.flipped);
				this.createPiece(index, square.type, square.color);
			}
		}
	}


	/**
	 * Loads a fen string to the board.
	 */
	fen(fen) {
		this.chess.load(fen);
		this.refresh();
		this.clearBoard();
	}

	
	/**
	 * Returns the jQuery object for a square element by its index.
	 *
	 * @param {number} squareIndex - The index of the square.
	 * @return {jQuery} The jQuery object for the square.
	 */
	getSquare = (squareIndex) => $('#square' + squareIndex);


	/**
	 * Returns the board index (0-63) from a given jQuery square element.
	 *
	 * @param {jQuery} square - The jQuery object for the square.
	 * @return {number} The index of the square.
	 */
	getSquareIndex = (square) => parseInt($(square).attr('id').replace("square", ""));


	/**
	 * Returns the square element that contains the given (x, y) position.
	 * @param {number} x - The x-coordinate of the position.
	 * @param {number} y - The y-coordinate of the position.
	 * @return {jQuery} The jQuery object representing the square element.
	 */
	getSquareFromPosition(x, y) {
		let result = null;
		$('.square').each(function() {
			const $square = $(this);
			const bounds = $square.offset();
			
			if (x >= bounds.left && x <= bounds.left + $square.outerWidth() && 
				y >= bounds.top && y <= bounds.top + $square.outerHeight()) {
				result = $square;
				return false;
			}
		});
		return result;
	}


	/**
	 * Converts a board index (0-63) to algebraic chess notation (e.g., "e4").
	 * 
	 * @param {number} index - The board index (0-63), where 0 is a1 and 63 is h8.
	 * @param {boolean} [flip=false] - Whether to flip the board for black's perspective.
	 * @returns {string} The algebraic notation of the square (e.g., "e4").
	 * @throws {Error} If the index is out of range.
	 */
	indexToAlgebraic = (index, flip = false) => {
		if (index < 0 || index > 63) {
			throw new Error('Invalid index. Index must be between 0 and 63.');
		}
	
		if (flip) index = 63 - index;
	
		const row = 8 - Math.floor(index / 8);
		const column = String.fromCharCode(97 + (index % 8));
	
		return column + row;
	};
	

	/**
	 * Converts algebraic chess notation (e.g., "e4") to a board index (0-63).
	 * 
	 * @param {string} notation - The algebraic notation (e.g., "e4").
	 * @param {boolean} [flip=false] - Whether to flip the board useful for black's perspective.
	 * @returns {number} The board index corresponding to the notation.
	 * @throws {Error} If the notation is not in the correct format.
	 */
	algebraicToIndex = (notation, flip = false) => {
		if (!/^[a-h][1-8]$/.test(notation)) {
			throw new Error('Invalid chess notation. The notation should be in the format of a letter (a-h) followed by a number (1-8).');
		}
	
		const column = notation.charCodeAt(0) - 97;
		const row = 8 - parseInt(notation.charAt(1), 10);
		const final = row * 8 + column;
	
		return (flip) ? 63 - final : final;
	};

	/**
	 * Creates and initializes a draggable chess piece.
	 * @param {number} index - The board index where the piece is placed.
	 * @param {string} type - The type of the piece (e.g., 'pawn', 'knight').
	 * @param {string} color - The color of the piece ('white' or 'black').
	 */
	createPiece = (index, type, color) => {
		const $board = this;
		const $square = this.getSquare(index);

		if (this.piecesCached) {
			const originalImg = this.pieceCache[`${color}_${type}`];
			const clone = originalImg.cloneNode(true);
			$square.append(clone);
		} else {
			$square.append(`<img class="ui-widget-content" draggable="false" src="assets/pieces/${this.settings.theme.pieces}/${color}/${type}.svg" alt="${type}"/>`);
		}

		const $piece = $square.find('img');
		$piece.draggable({
			revert: "invalid",
			zIndex: 100,
			revertDuration: this.settings.revertDuration,
			distance: 3,
			containment: ".chess-box",
			start: function(event, ui) {
				$board.selectedPiece = null;
				$(".square").removeClass(`${Css.DROPPABLE} ${Css.SELECTED}`)
			}
		});

		// Sets the cursorAt to center
		this.onResize();
	}


	/**
	 * Updates the board by moving the piece and resetting square styles.
	 *
	 * @param {jQuery} $from - The source square.
	 * @param {jQuery} $to - The target square.
	 * @param {jQuery} $piece - The piece to move.
	 * @param {boolean} [classes=true] - To include the move from/to classes that highlight the squares.
	 */
	updateBoard = ($from, $to, $piece, classes=true) => {
		$to.empty();
		$piece.appendTo($to).css({ top: 0, left: 0 });

		$('.classification').remove();
		const allClasses = Object.values(Css);
		$('.square').removeClass(allClasses.join(' '));

		if (classes) {
			$to.addClass(Css.JUST_MOVED);
			$from.addClass(Css.JUST_MOVED);
		}
	};

	/**
	 * Clears all board classifications and highlights without affecting other elements.
	 */
	clearBoard() {
		$('.classification').remove();
		const allClasses = Object.values(Css);
		$('.square').removeClass(allClasses.join(' '));
	}


	/**
	 * Animates a piece moving from the source to the target square.
	 *
	 * @param {jQuery} $piece - The piece to animate.
	 * @param {jQuery} $from - The source square.
	 */
	animatePiece = ($piece, $from) => {
		$piece
			.offset({ top: $from.offset().top, left: $from.offset().left })
			.animate({ top: 0, left: 0 }, 100);
	};


	/**
	 * Moves a piece on the chessboard from one square to another.
	 *
	 * @param {number} from - The index of the source square.
	 * @param {number} to - The index of the target square.
	 * @param {boolean} [animate=false] - Whether to animate the move.
	 * @param {string} [fenBefore=null] - The FEN string of the position before making the move.
	 * @param {object} [classification=undefined] - The move classification to display.
	 * @param {boolean} [showPromotionUI=false] - Whether to show the promotion UI.
	 * @param {string} [promotedPiece=null] - The piece to promote to.
	 */
	move = (from, to, animate = false, fenBefore = null, classification = undefined, showPromotionUI = false, promotedPiece = null) => {
		// Don't allow moves if a promotion is in progress
		if (this.pendingPromotion) {
			return null;
		}

		// Store the selected piece
		this.selectedPiece = from;
		
		// Get the algebraic coordinates
		const fromAlg = this.indexToAlgebraic(from, this.flipped);
		const toAlg = this.indexToAlgebraic(to, this.flipped);
		
		// Check if this is a pawn promotion and handle accordingly
		if (this.isPawnPromotion(fromAlg, toAlg)) {
			this.pendingPromotion = {
				from: fromAlg,
				to: toAlg,
				fromIdx: from,
				toIdx: to,
				animate: animate,
				fenBefore: fenBefore
			};
			
			this.showPromotionPanel(to);
			return null;
		}
		
		// If a fenBefore is provided, load that position first
		if (fenBefore) {
			this.chess.load(fenBefore);
		}
		
		const $currentSquare = this.getSquare(from);
		const $targetSquare = this.getSquare(to);
		const $piece = $currentSquare.find('img');

		if (!$currentSquare.length || !$piece.length) {
			console.error(`Invalid move: No piece at square ${from}`);
			return;
		}

		this.updateBoard($currentSquare, $targetSquare, $piece);
		const moveResult = this.chess.move({ from: fromAlg, to: toAlg, promotion: promotedPiece });

		if (!moveResult) {
			return console.error(`Illegal move from ${fromAlg} to ${toAlg}`);
		}

		// Always animate the piece movement first
		if (animate) {
			this.animatePiece($targetSquare.find('img'), $currentSquare, $targetSquare);
		}

		// Handle special moves after animation (sometimes classification passed manually for special moves)
		const handled = this.handleSpecialMoves(moveResult, to, classification);
		if (classification) this.addClassification(classification, $currentSquare, $targetSquare);
		if (!handled) this.playSoundBasedOnOutcome(moveResult);
		
		return moveResult;
	};


	/**
	 * Checks if a move is a pawn promotion.
	 * 
	 * @param {string} fromAlg - The algebraic notation of the source square.
	 * @param {string} toAlg - The algebraic notation of the target square.
	 * @returns {boolean} - Whether the move is a pawn promotion.
	 */
	isPawnPromotion(fromAlg, toAlg) {
		const piece = this.chess.get(fromAlg);
		
		// If no piece or not a pawn, return false
		if (!piece || piece.type !== 'p') return false;
		
		// Check if the pawn is moving to the last rank
		const toRank = parseInt(toAlg[1]);
		return (piece.color === 'w' && toRank === 8) || (piece.color === 'b' && toRank === 1);
	}

	/**
	 * Shows the promotion panel for selecting a promotion piece.
	 * 
	 * @param {number} targetSquareIdx - The index of the target square.
	 */
	showPromotionPanel(targetSquareIdx) {
		// Remove any existing promotion panels
		$('.promotion-panel').remove();
		
		const $targetSquare = this.getSquare(targetSquareIdx);
		const targetPosition = $targetSquare.offset();
		const squareSize = $targetSquare.width();

		const color = this.chess.turn();
		const $panel = $('<div class="promotion-panel"></div>');
		
		// Calculate panel position - place it adjacent to the promotion square
		// Determine if panel should go up or down based on proximity to board edge
		const targetRank = Math.floor(targetSquareIdx / 8);
		const placeAtBottom = targetRank < 4; // Place at bottom for top half of board, top for bottom half
		
		// Position panel - place it to the side if near edge
		const targetFile = targetSquareIdx % 8;
		
		let left = targetPosition.left;
		// If close to right edge, place panel to the left
		if (targetFile > 5) {
			left = targetPosition.left - 80; // Panel width is now 80px
		} else {
			left = targetPosition.left + squareSize;
		}
		
		let top;
		if (placeAtBottom) {
			top = targetPosition.top;
		} else {
			// Place panel above square, account for panel height (4 pieces + cancel = 5 items)
			// 4 pieces at 80px each + cancel button at 40px
			top = targetPosition.top - (80 * 4 + 40);
		}
		
		$panel.css({
			left: left + 'px',
			top: top + 'px'
		});
		
		// Create pieces for promotion selection (queen, rook, bishop, knight)
		const pieceTypes = ['q', 'r', 'b', 'n'];
		pieceTypes.forEach(type => {
			const $pieceContainer = $(`<div class="promotion-piece" data-piece="${type}"></div>`);
			$pieceContainer.append(`<img src="assets/pieces/${this.settings.theme.pieces}/${color}/${type}.svg" alt="${type}">`);
			$panel.append($pieceContainer);
		});
		
		// Add cancel button
		const $cancelBtn = $('<div class="promotion-cancel">✕</div>');
		$panel.append($cancelBtn);
		
		// Add panel to the board
		$('.chess-box').append($panel);
		
		// Handle piece selection
		$('.promotion-piece').on('click', (e) => {
			const pieceType = $(e.currentTarget).data('piece');
			this.completePromotion(pieceType);
		});
		
		// Handle cancel
		$('.promotion-cancel').on('click', () => {
			this.cancelPromotion();
		});
	}
	
	/**
	 * Completes the promotion with the selected piece type.
	 * 
	 * @param {string} pieceType - The type of piece to promote to (q, r, b, n).
	 */
	completePromotion(pieceType) {
		if (!this.pendingPromotion) return;
		
		const { from, to, fromIdx, toIdx, animate, fenBefore } = this.pendingPromotion;
		
		// Remove promotion panel
		$('.promotion-panel').remove();
		
		// Get squares
		const $fromSquare = this.getSquare(fromIdx);
		const $toSquare = this.getSquare(toIdx);
		const $piece = $fromSquare.find('img');
		
		// Update board
		this.updateBoard($fromSquare, $toSquare, $piece);
		
		// If a fenBefore is provided, load that position first
		if (fenBefore) {
			this.chess.load(fenBefore);
		}
		
		// Make the move with the selected promotion piece
		const moveResult = this.chess.move({ from, to, promotion: pieceType });
		
		if (!moveResult) {
			console.error(`Illegal promotion move from ${from} to ${to}`);
			this.pendingPromotion = null;
			return;
		}
		
		if (animate) {
			// First animate the pawn to the target square
			this.animatePiece($toSquare.find('img'), $fromSquare, $toSquare);
			
			// Then replace with promoted piece after animation completes
			setTimeout(() => {
				$toSquare.empty();
				this.createPiece(toIdx, pieceType, this.chess.turn() === 'w' ? 'b' : 'w');
			}, 40); // Match the animation duration

			this.playSound(Sound.PROMOTE);
		} else {
			// Without animation, just replace immediately
			$toSquare.empty();
			this.createPiece(toIdx, pieceType, this.chess.turn() === 'w' ? 'b' : 'w');
		}
		
		// Play sound
		this.playSoundBasedOnOutcome(moveResult);
		
		// Notify parent component if callback exists
		if (typeof this.onPromotionComplete === 'function') {
			this.onPromotionComplete(moveResult);
		}
		
		// Clear pending promotion
		this.pendingPromotion = null;
		
		return moveResult;
	}
	
	/**
	 * Cancels the pending promotion.
	 */
	cancelPromotion() {
		// Remove promotion panel
		$('.promotion-panel').remove();
		
		// Notify parent component if callback exists
		if (typeof this.onPromotionComplete === 'function') {
			this.onPromotionComplete(null);
		}
		
		// Clear pending promotion
		this.pendingPromotion = null;
	}

	/**
	 * Handles special moves like castling, promotion, and en passant.
	 *
	 * @param {Object} moveResult - The result from chess.move().
	 * @param {number} targetSquareIndex - The target square index.
	 * @param {string} classification - The classification of the move.
	 * @return {boolean} True if a special move was processed; otherwise, false.
	 */
	handleSpecialMoves = (moveResult, targetSquareIndex, classification) => {
		if (this.handleCastling(moveResult)) {
			return true;
		}
		if (this.handlePromotion(moveResult, targetSquareIndex, classification)) {
			return true;
		}
		if (this.handleEnPassant(moveResult)) {
			return true;
		}
		return false;
	};


	/**
	 * Handles castling moves, specfically the rook movement.
	 * @param {Object} moveResult - The move result object.
	 * @return {boolean} True if castling was handled; otherwise, false.
	 */
	handleCastling = (moveResult) => {
		const castleType = moveResult.isKingsideCastle() ? "kingside" : moveResult.isQueensideCastle() ? "queenside" : null;
		if (!castleType) return false;
		
		const castleMap = {
			w: { kingside: ['h8','f8'], queenside: ['a8', 'd8'] },
			b: { kingside: ['h1', 'f1'], queenside: ['a1', 'd1'] }
		}
		
		const [from, to] = castleMap[this.chess.turn()][castleType];
		const $fromSquare = this.getSquare(this.algebraicToIndex(from, this.flipped));
		const $toSquare = this.getSquare(this.algebraicToIndex(to, this.flipped));
		const $piece = $fromSquare.find("img");
		
		this.updateBoard($fromSquare, $toSquare, $piece, false);
		this.animatePiece($piece, $fromSquare);
		this.playSound(Sound.CASTLE);
		
		return true;
	};


	/**
	 * Handles pawn promotion.
	 *
	 * @param {Object} moveResult - The move result object.
	 * @param {number} targetSquareIndex - The target square index.
	 * @param {string} classification - The classification of the move.
	 * @return {boolean} True if promotion was handled; otherwise, false.
	 */
	handlePromotion = (moveResult, targetSquareIndex, classification) => {
		if (moveResult.isPromotion()) {
			// For auto-promotion (non-interactive) or pre-selected promotion
			const color = this.chess.turn() === 'w' ? 'b' : 'w';
			const promoted = moveResult.promotion || 'r';

			// Just for auto-promotion (when not using the panel)
			// I know this is a bit of a hack, but it works for now
			if (!this.pendingPromotion) {
				const $targetSquare = this.getSquare(targetSquareIndex);
				setTimeout(() => {
					$targetSquare.empty();
					this.createPiece(targetSquareIndex, promoted, color);
					this.playSound(Sound.PROMOTE);

					// Since we emptied the square, the classification will be lost
					// So we need to add it back
					if (classification) this.addClassification(classification, $targetSquare, $targetSquare);
				}, 50);
			}
			
			return true;
		}
		return false;
	};


	/**
	 * Handles en passant moves.
	 *
	 * @param {Object} moveResult - The move result object.
	 * @return {boolean} True if en passant was handled; otherwise, false.
	 */
	handleEnPassant = (moveResult) => {
		if (moveResult.isEnPassant()) {
			const direction = this.chess.turn() === 'w' ? -1 : 1;
			const offset = this.flipped ? -8 : 8;
			const capturedSquare = this.algebraicToIndex(moveResult.to, this.flipped) + offset * direction;
			this.getSquare(capturedSquare).empty();
			this.playSound(Sound.CAPTURE);
			return true;
		}
		return false;
	};

	/**
	 * Undoes the last move made on the chessboard.
	 * 
	 * @param {boolean} [animate=false] - Whether to animate the move.
	 * @param {Object} [lastMove=null] - The move we want to undo.
	 * @param {string} [fenBefore=null] - The FEN string of the position before this move.
	 * @return {Object|null} - The undone move object, or null if no move to undo.
	 */
	unmove = (animate = false, lastMove = null, fenBefore = null) => {
		// If a specific move is provided, use it; otherwise get the last move from history
		if (!lastMove) {
			// Get the history from chess.js
			const history = this.chess.history({ verbose: true });
			if (history.length === 0) {
				console.log("No moves to undo");
				return null;
			}
			
			// Get the last move
			lastMove = history[history.length - 1];
		}
		
		// Convert algebraic notation to board indices
		const fromIndex = this.algebraicToIndex(lastMove.from, this.flipped);
		const toIndex = this.algebraicToIndex(lastMove.to, this.flipped);
		
		// Special case for promotion - we need to handle it differently
		const isPromotion = !!lastMove.promotion;
		
		// Get the squares
		const $fromSquare = this.getSquare(fromIndex);
		const $toSquare = this.getSquare(toIndex);
		
		// For promotions, we don't want to move the promoted piece back,
		// since we'll replace it with a pawn at the from square
		if (!isPromotion) {
			const $piece = $toSquare.find('img');
			
			if (!$toSquare.length || !$piece.length) {
				console.error(`Invalid unmove: No piece at square ${toIndex}`);
				return null;
			}
			
			// Update the board for regular moves
			this.updateBoard($toSquare, $fromSquare, $piece, false);
			if (animate) this.animatePiece($piece, $toSquare);
		} else {
			// For promotions, we'll handle the animation in handleUndoPromotion
			$toSquare.empty();
		}
		
		// Handle special moves first
		if (this.handleSpecialUnmoves(lastMove, animate)) {
			// Special move was handled
		} else {
			// Restore captured piece if any
			if (lastMove.captured) {
				const capturedPieceColor = lastMove.color === 'w' ? 'b' : 'w';
				this.createPiece(toIndex, lastMove.captured, capturedPieceColor);
				this.playSound(Sound.CAPTURE);
			} else {
				this.playSound(Sound.MOVE);
			}
		}
		
		// Use the provided fen or undo the move in the chess.js instance
		if (fenBefore) {
			this.chess.load(fenBefore);
		} else {
			this.chess.undo();
		}
		
		return lastMove;
	};

	/**
	 * Handles undoing special moves like castling, promotion, and en passant.
	 *
	 * @param {Object} lastMove - The move details from chess.js history.
	 * @param {boolean} animate - Whether to animate the move.
	 * @return {boolean} True if a special move was processed; otherwise, false.
	 */
	handleSpecialUnmoves = (lastMove, animate = false) => {
		if (this.handleUndoCastling(lastMove, animate)) {
			return true;
		}
		if (this.handleUndoPromotion(lastMove, animate)) {
			return true;
		}
		if (this.handleUndoEnPassant(lastMove, animate)) {
			return true;
		}
		return false;
	};

	/**
	 * Handles undoing en passant moves.
	 * @param {Object} moveResult - The move result object.
	 * @param {boolean} animate - Whether to animate the move.
	 * @return {boolean} True if en passant undo was handled; otherwise, false.
	 */
	handleUndoEnPassant = (moveResult, animate = false) => {
		if (moveResult.isEnPassant()) {
			const direction = this.chess.turn() === 'w' ? -1 : 1;
			const offset = this.flipped ? -8 : 8;
			const capturedSquare = this.algebraicToIndex(moveResult.to, this.flipped) + offset * direction;

			this.createPiece(capturedSquare, moveResult.captured, this.chess.turn());
			this.playSound(Sound.CAPTURE);
			return true;
		}
		return false;
	}

	/**
	 * Handles undoing castling moves, specifically reversing the rook movement.
	 * @param {Object} moveResult - The move result object.
	 * @param {boolean} animate - Whether to animate the move.
	 * @return {boolean} True if castling undo was handled; otherwise, false.
	 */
	handleUndoCastling = (moveResult, animate = false) => {
		const castleType = moveResult.isKingsideCastle() ? "kingside" : moveResult.isQueensideCastle() ? "queenside" : null;
		if (!castleType) return false;

		// For undoing, the rook needs to go from its castled position back to its original position
		const castleMap = {
			w: { kingside: ['f8', 'h8'], queenside: ['d8', 'a8'] },
			b: { kingside: ['f1', 'h1'], queenside: ['d1', 'a1'] }
		};
		
		const [from, to] = castleMap[this.chess.turn()][castleType];
		const $fromSquare = this.getSquare(this.algebraicToIndex(from, this.flipped));
		const $toSquare = this.getSquare(this.algebraicToIndex(to, this.flipped));
		const $piece = $fromSquare.find("img");
		
		this.updateBoard($fromSquare, $toSquare, $piece, false);
		if (animate) this.animatePiece($piece, $fromSquare);
		this.playSound(Sound.CASTLE);
		
		return true;
	};

	/**
	 * Handles undoing promotion moves.
	 * @param {Object} moveResult - The move result object.
	 * @param {boolean} animate - Whether to animate the move.
	 * @return {boolean} True if promotion undo was handled; otherwise, false.
	 */
	handleUndoPromotion = (moveResult, animate = false) => {
		if (moveResult.promotion) {
			// Get square indices for from and to
			const fromIndex = this.algebraicToIndex(moveResult.from, this.flipped);
			const toIndex = this.algebraicToIndex(moveResult.to, this.flipped);
			
			const $fromSquare = this.getSquare(fromIndex);
			const $toSquare = this.getSquare(toIndex);
			
			// Create a temporary pawn at the promotion square for animation
			if (animate) {
				// Create pawn of the appropriate color at the to square
				this.createPiece(toIndex, 'p', moveResult.color);
				const $pawn = $toSquare.find('img');
				
				// Now move this pawn back to the from square
				this.updateBoard($toSquare, $fromSquare, $pawn, false);
				this.animatePiece($pawn, $toSquare);
			} else {
				// Without animation, just clear both squares
				$fromSquare.empty();
				$toSquare.empty();
				
				// Create pawn at the from square
				this.createPiece(fromIndex, 'p', moveResult.color);
			}
			
			// If there was a captured piece, restore it at the to square
			if (moveResult.captured) {
				if (animate) {
					$toSquare.empty();
					const capturedPieceColor = moveResult.color === 'w' ? 'b' : 'w';
					this.createPiece(toIndex, moveResult.captured, capturedPieceColor);
					this.playSound(Sound.CAPTURE);
				} else {
					const capturedPieceColor = moveResult.color === 'w' ? 'b' : 'w';
					this.createPiece(toIndex, moveResult.captured, capturedPieceColor);
				}
				this.playSound(Sound.CAPTURE);
			}
			
			return true;
		}
		return false;
	}

	
	/**
	 * Toggles the "highlight" class on the given square element.
	 * 
	 * @param {jQuery} square - The jQuery object representing the square to be highlighted.
	 */
	highlight = (square) => {
		square.toggleClass("highlight");

		const index = this.getSquareIndex(square);
		const highlightIndex = this.highlights.indexOf(index);
		
		highlightIndex !== -1 
		  ? this.highlights.splice(highlightIndex, 1)
		  : this.highlights.push(index);
	}


	/**
	 * Toggles an arrow between two squares on the chessboard.
	 * If an arrow already exists, it is removed; otherwise, it is added.
	 *
	 * @param {jQuery} start - The starting square element.
	 * @param {jQuery} end - The ending square element.
	 */
	createArrow = (start, end) => {
		const startIndex = this.getSquareIndex(start);
		const endIndex = this.getSquareIndex(end);

		// Find the existing arrow
		const existingArrow = this.arrows.find(([s, e]) => s === startIndex && e === endIndex);
	  
		// Toggle arrow state
		if (existingArrow) {
		  this.arrows = this.arrows.filter(arrow => arrow !== existingArrow);
		} else {
		  this.arrows.push([startIndex, endIndex]);
		}
	  
		// Re-render the board
		this.render();
	}


	drawArrowhead(ctx, toX, toY, angle, length) {
		ctx.beginPath();
		ctx.moveTo(toX, toY);
		for (const a of [-Math.PI / 6, Math.PI / 6]) {
			ctx.lineTo(toX - length * Math.cos(angle + a), toY - length * Math.sin(angle + a));
		}
		ctx.closePath();
		ctx.fill();
	}
	

	/**
	 * Draws an arrow on the given canvas.
	 * @param {HTMLCanvasElement} canvas The canvas element.
	 * @param {CanvasRenderingContext2D} ctx The rendering context.
	 * @param {number} fromX The starting x-coordinate.
	 * @param {number} fromY The starting y-coordinate.
	 * @param {number} toX The ending x-coordinate.
	 * @param {number} toY The ending y-coordinate.
	 */
	drawArrow(canvas, ctx, fromX, fromY, toX, toY) {
		const s = canvas.width;
		const headLength = s / 16;
		ctx.lineWidth = s / 48;
		ctx.fillStyle = ctx.strokeStyle = "rgba(223, 145, 0, 0.59)";

		// If the move is knight move
		const threshold = 0.1;
		const knightRatio = Math.abs((fromX - toX)/(fromY - toY));
		const length = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
		if ((length/s < 0.35) && (Math.abs(knightRatio - 0.5) < threshold || Math.abs(knightRatio - 2) < threshold)) {
			return this.drawKnightArrow(ctx, fromX, fromY, toX, toY, s, headLength);
		}

		const f = 0.865 * headLength;
		const angle = Math.atan2(toY - fromY, toX - fromX);
		const xOff = f * Math.cos(angle), yOff = f * Math.sin(angle);

		const [x1, y1] = [fromX + (s / 22) * Math.cos(angle), fromY + (s / 22) * Math.sin(angle)];
		const [x2, y2] = [toX - xOff, toY - yOff];
		ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

		this.drawArrowhead(ctx, toX, toY, angle, headLength);
	}


	/**
	 * Draws an L-shaped arrow for knight moves on the given canvas.
	 * @param {CanvasRenderingContext2D} ctx The rendering context.
	 * @param {number} fromX The starting x-coordinate.
	 * @param {number} fromY The starting y-coordinate.
	 * @param {number} toX The ending x-coordinate.
	 * @param {number} toY The ending y-coordinate.
	 * @param {number} s The scale factor, which is just the canvas width.
	 * @param {number} headLength The length of the arrowhead.
	 */
	drawKnightArrow(ctx, fromX, fromY, toX, toY, s, headLength) {
		const dx = toX - fromX, dy = toY - fromY;
		const horizontalFirst = Math.abs(dx) > Math.abs(dy);
		const cornerX = horizontalFirst ? toX : fromX;
		const cornerY = horizontalFirst ? fromY : toY;
		
		const dirX = Math.sign(dx) * (horizontalFirst ? -1 : 1);
    	const dirY = Math.sign(dy) * (horizontalFirst ? -1 : 1);

		const f = 0.865 * headLength;
		const angle = Math.atan2(toY - cornerY, toX - cornerX);
		const xOff = f * Math.cos(angle), yOff = f * Math.sin(angle);
		const offsetX = (s / 100) * dirX, offsetY = (s / 100) * dirY;

		// Draw first segment of L
		const [x1, y1] = [fromX - (horizontalFirst ? (s / 22) * dirX : 0), fromY + (!horizontalFirst ? (s / 22) * dirY : 0)];
		const [x2, y2] = [!horizontalFirst ? cornerX : cornerX + offsetX, horizontalFirst ? cornerY : cornerY + offsetY];
		const [x3, y3] = [horizontalFirst ? cornerX : cornerX + offsetX, !horizontalFirst ? cornerY : cornerY + offsetY];
		
		ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
		ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(toX - xOff, toY - yOff); ctx.stroke();

		this.drawArrowhead(ctx, toX, toY, angle, headLength);
	}


	/**
	 * Renders arrows on the chessboard canvas.
	 */
	render() {
		const canvas = $('.board-elements')[0];
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		const squareSize = $('#chessboard').width() / 8;
		const halfSquare = squareSize / 2;

		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;

		for (const [from, to] of this.arrows) {
			this.drawArrow(
				canvas, ctx,
				// Fancy (not really) math to get the squares center
				(from % 8) * squareSize + halfSquare, Math.floor(from / 8) * squareSize + halfSquare,
				(to % 8) * squareSize + halfSquare, Math.floor(to / 8) * squareSize + halfSquare
			);
		}
	}

	/**
	 * Handles certain static elements of the board when it's resized.
	 */
	onResize() {
		// So arrows stay consistent
		this.render();

		// Just to be safe in case draggable isn't initialized yet
		try {
			// Weird trick to bypass the lack of { top: 50% } which cursorAt lacks
			const $pieces = $(".square img");
			const height = parseFloat($($pieces[0]).css('height')) * 1.3;
			$(".square img").draggable("option", "cursorAt", { top: height/2, left: height/2  })
		} catch (e) {}
	}

	/**
	 * Clears highlighted squares and removes all arrows from the board.
	 */
	clearBoardElements() {
		$(".square").removeClass(Css.HIGHLIGHT);
		this.arrows = [];
		this.highlights = [];
		this.render();
	}

	
	/**
	 * Play a sound effect
	 * @param {string} sound - The name of the sound that will be played.
	 */
	playSound(sound) {
		if (this.audioContext.state === 'suspended') this.audioContext.resume();
		const src = this.audioContext.createBufferSource();
		src.buffer = this.audioBuffers[sound];
		src.connect(this.volumeNode);
		src.start(0);
	}


	/**
	 * Plays a sound effect based on the outcome of the move.
	 *
	 * @param {Object} moveResult - The move result object.
	 */
	playSoundBasedOnOutcome = (moveResult) => {
		if (this.chess.inCheck()) {
			this.playSound(Sound.CHECK);
		} else if (moveResult.isCapture()) {
			this.playSound(Sound.CAPTURE);
		} else {
			this.playSound(Sound.MOVE);
		}
	};


	/**
	 * Initializes the drag-and-drop functionality for the game board.
	 */
	initializeDragInput = () => {
		const boardObj = this;
		$(".square").droppable({
			drop: (event, ui) => {
				// Skip if promotion is in progress
				if (boardObj.pendingPromotion !== null) return;
				
				const toIndex = boardObj.getSquareIndex($(event.target));
				const fromIndex = boardObj.getSquareIndex($(ui.draggable[0]).parent());
				
				// Use our custom handler for user moves
				if (boardObj.onUserMove) {
					boardObj.onUserMove(fromIndex, toIndex);
				} else {
					boardObj.move(fromIndex, toIndex, false);
				}
				
				// Clear the selected piece
				boardObj.selectedPiece = undefined;
			},
			accept: function (drag) {
				// Skip if promotion is in progress
				if (boardObj.pendingPromotion !== null) return false;
				
				boardObj.clearBoardElements();

				const startSquare = boardObj.getSquareIndex($(drag).parent());
				const endSquare = boardObj.getSquareIndex(this);

				// Get legal moves from the startSquare, and map them to indices on our board
				const moves = boardObj.chess.moves({ square: boardObj.indexToAlgebraic(startSquare, boardObj.flipped), verbose: true });
				const legalMoves = moves.map(move => boardObj.algebraicToIndex(move.to, boardObj.flipped));

				return (legalMoves && legalMoves.includes(endSquare));
			},
			tolerance: "pointer"
		});
	};


	/**
	 * Initializes the click-piece click-target functionality for the game board.
	 */
	initializeClickInput = () => {
		const boardObj = this;
		
		// Remove any existing click handlers first to prevent duplicates
		$(".square").off("click");
		$(".square").on("click", function() {
			// Skip click handling if promotion is in progress
			if (boardObj.pendingPromotion !== null) return;
			
			const squareIndex = boardObj.getSquareIndex(this);
			boardObj.clearBoardElements();
			
			// If clicking the same square that's already selected, deselect it
			if (boardObj.selectedPiece === squareIndex) {
				boardObj.selectedPiece = undefined;
				$(".square").removeClass(`${Css.HIGHLIGHT} ${Css.DROPPABLE} ${Css.SELECTED}`);
				return;
			}
			
			// If a piece is already selected, attempt to move it
			if (boardObj.selectedPiece !== undefined) {
				const fromIndex = boardObj.selectedPiece;
				const toIndex = squareIndex;
				
				// Get legal moves from the startSquare
				const fromAlgebraic = boardObj.indexToAlgebraic(fromIndex, boardObj.flipped);
				const moves = boardObj.chess.moves({ square: fromAlgebraic, verbose: true });
				const legalDestinations = moves.map(move => boardObj.algebraicToIndex(move.to, boardObj.flipped));
				
				// If clicked square is a valid destination, move the piece
				if (legalDestinations.includes(toIndex)) {
					// Use our custom handler for user moves
					if (boardObj.onUserMove) {
						const result = boardObj.onUserMove(fromIndex, toIndex);
						if (result) {
							boardObj.selectedPiece = undefined;
							return;
						}
					} else {
						boardObj.move(fromIndex, toIndex, true);
						boardObj.selectedPiece = undefined;
						return;
					}
				}
			}
			
			// At this point, we're either selecting a new piece or switching selection
			$(".square").removeClass(`${Css.HIGHLIGHT} ${Css.DROPPABLE} ${Css.SELECTED}`);
			
			// Check if the clicked square has a piece that can move
			const algNotation = boardObj.indexToAlgebraic(squareIndex, boardObj.flipped);
			const possibleMoves = boardObj.chess.moves({ square: algNotation, verbose: true });
			
			if (possibleMoves.length === 0) {
				boardObj.selectedPiece = undefined;
				return;
			}
			
			// Highlight the selected piece's square
			$(this).addClass(Css.SELECTED);
			
			// Highlight possible destination squares
			possibleMoves.forEach(move => {
				const moveIndex = boardObj.algebraicToIndex(move.to, boardObj.flipped);
				boardObj.getSquare(moveIndex).addClass(Css.DROPPABLE);
			});
			
			boardObj.selectedPiece = squareIndex;
		});
	};
	
	/**
	 * Initializes the arrow functionality for the game board.
	 */
	initializeArrowInput() {
		let startX, startY;

		$(document).on('mousedown', event => {
			if (event.button !== 2) return;
			[startX, startY] = [event.pageX, event.pageY];

			$(document).one('mouseup', event => {
				if (event.button !== 2) return;

				const startSquare = this.getSquareFromPosition(startX, startY);
				const endSquare = this.getSquareFromPosition(event.pageX, event.pageY);

				if (!startSquare || !endSquare) return;

				$(".square").removeClass('ui-droppable-active selected-square');
				this.selectedPiece = null;

				if (startSquare.attr('id') === endSquare.attr('id')) {
					this.highlight(startSquare);
				} else {
					this.createArrow(startSquare, endSquare);
				}
			});
		});
	}
}