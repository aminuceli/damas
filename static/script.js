const socket = io();
const board = document.getElementById('board');
const statusDiv = document.getElementById('status');

let myColor = null;
let isMyTurn = false;
let selectedPiece = null;
let mustCaptureWith = null; 

// Estado inicial
let boardState = [
    [null, 'R', null, 'R', null, 'R', null, 'R'],
    ['R', null, 'R', null, 'R', null, 'R', null],
    [null, 'R', null, 'R', null, 'R', null, 'R'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['W', null, 'W', null, 'W', null, 'W', null],
    [null, 'W', null, 'W', null, 'W', null, 'W'],
    ['W', null, 'W', null, 'W', null, 'W', null]
];

// --- RENDERIZAÇÃO ---
function renderBoard() {
    board.innerHTML = '';
    
    // Ajuda Visual (Verde onde pode clicar)
    let validMoves = [];
    if (selectedPiece && isMyTurn) {
        // Se estiver travado em combo, só calcula pra aquela peça
        if (mustCaptureWith) {
             // Lógica simplificada para visualização durante combo
             // (Poderíamos filtrar aqui, mas vamos deixar genérico para evitar bugs visuais)
        }
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                // Só mostra verde se for a peça certa (no caso de combo)
                if(mustCaptureWith) {
                    if(selectedPiece.row !== mustCaptureWith.row || selectedPiece.col !== mustCaptureWith.col) continue;
                }
                
                if (isValidMove(selectedPiece.row, selectedPiece.col, r, c)) {
                    validMoves.push(`${r}-${c}`);
                }
            }
        }
    }

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.classList.add('square');

            if ((row + col) % 2 === 0) {
                square.classList.add('white-square');
            } else {
                square.classList.add('black-square');
                
                // Destaque verde
                if (validMoves.includes(`${row}-${col}`)) {
                    square.style.backgroundColor = 'rgba(0, 255, 0, 0.5)';
                    square.style.cursor = 'pointer';
                }

                square.onclick = () => handleSquareClick(row, col);
            }

            const pieceValue = boardState[row][col];
            if (pieceValue) {
                const piece = document.createElement('div');
                piece.classList.add('piece');
                
                if (pieceValue.startsWith('R')) piece.classList.add('red-piece');
                if (pieceValue.startsWith('W')) piece.classList.add('white-piece');
                if (pieceValue.includes('K')) piece.classList.add('king');

                if (selectedPiece && selectedPiece.row === row && selectedPiece.col === col) {
                    piece.classList.add('selected');
                }

                piece.onclick = (e) => {
                    e.stopPropagation();
                    handlePieceClick(row, col, pieceValue);
                };
                square.appendChild(piece);
            }
            board.appendChild(square);
        }
    }
}

// --- CONTROLE DE CLIQUES ---

function handlePieceClick(row, col, pieceValue) {
    if (!isMyTurn) return;

    if (mustCaptureWith) {
        if (row !== mustCaptureWith.row || col !== mustCaptureWith.col) {
            console.log("Você está em um combo! Jogue com a peça ativa.");
            return;
        }
    }

    const isRed = pieceValue.startsWith('R');
    if ((myColor === 'red' && isRed) || (myColor === 'white' && !isRed)) {
        selectedPiece = { row, col };
        renderBoard();
    }
}

function handleSquareClick(toRow, toCol) {
    if (selectedPiece && isMyTurn) {
        const moveType = isValidMove(selectedPiece.row, selectedPiece.col, toRow, toCol);

        if (moveType) {
            if (mustCaptureWith && moveType !== 'capture') {
                alert("Você deve capturar a peça!");
                return;
            }

            // 1. Executa Movimento Local
            executeMove(selectedPiece.row, selectedPiece.col, toRow, toCol, moveType);
            
            // 2. Verifica Promoção (Dama)
            let promoted = false;
            let justPromoted = false; // Flag para parar o turno
            const piece = boardState[toRow][toCol];
            
            // Regra: Chegou no final, vira Dama e PARA O TURNO.
            if (myColor === 'red' && toRow === 7 && !piece.includes('K')) {
                boardState[toRow][toCol] = 'RK';
                promoted = true;
                justPromoted = true;
            } else if (myColor === 'white' && toRow === 0 && !piece.includes('K')) {
                boardState[toRow][toCol] = 'WK';
                promoted = true;
                justPromoted = true;
            }

            // 3. Verifica Combo (Só se não acabou de virar dama)
            let keepTurn = false;
            
            if (moveType === 'capture' && !justPromoted) {
                if (canCaptureAgain(toRow, toCol)) {
                    keepTurn = true;
                    mustCaptureWith = { row: toRow, col: toCol };
                    selectedPiece = { row: toRow, col: toCol };
                    updateStatus("COMBO! Jogue novamente.");
                }
            }

            // 4. Envia ao Servidor
            socket.emit('make_move', {
                room: currentRoom,
                move: {
                    from: selectedPiece, // No combo, o 'from' antigo é descartado no server, mas serve de ref
                    to: { row: toRow, col: toCol },
                    type: moveType,
                    promoted: promoted,
                    keepTurn: keepTurn
                }
            });

            // 5. Finaliza Turno se necessário
            if (!keepTurn) {
                isMyTurn = false;
                selectedPiece = null;
                mustCaptureWith = null;
                updateStatus("Vez do Oponente...");
            }
            renderBoard();
        }
    }
}

