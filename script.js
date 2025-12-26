const socket = io();
const boardElement = document.getElementById('board');
const statusElement = document.getElementById('status');

let myColor = null;
let myTurn = false;
let currentRoom = null;
let selectedPiece = null; 
let boardState = []; 

// Configuração inicial do tabuleiro
function initialBoard() {
    const rows = 8;
    const cols = 8;
    let board = [];
    for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < cols; c++) {
            if ((r + c) % 2 === 1) { 
                if (r < 3) row.push(2); // Vermelhas
                else if (r > 4) row.push(1); // Brancas
                else row.push(0); 
            } else {
                row.push(null); 
            }
        }
        board.push(row);
    }
    return board;
}

function renderBoard() {
    boardElement.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((r + c) % 2 === 0 ? 'white' : 'black');
            square.dataset.row = r;
            square.dataset.col = c;

            if (boardState[r][c] === 1) {
                square.appendChild(createPiece('white-piece'));
            } else if (boardState[r][c] === 2) {
                square.appendChild(createPiece('red'));
            }

            square.addEventListener('click', handleSquareClick);
            boardElement.appendChild(square);
        }
    }
    updateStatus();
}

function createPiece(colorClass) {
    const piece = document.createElement('div');
    piece.classList.add('piece', colorClass);
    return piece;
}

function handleSquareClick(e) {
    if (!myTurn) return;

    const target = e.target;
    let r, c;

    if (target.classList.contains('piece')) {
        r = parseInt(target.parentElement.dataset.row);
        c = parseInt(target.parentElement.dataset.col);
    } else {
        r = parseInt(target.dataset.row);
        c = parseInt(target.dataset.col);
    }

    const cellValue = boardState[r][c];

    if (myColor === 'white' && cellValue === 1) selectPiece(r, c);
    else if (myColor === 'red' && cellValue === 2) selectPiece(r, c);
    else if (selectedPiece && cellValue === 0) {
        if (isValidMove(selectedPiece.r, selectedPiece.c, r, c)) {
            executeMove(selectedPiece.r, selectedPiece.c, r, c);
            
            socket.emit('make_move', {
                room: currentRoom,
                move: { from: selectedPiece, to: { r, c } }
            });

            myTurn = false;
            selectedPiece = null;
            renderBoard();
        }
    }
}

function selectPiece(r, c) {
    selectedPiece = { r, c };
    renderBoard(); 
    const squares = document.getElementsByClassName('square');
    const index = r * 8 + c;
    if(squares[index].firstChild) {
        squares[index].firstChild.classList.add('selected');
    }
}

function isValidMove(fromR, fromC, toR, toC) {
    const dRow = toR - fromR;
    const dCol = Math.abs(toC - fromC);
    if (dCol !== 1) return false; 
    if (myColor === 'white') return dRow === -1; 
    else return dRow === 1; 
}

function executeMove(fromR, fromC, toR, toC) {
    const piece = boardState[fromR][fromC];
    boardState[fromR][fromC] = 0;
    boardState[toR][toC] = piece;
}

function updateStatus() {
    if (!currentRoom) {
        statusElement.innerText = "Aguardando oponente...";
        return;
    }
    if (myTurn) {
        statusElement.innerText = "Sua vez (" + (myColor === 'white' ? 'Brancas' : 'Vermelhas') + ")";
        statusElement.style.color = "#2ecc71";
    } else {
        statusElement.innerText = "Vez do oponente";
        statusElement.style.color = "#e74c3c";
    }
}

// --- Socket Events ---

socket.on('waiting', (msg) => {
    statusElement.innerText = msg;
});

socket.on('init_game', (data) => {
    myColor = data.color;
    currentRoom = data.room;
    myTurn = data.turn;
    boardState = initialBoard();
    
    // IMPORTANTE: Garante que o cliente entre no canal Socket.io correto
    socket.emit('join_specific_room', { room: currentRoom });
    
    renderBoard();
});

socket.on('opponent_move', (move) => {
    executeMove(move.from.r, move.from.c, move.to.r, move.to.c);
    myTurn = true;
    renderBoard();
});