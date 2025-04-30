# Chess Board Integration Guide

This guide explains how to integrate the interactive chess board component into any page of the project.

## Quick Start

To add a chess board to your page, follow these steps:

1. Include the required CSS and JavaScript libraries in your HTML file:

```html
<!-- CSS -->
<link href="/styles/chessboard.css" rel="stylesheet" type="text/css" />

<!-- Scripts -->
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="https://code.jquery.com/ui/1.13.2/jquery-ui.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jqueryui-touch-punch/0.2.3/jquery.ui.touch-punch.min.js"></script>
```

2. Create a container element for the chess board:

```html
<div id="my-chess-board"></div>
```

3. Import and initialize the `ChessboardComponent`:

```javascript
import { ChessboardComponent } from '/scripts/chessboard-component.js';

// Initialize the chess board
const chessboard = new ChessboardComponent('my-chess-board');

// Load a position (optional)
chessboard.setPosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
```

## API Reference

The `ChessboardComponent` provides the following methods:

### Constructor

```javascript
new ChessboardComponent(containerId, options)
```

- `containerId`: The ID of the container element to place the board in
- `options`: (Optional) Configuration options for the board
  - `position`: Initial FEN position string

### Methods

#### `setPosition(fen)`

Sets the position of the chess board using FEN notation.

```javascript
chessboard.setPosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
```

#### `flip()`

Flips the orientation of the board.

```javascript
chessboard.flip();
```

#### `makeMove(from, to, animate = true)`

Makes a move on the board.

```javascript
const result = chessboard.makeMove('e2', 'e4', true);
```

#### `getPosition()`

Gets the current position of the board as a FEN string.

```javascript
const fen = chessboard.getPosition();
```

#### `highlightSquare(square)`

Highlights a square on the board.

```javascript
chessboard.highlightSquare('e4');
```

#### `drawArrow(from, to)`

Creates an arrow on the board.

```javascript
chessboard.drawArrow('e2', 'e4');
```

#### `clearDrawings()`

Clears all highlights and arrows from the board.

```javascript
chessboard.clearDrawings();
```

## Examples

### Basic Chess Board

```html
<div id="chess-container"></div>

<script type="module">
    import { ChessboardComponent } from '/scripts/chessboard-component.js';
    
    const chessboard = new ChessboardComponent('chess-container');
</script>
```

### Interactive Chess Board with Controls

```html
<div id="chess-container"></div>
<button id="flip-btn">Flip Board</button>
<button id="reset-btn">Reset Position</button>

<script type="module">
    import { ChessboardComponent } from '/scripts/chessboard-component.js';
    
    const chessboard = new ChessboardComponent('chess-container');
    
    // Flip the board
    document.getElementById('flip-btn').addEventListener('click', () => {
        chessboard.flip();
    });
    
    // Reset to starting position
    document.getElementById('reset-btn').addEventListener('click', () => {
        chessboard.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    });
</script>
```

See the files `chess-board.html` and `chessboard-example.html` for more complete examples.

## Customization

The chess board can be customized by modifying the CSS variables in `chessboard.css`:

```css
:root {
    --theme-light: #e0e0e0;  /* Light square color */
    --theme-dark: #6ea176;   /* Dark square color */
    --board-scale: 80;       /* Board size (vmin units) */
}
```

## Advanced Usage

For more advanced usage, you can directly access the underlying `Board` instance:

```javascript
const board = chessboard.board;
```

This gives you access to all the low-level methods and properties of the `Board` class. 