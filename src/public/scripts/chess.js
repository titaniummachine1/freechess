/**
 * chess.js - Chess library for move generation and validation
 * https://github.com/jhlywa/chess.js
 */

export class Chess {
  constructor(fen) {
    this.board = [];
    this.kings = { w: null, b: null };
    this.turn = 'w';
    this.castling = { w: 0, b: 0 };
    this.ep_square = null;
    this.half_moves = 0;
    this.move_number = 1;
    this.history = [];
    this.header = {};
    
    if (!fen) {
      this.load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    } else {
      this.load(fen);
    }
  }

  /* Public API methods */
  load(fen) {
    const tokens = fen.split(/\s+/);
    const position = tokens[0];
    let square = 0;

    this.clear();

    for (let i = 0; i < position.length; i++) {
      const piece = position.charAt(i);

      if (piece === '/') {
        square += 8;
      } else if ('12345678'.indexOf(piece) !== -1) {
        square += parseInt(piece, 10);
      } else {
        const color = piece < 'a' ? 'w' : 'b';
        this.put({ type: piece.toLowerCase(), color: color }, this.algebraic(square));
        square++;
      }
    }

    this.turn = tokens[1];
    this.castling = { w: 0, b: 0 };
    
    if (tokens[2].indexOf('K') !== -1) {
      this.castling.w |= 1;
    }
    if (tokens[2].indexOf('Q') !== -1) {
      this.castling.w |= 2;
    }
    if (tokens[2].indexOf('k') !== -1) {
      this.castling.b |= 1;
    }
    if (tokens[2].indexOf('q') !== -1) {
      this.castling.b |= 2;
    }

    this.ep_square = tokens[3] === '-' ? null : tokens[3];
    this.half_moves = parseInt(tokens[4], 10);
    this.move_number = parseInt(tokens[5], 10);

    this.updateSetup(this.generateFen());
    return true;
  }

  fen() {
    return this.generateFen();
  }

  /* Basic functionality methods */
  generateFen() {
    let empty = 0;
    let fen = '';

    for (let i = 0; i < 64; i++) {
      if (this.board[i] == null) {
        empty++;
      } else {
        if (empty > 0) {
          fen += empty;
          empty = 0;
        }
        const color = this.board[i].color;
        const piece = this.board[i].type;
        fen += color === 'w' ? piece.toUpperCase() : piece.toLowerCase();
      }

      if ((i + 1) % 8 === 0) {
        if (empty > 0) {
          fen += empty;
        }
        empty = 0;
        if (i < 56) {
          fen += '/';
        }
      }
    }

    let castling = '';
    if (this.castling.w & 1) castling += 'K';
    if (this.castling.w & 2) castling += 'Q';
    if (this.castling.b & 1) castling += 'k';
    if (this.castling.b & 2) castling += 'q';
    
    const epSquare = this.ep_square || '-';
    
    return [
      fen,
      this.turn,
      castling || '-',
      epSquare,
      this.half_moves,
      this.move_number
    ].join(' ');
  }

  clear() {
    this.board = new Array(64);
    this.kings = { w: null, b: null };
    this.turn = 'w';
    this.castling = { w: 0, b: 0 };
    this.ep_square = null;
    this.half_moves = 0;
    this.move_number = 1;
    this.history = [];
    this.header = {};
    this.updateSetup(this.generateFen());
  }

  put(piece, square) {
    if (!piece) return false;
    if (!/^[a-h][1-8]$/.test(square)) return false;

    const sq = this.algebraic2i(square);
    
    if (piece.type === 'k') {
      this.kings[piece.color] = sq;
    }
    
    this.board[sq] = piece;
    return true;
  }

  get(square) {
    if (!/^[a-h][1-8]$/.test(square)) return null;
    return this.board[this.algebraic2i(square)];
  }

  moves({ verbose = false } = {}) {
    // Placeholder for a more complex implementation
    return [];
  }

  /* Helper methods */
  algebraic(i) {
    const f = i % 8;
    const r = Math.floor(i / 8);
    return 'abcdefgh'.substring(f, f + 1) + '87654321'.substring(r, r + 1);
  }

  algebraic2i(square) {
    const f = 'abcdefgh'.indexOf(square[0]);
    const r = '87654321'.indexOf(square[1]);
    return f + r * 8;
  }

  updateSetup(fen) {
    // Store initial position data
  }

  board() {
    const result = [];
    for (let i = 0; i < 8; i++) {
      result.push([]);
      for (let j = 0; j < 8; j++) {
        const square = i * 8 + j;
        const piece = this.board[square];
        if (piece) {
          result[i].push({
            square: this.algebraic(square),
            type: piece.type,
            color: piece.color
          });
        } else {
          result[i].push(null);
        }
      }
    }
    return result;
  }

  move(move) {
    // Placeholder for move validation and execution
    return { san: "", uci: move.from + move.to };
  }
} 