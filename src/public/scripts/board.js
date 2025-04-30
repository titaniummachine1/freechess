import { Chess } from './chess.js';

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
        const baseUrl = '/media/pieces';

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
            const resp = await fetch(`/media/sounds/${this.settings.theme.sounds}/${sound}.mp3`);
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
     */
    indexToAlgebraic = (index, flip = false) => {
        index = flip ? 63 - index : index;
        const file = index % 8;
        const rank = Math.floor(index / 8);
        return 'abcdefgh'[file] + (8 - rank);
    }

    /**
     * Converts algebraic chess notation (e.g., "e4") to a board index (0-63).
     */
    algebraicToIndex = (notation, flip = false) => {
        const file = notation.charCodeAt(0) - 'a'.charCodeAt(0);
        const rank = 8 - parseInt(notation[1]);
        let index = rank * 8 + file;
        return flip ? 63 - index : index;
    }

    /**
     * Creates and adds a chess piece to the board at the given index.
     */
    createPiece = (index, type, color) => {
        const key = `${color}_${type}`;
        let pieceElement;

        if (this.piecesCached && this.pieceCache[key]) {
            // Clone the cached image
            pieceElement = $(this.pieceCache[key].cloneNode(true));
        } else {
            // Fall back to creating a new image element
            const url = `/media/pieces/${this.settings.theme.pieces}/${color}/${type}.svg`;
            pieceElement = $('<img>', {
                src: url,
                alt: type,
                class: 'chess-piece',
                draggable: false
            });
        }

        // Add data attributes for easier identification
        pieceElement.attr('data-piece-type', type);
        pieceElement.attr('data-piece-color', color);
        
        // Add the piece to the board
        this.getSquare(index).append(pieceElement);
    }

    /**
     * Updates the board after a move by moving the piece from one square to another.
     */
    updateBoard = ($from, $to, $piece, classes=true) => {
        // Move the piece to the target square
        $piece.appendTo($to);
        
        if (classes) {
            // Remove any previous move indicators
            $('.' + Css.JUST_MOVED).removeClass(Css.JUST_MOVED);
            
            // Mark both squares as "just moved"
            $from.addClass(Css.JUST_MOVED);
            $to.addClass(Css.JUST_MOVED);
        }
    }
    
    /**
     * Clears all arrow and highlight elements from the board.
     */
    clearBoard() {
        this.highlights = [];
        this.arrows = [];
        this.render();
    }

    /**
     * Animates a piece's movement back to its original square.
     */
    animatePiece = ($piece, $from) => {
        if ($piece.parent().attr('id') === $from.attr('id')) return;

        const fromOffset = $from.offset();
        const pieceOffset = $piece.offset();
        
        const dx = fromOffset.left - pieceOffset.left;
        const dy = fromOffset.top - pieceOffset.top;
        
        $piece.css('transform', `translate(${dx}px, ${dy}px)`);
        
        setTimeout(() => {
            $piece.css('transform', '');
            $piece.appendTo($from);
        }, this.settings.revertDuration);
    }
    
    /**
     * Handles the logic for making a move on the board.
     * 
     * @param {string} from - The algebraic notation of the starting square.
     * @param {string} to - The algebraic notation of the destination square.
     * @param {boolean} animate - Whether to animate the piece movement.
     * @param {string|null} fenBefore - The FEN string before the move (for analysis).
     * @param {string|undefined} classification - Classification of the move (e.g., "brilliant").
     * @param {boolean} showPromotionUI - Whether to show the promotion UI.
     * @param {string|null} promotedPiece - The piece to promote to (if applicable).
     */
    move = (from, to, animate = false, fenBefore = null, classification = undefined, showPromotionUI = false, promotedPiece = null) => {
        // Convert from algebraic notation to indices
        const fromIdx = this.algebraicToIndex(from, this.flipped);
        const toIdx = this.algebraicToIndex(to, this.flipped);
        
        // Get jQuery elements for the squares and piece
        const $fromSquare = this.getSquare(fromIdx);
        const $toSquare = this.getSquare(toIdx);
        const $piece = $fromSquare.children().first();
        
        try {
            // Handle promotion UI if needed
            if (showPromotionUI && this.isPawnPromotion(from, to) && !promotedPiece) {
                // Store data for when promotion is selected
                this.pendingPromotion = { 
                    from, 
                    to, 
                    fromIdx, 
                    toIdx, 
                    $fromSquare, 
                    $toSquare, 
                    $piece, 
                    animate, 
                    fenBefore,
                    classification
                };
                
                // Show promotion UI
                this.showPromotionPanel(toIdx);
                return null; // Don't complete the move until promotion piece is selected
            }
            
            // Make the move in the chess.js engine
            const moveOptions = { from, to };
            if (promotedPiece) moveOptions.promotion = promotedPiece;
            
            const moveResult = this.chess.move(moveOptions);
            
            // Update the visual board representation
            this.updateBoard($fromSquare, $toSquare, $piece);
            
            // Handle special moves like castling, en passant, promotion
            this.handleSpecialMoves(moveResult, toIdx, classification);
            
            // Play appropriate sound for the move
            this.playSoundBasedOnOutcome(moveResult);
            
            return moveResult;
            
        } catch (error) {
            console.error("Illegal move:", error);
            // Return the piece to its original square if the move was illegal
            if (animate) {
                this.animatePiece($piece, $fromSquare);
            } else {
                $piece.appendTo($fromSquare);
            }
            return null;
        }
    }

    /**
     * Checks if a pawn move is a promotion.
     */
    isPawnPromotion(fromAlg, toAlg) {
        const piece = this.chess.get(fromAlg);
        if (!piece || piece.type !== 'p') return false;
        
        // Check if reaching the last rank
        return (piece.color === 'w' && toAlg[1] === '8') || 
               (piece.color === 'b' && toAlg[1] === '1');
    }
    
    /**
     * Shows the promotion piece selection panel at the target square.
     */
    showPromotionPanel(targetSquareIdx) {
        if (!this.pendingPromotion) return;
        
        const $targetSquare = this.getSquare(targetSquareIdx);
        const piece = this.chess.get(this.pendingPromotion.from);
        
        if (!piece) return;
        
        // Create the promotion panel
        const $panel = $('<div>', { class: 'promotion-panel' });
        
        // Add each promotion piece option
        const promotionPieces = ['q', 'r', 'b', 'n']; // Queen, Rook, Bishop, Knight
        const color = piece.color;
        
        promotionPieces.forEach(pieceType => {
            const $pieceOption = $('<div>', { class: 'promotion-piece' });
            
            // Create or clone piece image
            let $pieceImg;
            const key = `${color}_${pieceType}`;
            
            if (this.piecesCached && this.pieceCache[key]) {
                $pieceImg = $(this.pieceCache[key].cloneNode(true));
            } else {
                $pieceImg = $('<img>', {
                    src: `/media/pieces/${this.settings.theme.pieces}/${color}/${pieceType}.svg`,
                    alt: pieceType
                });
            }
            
            $pieceOption.append($pieceImg);
            $pieceOption.on('click', () => this.completePromotion(pieceType));
            $panel.append($pieceOption);
        });
        
        // Add cancel button
        const $cancelBtn = $('<div>', { 
            class: 'promotion-cancel',
            text: '✕'
        });
        $cancelBtn.on('click', () => this.cancelPromotion());
        $panel.append($cancelBtn);
        
        // Position the panel
        const boardRect = document.getElementById('chessboard').getBoundingClientRect();
        const squareRect = $targetSquare[0].getBoundingClientRect();
        
        // Check if the panel should appear above or below the square based on position
        const isTopHalf = squareRect.top < boardRect.top + boardRect.height / 2;
        
        // Position the panel either above or below the square
        if (isTopHalf) {
            $panel.css({
                left: squareRect.left + 'px',
                top: squareRect.bottom + 'px'
            });
        } else {
            $panel.css({
                left: squareRect.left + 'px',
                top: (squareRect.top - (80 * promotionPieces.length + 40)) + 'px'
            });
        }
        
        // Add to document and handle outside clicks
        $('body').append($panel);
        
        // Handle clicking outside the panel
        setTimeout(() => {
            $(document).one('click', (e) => {
                if (!$(e.target).closest('.promotion-panel').length) {
                    this.cancelPromotion();
                }
            });
        }, 10);
    }
    
    /**
     * Completes the promotion move with the selected piece type.
     */
    completePromotion(pieceType) {
        if (!this.pendingPromotion) return;
        
        const { 
            from, 
            to, 
            animate, 
            fenBefore,
            classification 
        } = this.pendingPromotion;
        
        // Remove the promotion panel
        $('.promotion-panel').remove();
        
        // Complete the move with the selected promotion piece
        const moveResult = this.move(from, to, animate, fenBefore, classification, false, pieceType);
        
        // Clear the pending promotion state
        this.pendingPromotion = null;
        
        return moveResult;
    }
    
    /**
     * Cancels the promotion and reverts the move.
     */
    cancelPromotion() {
        if (!this.pendingPromotion) return;
        
        const { $piece, $fromSquare } = this.pendingPromotion;
        
        // Move the piece back to its original square
        $piece.appendTo($fromSquare);
        
        // Remove the promotion panel
        $('.promotion-panel').remove();
        
        // Clear the pending promotion state
        this.pendingPromotion = null;
    }

    /**
     * Handles special moves like castling, en passant, and promotion.
     */
    handleSpecialMoves = (moveResult, targetSquareIndex, classification) => {
        if (!moveResult) return;
        
        if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) {
            // Castling (kingside or queenside)
            this.handleCastling(moveResult);
        } else if (moveResult.flags.includes('e')) {
            // En passant
            this.handleEnPassant(moveResult);
        } else if (moveResult.flags.includes('p')) {
            // Promotion
            this.handlePromotion(moveResult, targetSquareIndex, classification);
        }
    }
    
    /**
     * Handles castling move visualization.
     */
    handleCastling = (moveResult) => {
        const isKingside = moveResult.flags.includes('k');
        const color = moveResult.color;
        const rank = color === 'w' ? '1' : '8';
        
        // Define rook's original and target squares
        let rookFromFile, rookToFile;
        
        if (isKingside) {
            rookFromFile = 'h';
            rookToFile = 'f';
        } else {
            rookFromFile = 'a';
            rookToFile = 'd';
        }
        
        // Get the indices of the rook's squares
        const rookFromAlg = rookFromFile + rank;
        const rookToAlg = rookToFile + rank;
        
        const rookFromIdx = this.algebraicToIndex(rookFromAlg, this.flipped);
        const rookToIdx = this.algebraicToIndex(rookToAlg, this.flipped);
        
        // Get the rook element and move it
        const $rookFrom = this.getSquare(rookFromIdx);
        const $rookTo = this.getSquare(rookToIdx);
        const $rook = $rookFrom.children().first();
        
        this.updateBoard($rookFrom, $rookTo, $rook, false);
    }
    
    /**
     * Handles promotion move visualization.
     */
    handlePromotion = (moveResult, targetSquareIndex, classification) => {
        const color = moveResult.color;
        const promotionPiece = moveResult.promotion;
        
        // Replace the pawn with the promotion piece
        const $targetSquare = this.getSquare(targetSquareIndex);
        $targetSquare.empty();
        
        // Create the new promotion piece
        this.createPiece(targetSquareIndex, promotionPiece, color);
        
        // Play promotion sound
        this.playSound(Sound.PROMOTE);
    }
    
    /**
     * Handles en passant move visualization.
     */
    handleEnPassant = (moveResult) => {
        const color = moveResult.color;
        const targetRank = moveResult.to[1];
        const capturedRank = color === 'w' ? '5' : '4';
        const capturedFile = moveResult.to[0];
        
        // Get the position of the captured pawn
        const capturedPawnAlg = capturedFile + capturedRank;
        const capturedPawnIdx = this.algebraicToIndex(capturedPawnAlg, this.flipped);
        
        // Remove the captured pawn
        this.getSquare(capturedPawnIdx).empty();
    }
    
    /**
     * Unmakes the last move and reverts the board to the previous state.
     */
    render() {
        // Get canvas element
        const canvas = $('.board-elements');
        const ctx = canvas[0].getContext('2d');
    
        // Clear previous drawings
        ctx.clearRect(0, 0, canvas.width(), canvas.height());

        // Calculate square size 
        const squareSize = $('#square0').width();
        if (!squareSize) return;
        
        // Set canvas width and height to match board
        canvas.attr('width', $('#chessboard').width());
        canvas.attr('height', $('#chessboard').height());
    
        // Draw all arrows
        this.arrows.forEach(([from, to]) => {
            const $fromSquare = this.getSquare(from);
            const $toSquare = this.getSquare(to);
            
            if ($fromSquare.length && $toSquare.length) {
                const fromCenter = {
                    x: $fromSquare.offset().left - $('#chessboard').offset().left + squareSize / 2,
                    y: $fromSquare.offset().top - $('#chessboard').offset().top + squareSize / 2
                };
                
                const toCenter = {
                    x: $toSquare.offset().left - $('#chessboard').offset().left + squareSize / 2,
                    y: $toSquare.offset().top - $('#chessboard').offset().top + squareSize / 2
                };
                
                // Check if from and to are knight's move apart
                const dx = Math.abs(this.getSquareIndex($fromSquare) % 8 - this.getSquareIndex($toSquare) % 8);
                const dy = Math.abs(Math.floor(this.getSquareIndex($fromSquare) / 8) - Math.floor(this.getSquareIndex($toSquare) / 8));
                
                if ((dx === 1 && dy === 2) || (dx === 2 && dy === 1)) {
                    this.drawKnightArrow(ctx, fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, squareSize, squareSize / 3);
                } else {
                    this.drawArrow(canvas[0], ctx, fromCenter.x, fromCenter.y, toCenter.x, toCenter.y);
                }
            }
        });
    }

    /**
     * Handles the window resize event to maintain the proper board appearance.
     */
    onResize() {
        // Redraw highlights and arrows after resize
        this.render();
        
        // Refresh the board to maintain dimensions
        if (this.chess) {
            // Store the current FEN to restore after refresh
            const currentFen = this.chess.fen();
            
            // If the board is already initialized, just refresh it
            this.fen(currentFen);
        }
    }
    
    /**
     * Clears all highlights and arrows from the board.
     */
    clearBoardElements() {
        // Clear highlights
        $('.' + Css.HIGHLIGHT).removeClass(Css.HIGHLIGHT);
        this.highlights = [];
        
        // Clear arrows
        this.arrows = [];
        
        // Redraw the board
        this.render();
    }
    
    /**
     * Plays the sound effect for a given sound type.
     */
    playSound(sound) {
        if (!this.audioContext || !this.audioBuffers[sound]) return;
        
        const source = this.audioContext.createBufferSource();
        source.buffer = this.audioBuffers[sound];
        source.connect(this.volumeNode);
        source.start(0);
    }
    
    /**
     * Plays an appropriate sound based on the move result.
     */
    playSoundBasedOnOutcome = (moveResult) => {
        if (!moveResult) return;
        
        if (moveResult.san.includes('#')) {
            this.playSound(Sound.CHECK);
        } else if (moveResult.san.includes('+')) {
            this.playSound(Sound.CHECK);
        } else if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) {
            this.playSound(Sound.CASTLE);
        } else if (moveResult.flags.includes('c') || moveResult.flags.includes('e')) {
            this.playSound(Sound.CAPTURE);
        } else {
            this.playSound(Sound.MOVE);
        }
    }
    
    // Initialization for drag and drop functionality
    initializeDragInput = () => {
        $('.square > img').draggable({
            containment: '#chessboard',
            zIndex: 1000,
            revert: true,
            revertDuration: this.settings.revertDuration,
            start: (event, ui) => {
                const $piece = $(event.target);
                const $square = $piece.parent();
                $square.addClass(Css.SELECTED);
                
                // Make all valid squares droppable
                const fromIdx = this.getSquareIndex($square);
                const fromAlg = this.indexToAlgebraic(fromIdx, this.flipped);
            },
            stop: (event, ui) => {
                const $piece = $(event.target);
                const $square = $piece.parent();
                $square.removeClass(Css.SELECTED);
                $('.' + Css.DROPPABLE).removeClass(Css.DROPPABLE);
            }
        });
        
        $('.square').droppable({
            accept: 'img',
            hoverClass: 'ui-droppable-hover',
            drop: (event, ui) => {
                const $toSquare = $(event.target);
                const $piece = ui.draggable;
                const $fromSquare = $piece.parent();
                
                // Don't do anything if dropping on the same square
                if ($fromSquare.attr('id') === $toSquare.attr('id')) return;
                
                const fromIdx = this.getSquareIndex($fromSquare);
                const toIdx = this.getSquareIndex($toSquare);
                
                const fromAlg = this.indexToAlgebraic(fromIdx, this.flipped);
                const toAlg = this.indexToAlgebraic(toIdx, this.flipped);
                
                // Attempt to move the piece
                this.move(fromAlg, toAlg, true, null, undefined, true);
            }
        });
    }
    
    // Initialization for click-based input
    initializeClickInput = () => {
        $('.square').on('click', (event) => {
            const $square = $(event.currentTarget);
            const idx = this.getSquareIndex($square);
            const squareAlg = this.indexToAlgebraic(idx, this.flipped);
            
            // If a piece is already selected
            if (this.selectedPiece) {
                const $fromSquare = this.selectedPiece.parent();
                const fromIdx = this.getSquareIndex($fromSquare);
                const fromAlg = this.indexToAlgebraic(fromIdx, this.flipped);
                
                // Deselect if clicking the same square
                if (fromIdx === idx) {
                    $fromSquare.removeClass(Css.SELECTED);
                    this.selectedPiece = undefined;
                } else {
                    // Attempt to move to the new square
                    const moveResult = this.move(fromAlg, squareAlg, false, null, undefined, true);
                    
                    // Deselect the piece
                    $fromSquare.removeClass(Css.SELECTED);
                    this.selectedPiece = undefined;
                    
                    // If move failed and the clicked square has a piece of the same color, select it
                    if (!moveResult) {
                        const piece = this.chess.get(squareAlg);
                        const $newPiece = $square.children().first();
                        
                        if (piece && $newPiece.length) {
                            $square.addClass(Css.SELECTED);
                            this.selectedPiece = $newPiece;
                        }
                    }
                }
            } else {
                // If no piece is selected and the square contains a piece, select it
                const $piece = $square.children().first();
                
                if ($piece.length) {
                    $square.addClass(Css.SELECTED);
                    this.selectedPiece = $piece;
                }
            }
        });
    }
    
    // Initialize arrow drawing functionality
    initializeArrowInput() {
        // Set up canvas for drawing
        const $canvas = $('.board-elements');
        const $chessboard = $('#chessboard');
        
        if (!$canvas.length || !$chessboard.length) return;
        
        $canvas.attr('width', $chessboard.width());
        $canvas.attr('height', $chessboard.height());
        
        // Variables to track dragging
        let isDragging = false;
        let startSquare = null;
        let startPosition = { x: 0, y: 0 };
        
        // Handle mouse down to start arrow
        $chessboard.on('mousedown', (e) => {
            // Only proceed if right mouse button (which is 2)
            if (e.button !== 2) return;
            e.preventDefault();
            
            startPosition = { x: e.clientX, y: e.clientY };
            const $square = this.getSquareFromPosition(e.clientX, e.clientY);
            
            if ($square) {
                isDragging = true;
                startSquare = this.getSquareIndex($square);
            }
        });
        
        // Handle mouse move during arrow drawing
        $(document).on('mousemove', (e) => {
            if (!isDragging) return;
            
            // Prevent text selection during dragging
            e.preventDefault();
        });
        
        // Handle mouse up to finish arrow
        $(document).on('mouseup', (e) => {
            if (!isDragging) return;
            
            isDragging = false;
            
            // If right mouse button and we have a start square
            if (e.button === 2 && startSquare !== null) {
                const endPosition = { x: e.clientX, y: e.clientY };
                const $endSquare = this.getSquareFromPosition(endPosition.x, endPosition.y);
                
                if ($endSquare) {
                    const endSquare = this.getSquareIndex($endSquare);
                    
                    // If start and end are different squares
                    if (startSquare !== endSquare) {
                        this.createArrow(startSquare, endSquare);
                    } else {
                        // If same square, toggle highlight
                        this.highlight(startSquare);
                    }
                }
            }
            
            startSquare = null;
        });
    }
    
    /**
     * Toggles a highlight on the given square.
     */
    highlight = (square) => {
        const $square = this.getSquare(square);
        
        // Toggle CSS class for visual highlight
        $square.toggleClass(Css.HIGHLIGHT);
        
        // Update internal highlights array
        const highlightIndex = this.highlights.indexOf(square);
        
        if (highlightIndex === -1) {
            // Add highlight if not present
            this.highlights.push(square);
        } else {
            // Remove highlight if already present
            this.highlights.splice(highlightIndex, 1);
        }
    }
    
    /**
     * Creates or toggles an arrow between two squares.
     */
    createArrow = (start, end) => {
        // Check if this arrow already exists
        const existingArrowIndex = this.arrows.findIndex(
            arrow => arrow[0] === start && arrow[1] === end
        );
        
        if (existingArrowIndex !== -1) {
            // Remove arrow if it exists
            this.arrows.splice(existingArrowIndex, 1);
        } else {
            // Add new arrow
            this.arrows.push([start, end]);
        }
        
        // Redraw all arrows
        this.render();
    }
    
    /**
     * Draws an arrowhead at the specified coordinates.
     */
    drawArrowhead(ctx, toX, toY, angle, length) {
        ctx.save();
        ctx.translate(toX, toY);
        ctx.rotate(angle);
        
        // Draw the arrowhead
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-length, -length / 2);
        ctx.lineTo(-length * 0.8, 0);
        ctx.lineTo(-length, length / 2);
        ctx.closePath();
        
        ctx.fill();
        ctx.restore();
    }
    
    /**
     * Draws a straight arrow between two points.
     */
    drawArrow(canvas, ctx, fromX, fromY, toX, toY) {
        const headLength = canvas.width * 0.03; // Scale arrowhead with board
        const lineWidth = canvas.width * 0.01;  // Scale line with board
        
        // Calculate angle for the arrowhead
        const angle = Math.atan2(toY - fromY, toX - fromX);
        
        // Adjust the end point to account for arrowhead
        const arrowheadX = toX - headLength * Math.cos(angle);
        const arrowheadY = toY - headLength * Math.sin(angle);
        
        // Draw the line
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(arrowheadX, arrowheadY);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        
        // Draw the arrowhead
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        this.drawArrowhead(ctx, toX, toY, angle, headLength);
    }
    
    /**
     * Draws an L-shaped knight-move arrow.
     */
    drawKnightArrow(ctx, fromX, fromY, toX, toY, s, headLength) {
        const lineWidth = s * 0.03;
        
        // Calculate the midpoint for the L shape
        let midX, midY;
        
        // Determine the direction of the knight's move
        const dx = toX - fromX;
        const dy = toY - fromY;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal first, then vertical
            midX = toX - dx / 3;
            midY = fromY;
        } else {
            // Vertical first, then horizontal
            midX = fromX;
            midY = toY - dy / 3;
        }
        
        // Draw the first line segment
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(midX, midY);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        
        // Draw the second line segment
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(toX - headLength * (toX - midX) / Math.sqrt((toX - midX)**2 + (toY - midY)**2), 
                   toY - headLength * (toY - midY) / Math.sqrt((toX - midX)**2 + (toY - midY)**2));
        ctx.stroke();
        
        // Calculate angle for arrowhead
        const angle = Math.atan2(toY - midY, toX - midX);
        
        // Draw the arrowhead
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        this.drawArrowhead(ctx, toX, toY, angle, headLength);
    }
} 