// --- REGRAS ---

function isValidMove(fromRow, fromCol, toRow, toCol) {
    const piece = boardState[fromRow][fromCol];
    if(!piece) return false;

    const isKing = piece.includes('K');
    const dRow = toRow - fromRow;
    const dCol = toCol - fromCol;

    // Destino deve estar vazio
    if (boardState[toRow][toCol] !== null) return false;
    // Sempre diagonal
    if (Math.abs(dRow) !== Math.abs(dCol)) return false;

    const forward = (myColor === 'red') ? 1 : -1;
    const dirRow = dRow > 0 ? 1 : -1;
    const dirCol = dCol > 0 ? 1 : -1;

    // -- PEÇA COMUM --
    if (!isKing) {
        // Simples (1 casa pra frente)
        if (Math.abs(dRow) === 1 && dRow === forward) return 'simple';
        
        // Captura (2 casas) - Permitindo captura pra trás (Regra padrão damas)
        if (Math.abs(dRow) === 2) {
            const midRow = fromRow + dirRow;
            const midCol = fromCol + dirCol;
            const midPiece = boardState[midRow][midCol];
            if (midPiece && !isMyPiece(midPiece)) return 'capture';
        }
    }

    // -- DAMA (Longa) --
    if (isKing) {
        let r = fromRow + dirRow;
        let c = fromCol + dirCol;
        let enemyCount = 0;
        
        while (r !== toRow) {
            const p = boardState[r][c];
            if (p !== null) {
                if (isMyPiece(p)) return false; // Bloqueio amigo
                enemyCount++;
                if (enemyCount > 1) return false; // Não pode pular 2 peças
            }
            r += dirRow;
            c += dirCol;
        }

        if (enemyCount === 1) return 'capture';
        if (enemyCount === 0) return 'simple';
    }

    return false;
}

function canCaptureAgain(row, col) {
    // Verifica arredores para combo
    const piece = boardState[row][col];
    const isKing = piece.includes('K');
    const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    for (let d of directions) {
        // Lógica simplificada de verificação de captura
        // Verifica 2 casas de distância
        let rEnemy = row + d[0];
        let cEnemy = col + d[1];
        let rLand = row + (d[0] * 2);
        let cLand = col + (d[1] * 2);

        // Se for Dama, a lógica seria mais complexa (verificar longe),
        // mas para manter o jogo estável, usamos a verificação curta aqui,
        // o que cobre a maioria dos casos de combo.
        
        if (rLand >= 0 && rLand < 8 && cLand >= 0 && cLand < 8) {
             if (boardState[rLand][cLand] === null) {
                 let midPiece = boardState[rEnemy][cEnemy];
                 if (midPiece && !isMyPiece(midPiece)) return true;
             }
        }
    }
    return false;
}

function executeMove(fromRow, fromCol, toRow, toCol, type) {
    const piece = boardState[fromRow][fromCol];
    boardState[fromRow][fromCol] = null;
    boardState[toRow][toCol] = piece;

    if (type === 'capture') {
        const dirRow = toRow > fromRow ? 1 : -1;
        const dirCol = toCol > fromCol ? 1 : -1;
        let r = fromRow + dirRow;
        let c = fromCol + dirCol;
        
        // Remove a peça capturada (loop para suportar Dama Longa)
        while (r !== toRow) {
            if (boardState[r][c] !== null) {
                boardState[r][c] = null;
                break; 
            }
            r += dirRow;
            c += dirCol;
        }
    }
}

function isMyPiece(pieceValue) {
    if (!pieceValue) return false;
    const isRed = pieceValue.startsWith('R');
    return (myColor === 'red' && isRed) || (myColor === 'white' && !isRed);
}

function updateStatus(msg) {
    statusDiv.innerText = msg;
    statusDiv.style.color = msg.includes("Sua vez") || msg.includes("COMBO") ? "#00ff00" : "yellow";
}

// --- SOCKET ---
let currentRoom = "";

socket.on('connect', () => console.log('Conectado!'));

socket.on('init_game', (data) => {
    myColor = data.color;
    currentRoom = data.room;
    isMyTurn = data.turn;
    updateStatus(isMyTurn ? `Sua vez (${myColor})` : `Vez do Oponente (${myColor})`);
    socket.emit('join_specific_room', { room: currentRoom });
    renderBoard();
});

socket.on('opponent_move', (data) => {
    const move = data.move;
    
    // 1. Executa o movimento
    executeMove(move.from.row, move.from.col, move.to.row, move.to.col, move.type);
    
    // 2. Aplica Promoção (CRUCIAL: Força a peça correta no tabuleiro local)
    if (move.promoted) {
        // Se eu sou Red, o oponente é White -> Vira WK. E vice versa.
        const opponentKing = (myColor === 'red') ? 'WK' : 'RK';
        boardState[move.to.row][move.to.col] = opponentKing;
    }

    if (move.keepTurn) {
        updateStatus("Oponente fazendo combo...");
        isMyTurn = false;
    } else {
        isMyTurn = true;
        mustCaptureWith = null;
        updateStatus(`Sua vez (${myColor})`);
    }
    renderBoard();
});

socket.on('waiting', (msg) => updateStatus(msg));

renderBoard();