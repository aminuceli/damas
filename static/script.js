// =============================================================================
// 1. CONFIGURAÇÃO DE CONEXÃO E VARIÁVEIS GLOBAIS
// =============================================================================
const socket = io({
    transports: ['websocket', 'polling'], 
    reconnection: true,
    reconnectionAttempts: 5
});

// --- SISTEMA DE ÁUDIO ---
const audioEffects = {
    move: new Audio('/static/sounds/move.mp3'),
    capture: new Audio('/static/sounds/capture.mp3'),
    king: new Audio('/static/sounds/king.mp3'),
    win: new Audio('/static/sounds/win.mp3'),
    lose: new Audio('/static/sounds/lose.mp3')
};

// Função auxiliar para tocar sons
function playSound(type) {
    const audio = audioEffects[type];
    if (audio) {
        audio.currentTime = 0; 
        audio.play().catch(error => {}); // Ignora erro se navegador bloquear
    }
}

// -- Telas e Paineis --
const lobbyScreen = document.getElementById('lobby-screen');
const waitingScreen = document.getElementById('waiting-screen');
const gameScreen = document.getElementById('game-screen');
const lobbyStatus = document.getElementById('lobby-status');
const roomCodeDisplay = document.getElementById('display-room-code');

// Lista de salas
const roomsContainer = document.getElementById('rooms-list-container'); 

// -- Elementos do Jogo --
const boardElement = document.getElementById('board');
const statusDiv = document.getElementById('status');
const gameOverModal = document.getElementById('game-over-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');

// -- Estado do Jogo --
let myColor = null; 
let isMyTurn = false;
let boardState = []; 
let currentRoom = "";
let isSinglePlayer = false; // Flag para modo Bot

// -- Regras --
let allowedMoves = {}; 
let mustCaptureWith = null;

// -- Drag & Drop --
let draggedPiece = null;
let draggingOrigin = null;
let isDragging = false;

// -- Setup Inicial do Tabuleiro --
const initialBoard = [
    [null, 'R', null, 'R', null, 'R', null, 'R'],
    ['R', null, 'R', null, 'R', null, 'R', null],
    [null, 'R', null, 'R', null, 'R', null, 'R'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['W', null, 'W', null, 'W', null, 'W', null],
    [null, 'W', null, 'W', null, 'W', null, 'W'],
    ['W', null, 'W', null, 'W', null, 'W', null]
];

// =============================================================================
// 2. LÓGICA DO LOBBY (ONLINE & BOT)
// =============================================================================

socket.on('connect', () => {
    if(lobbyStatus) lobbyStatus.innerText = "Conectado ao servidor.";
});

function createRoom() {
    socket.emit('create_room');
}

function joinRoom(roomCode) {
    socket.emit('join_game', { room_code: roomCode });
}

// --- FUNÇÃO PARA INICIAR JOGO CONTRA BOT ---
function startBotGame() {
    isSinglePlayer = true;
    currentRoom = "LOCAL_BOT";
    myColor = "red"; // Jogador sempre é Vermelho
    isMyTurn = true; // Jogador começa

    // Setup Visual
    if(lobbyScreen) lobbyScreen.classList.add('hidden');
    if(gameScreen) gameScreen.classList.remove('hidden');
    hideGameOverModal();

    // Reset Board
    boardState = JSON.parse(JSON.stringify(initialBoard));
    
    updateTextStatus("SUA VEZ (vs BOT)", true);
    allowedMoves = calculateAllowedMoves(boardState, myColor);
    renderBoard();
}

// --- Respostas do Servidor (Multiplayer) ---
socket.on('update_room_list', (rooms) => {
    if(roomsContainer) {
        roomsContainer.innerHTML = ''; 

        if (rooms.length === 0) {
            roomsContainer.innerHTML = '<p style="opacity: 0.5; margin-top:10px;">Nenhuma sala disponível.<br>Crie uma!</p>';
            return;
        }

        rooms.forEach(code => {
            const div = document.createElement('div');
            div.className = 'room-item';
            div.innerHTML = `
                <span>Sala <b>${code}</b></span>
                <button onclick="joinRoom('${code}')">JOGAR</button>
            `;
            roomsContainer.appendChild(div);
        });
    }
});

socket.on('room_created', (data) => {
    document.getElementById('display-room-code').innerText = data.room;
    lobbyScreen.classList.add('hidden');
    waitingScreen.classList.remove('hidden');
});

socket.on('error_msg', (msg) => {
    alert(msg);
});

// =============================================================================
// 3. INÍCIO E CONTROLE DO JOGO
// =============================================================================

socket.on('init_game', (data) => {
    isSinglePlayer = false;
    
    if(lobbyScreen) lobbyScreen.classList.add('hidden');
    if(waitingScreen) waitingScreen.classList.add('hidden');
    if(gameScreen) gameScreen.classList.remove('hidden');
    hideGameOverModal();

    boardState = JSON.parse(JSON.stringify(initialBoard));
    myColor = data.color;
    currentRoom = data.room;
    isMyTurn = data.turn;

    if(isMyTurn) {
        updateTextStatus("SUA VEZ", true);
        allowedMoves = calculateAllowedMoves(boardState, myColor);
        if (hasAnyCaptureRequired()) updateTextStatus('SUA VEZ (CAPTURA OBRIGATÓRIA!)', true);
    } else {
        updateTextStatus("VEZ DO OPONENTE", false);
        allowedMoves = {};
    }
    
    renderBoard();
});

// Recebe Jogada do Oponente (Ou processa a do Bot)
socket.on('opponent_move', (data) => {
    if(isSinglePlayer) return; // Ignora se estiver jogando local
    processOpponentMove(data.move || data);
});

// --- Processa Jogada (Usado para Oponente Online e para Bot) ---
function processOpponentMove(move) {
    const piece = boardState[move.from.row][move.from.col];
    boardState[move.from.row][move.from.col] = null;
    boardState[move.to.row][move.to.col] = piece;

    if(move.type === 'capture') {
         const dirR = move.to.row > move.from.row ? 1 : -1;
         const dirC = move.to.col > move.from.col ? 1 : -1;
         let r = move.from.row + dirR;
         let c = move.from.col + dirC;
         while(r !== move.to.row && c !== move.to.col) {
             if(boardState[r][c] !== null) boardState[r][c] = null;
             r += dirR; c += dirC;
             if(r < 0 || r > 7 || c < 0 || c > 7) break;
         }
    }

    let promoted = move.promoted;
    if (move.promoted) {
        const kingVal = (myColor === 'red') ? 'WK' : 'RK';
        boardState[move.to.row][move.to.col] = kingVal;
    }

    // Sons
    if (promoted) playSound('king');
    else if (move.type === 'capture') playSound('capture');
    else playSound('move');

    if (checkNoPiecesGameOver()) return;

    if (move.keepTurn) {
        updateTextStatus("OPONENTE EM COMBO...", false);
        isMyTurn = false;
        // Se for BOT, ele continua
        if(isSinglePlayer) setTimeout(() => botTurn(true, {row: move.to.row, col: move.to.col}), 1000);
    } else {
        isMyTurn = true;
        mustCaptureWith = null;
        updateTextStatus("SUA VEZ", true);
        
        allowedMoves = calculateAllowedMoves(boardState, myColor);
        
        if(Object.keys(allowedMoves).length === 0) {
            handleLocalGameOver(false, "Você ficou sem movimentos.");
        } else {
             if (hasAnyCaptureRequired()) updateTextStatus('SUA VEZ (CAPTURA OBRIGATÓRIA!)', true);
        }
    }
    renderBoard();
}

// --- Execução Local (Minha Jogada) ---
function executeGameMove(fromRow, fromCol, moveData) {
    const piece = boardState[fromRow][fromCol];
    boardState[fromRow][fromCol] = null;
    boardState[moveData.to.row][moveData.to.col] = piece;

    if (moveData.type === 'capture') {
        const dirR = moveData.to.row > fromRow ? 1 : -1;
        const dirC = moveData.to.col > fromCol ? 1 : -1;
        let r = fromRow + dirR;
        let c = fromCol + dirC;
        while(r !== moveData.to.row) {
            if(boardState[r][c] !== null) boardState[r][c] = null;
            r += dirR; c += dirC;
            if(r < 0 || r > 7 || c < 0 || c > 7) break;
        }
    }

    let nextMoves = calculateAllowedMoves(boardState, myColor, {row: moveData.to.row, col: moveData.to.col});
    let hasCombo = false;
    const nextKey = `${moveData.to.row}-${moveData.to.col}`;
    
    if(moveData.type === 'capture' && nextMoves[nextKey] && nextMoves[nextKey].some(m => m.type === 'capture')) {
        hasCombo = true;
    }

    let promoted = false;
    const isKingAlready = piece.includes('K');
    const promotionRow = (myColor === 'red') ? 7 : 0;
    
    // REGRA DAMA IMEDIATA: Tocou a linha, vira Dama (mesmo em combo)
    if (!isKingAlready && moveData.to.row === promotionRow) {
        const kingVal = (myColor === 'red') ? 'RK' : 'WK';
        boardState[moveData.to.row][moveData.to.col] = kingVal;
        promoted = true;
    }

    // Sons
    if (promoted) playSound('king');
    else if (moveData.type === 'capture') playSound('capture');
    else playSound('move');

    // Envia ao servidor se Online
    if(!isSinglePlayer) {
        socket.emit('make_move', {
            room: currentRoom,
            move: {
                from: { row: fromRow, col: fromCol },
                to: { row: moveData.to.row, col: moveData.to.col },
                type: moveData.type,
                promoted: promoted,
                keepTurn: hasCombo
            }
        });
    }

    if (hasCombo) {
        mustCaptureWith = { row: moveData.to.row, col: moveData.to.col };
        allowedMoves = nextMoves; 
        updateTextStatus("COMBO! Jogue novamente.", true);
        renderBoard();
    } else {
        isMyTurn = false;
        mustCaptureWith = null;
        allowedMoves = {};
        
        if(isSinglePlayer) {
            updateTextStatus("BOT PENSANDO...", false);
            renderBoard(); 
            setTimeout(() => botTurn(), 1000); 
        } else {
            updateTextStatus("AGUARDANDO OPONENTE...", false);
            renderBoard();
        }
    }
    
    if (checkNoPiecesGameOver()) return;
}

// =============================================================================
// 4. LÓGICA DO BOT
// =============================================================================

function botTurn(isCombo = false, specificPiece = null) {
    if(checkNoPiecesGameOver()) return;

    const botColor = (myColor === 'red') ? 'white' : 'red';
    
    let possibleMoves = calculateAllowedMoves(boardState, botColor, specificPiece);
    
    let allMoves = [];
    Object.keys(possibleMoves).forEach(key => {
        const [r, c] = key.split('-').map(Number);
        possibleMoves[key].forEach(move => {
            allMoves.push({
                from: {row: r, col: c},
                to: move.to,
                type: move.type,
                promoted: false 
            });
        });
    });

    if(allMoves.length === 0) {
        handleLocalGameOver(true, "Bot não tem movimentos.");
        return;
    }

    const randomMove = allMoves[Math.floor(Math.random() * allMoves.length)];

    const piece = boardState[randomMove.from.row][randomMove.from.col];
    const isKingAlready = piece.includes('K');
    const botPromotionRow = (botColor === 'red') ? 7 : 0;
    
    if (!isKingAlready && randomMove.to.row === botPromotionRow) {
        randomMove.promoted = true;
    }

    // Simulação rápida para verificar combo do Bot
    let tempBoard = JSON.parse(JSON.stringify(boardState));
    tempBoard[randomMove.from.row][randomMove.from.col] = null;
    tempBoard[randomMove.to.row][randomMove.to.col] = piece;
    
    if(randomMove.type === 'capture') {
        const dirR = randomMove.to.row > randomMove.from.row ? 1 : -1;
        const dirC = randomMove.to.col > randomMove.from.col ? 1 : -1;
        let r = randomMove.from.row + dirR;
        let c = randomMove.from.col + dirC;
        while(r !== randomMove.to.row) {
             tempBoard[r][c] = null;
             r += dirR; c += dirC;
             if(r < 0 || r > 7 || c < 0 || c > 7) break;
        }
    }
    
    let futureMoves = calculateAllowedMoves(tempBoard, botColor, {row: randomMove.to.row, col: randomMove.to.col});
    let nextKey = `${randomMove.to.row}-${randomMove.to.col}`;
    let willHaveCombo = (randomMove.type === 'capture' && futureMoves[nextKey] && futureMoves[nextKey].some(m => m.type === 'capture'));

    randomMove.keepTurn = willHaveCombo;

    processOpponentMove(randomMove);
}

// =============================================================================
// 5. ENGINE DE REGRAS E CALCULOS
// =============================================================================

function calculateAllowedMoves(currentState, activeColor, specificPiece = null) {
    let moves = {}; 
    let maxCaptures = 0;

    for(let r=0; r<8; r++){
        for(let c=0; c<8; c++){
            const p = currentState[r][c];
            if(!p) continue;
            
            const isRedPiece = p.startsWith('R');
            const isMyPiece = (activeColor === 'red' && isRedPiece) || (activeColor === 'white' && !isRedPiece);
            if(!isMyPiece) continue;

            if(specificPiece && (r !== specificPiece.row || c !== specificPiece.col)) continue;

            const possible = getPieceMoves(currentState, r, c, p, activeColor);
            if(possible.length > 0) {
                possible.forEach(m => {
                    if(m.type === 'capture') {
                        m.chainLength = 1 + getMaxChain(currentState, m.to.row, m.to.col, m.capturedRow, m.capturedCol, p, activeColor);
                    } else { m.chainLength = 0; }
                    
                    if(m.chainLength > maxCaptures) maxCaptures = m.chainLength;
                    const key = `${r}-${c}`;
                    if(!moves[key]) moves[key] = [];
                    moves[key].push(m);
                });
            }
        }
    }

    let finalMoves = {};
    Object.keys(moves).forEach(key => {
        const validOptions = moves[key].filter(m => m.chainLength === maxCaptures);
        if(maxCaptures > 0) {
             if(validOptions.length > 0 && validOptions[0].type === 'capture') finalMoves[key] = validOptions;
        } else {
             if(validOptions.length > 0) finalMoves[key] = validOptions;
        }
    });
    return finalMoves;
}

function getMaxChain(board, r, c, ignoreR, ignoreC, pieceValue, activeColor) {
    const moves = getPieceMoves(board, r, c, pieceValue, activeColor);
    const captures = moves.filter(m => m.type === 'capture' && (m.capturedRow !== ignoreR || m.capturedCol !== ignoreC));
    return captures.length > 0 ? 1 : 0;
}

function getPieceMoves(board, r, c, piece, activeColor) {
    let moves = [];
    const isKing = piece.includes('K');
    const isRed = piece.startsWith('R');
    const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    directions.forEach(dir => {
        let dist = 1;
        while(true) {
            const tr = r + (dir[0] * dist);
            const tc = c + (dir[1] * dist);
            if(tr < 0 || tr > 7 || tc < 0 || tc > 7) break;
            const target = board[tr][tc];

            if(target === null) {
                if(!isKing) {
                    const moveDir = isRed ? 1 : -1;
                    if(dir[0] === moveDir && dist === 1) moves.push({to: {row: tr, col: tc}, type: 'simple'});
                } else { moves.push({to: {row: tr, col: tc}, type: 'simple'}); }
            } else {
                const isEnemy = (isRed && target.startsWith('W')) || (!isRed && target.startsWith('R'));
                if(isEnemy) {
                    let landDist = dist + 1;
                    while(true) {
                        const landR = r + (dir[0] * landDist);
                        const landC = c + (dir[1] * landDist);
                        if(landR < 0 || landR > 7 || landC < 0 || landC > 7) break;
                        if(board[landR][landC] !== null) break; 
                        moves.push({ to: {row: landR, col: landC}, type: 'capture', capturedRow: tr, capturedCol: tc });
                        if(!isKing) break; 
                        landDist++; 
                    }
                }
                break;
            }
            if(!isKing) break; 
            dist++;
        }
    });
    return moves;
}

// =============================================================================
// 6. RENDER E UTILS
// =============================================================================

function renderBoard() {
    if(!boardElement) return;
    boardElement.innerHTML = '';
    const captureRequired = hasAnyCaptureRequired();
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.dataset.row = row;
            square.dataset.col = col;

            if ((row + col) % 2 === 0) square.classList.add('white-square');
            else square.classList.add('black-square');

            const pieceValue = boardState[row][col];
            if (pieceValue) {
                const piece = document.createElement('div');
                piece.classList.add('piece');
                
                const isRed = pieceValue.startsWith('R');
                const amIRed = (myColor === 'red');
                const isMine = (amIRed && isRed) || (!amIRed && !isRed);

                if (isMine) {
                    piece.classList.add('my-piece');
                    const key = `${row}-${col}`;
                    if (isMyTurn && allowedMoves[key]) {
                        piece.classList.add('playable');
                        if (captureRequired && allowedMoves[key].some(m => m.type === 'capture')) {
                            piece.classList.add('must-capture');
                        }
                        piece.addEventListener('mousedown', (e) => startDrag(e, row, col, pieceValue));
                        piece.addEventListener('touchstart', (e) => startDrag(e, row, col, pieceValue), {passive: false});
                    } else if (isMyTurn) {
                        piece.style.opacity = '0.7'; 
                    }
                } else {
                    piece.classList.add('opp-piece');
                }

                if (pieceValue.includes('K')) piece.classList.add('king');
                square.appendChild(piece);
            }
            boardElement.appendChild(square);
        }
    }
}

// --- Drag & Drop ---
function getEventPos(e) {
    if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
}

function startDrag(e, row, col, pieceValue) {
    const key = `${row}-${col}`;
    if (!isMyTurn || !allowedMoves[key]) return;
    if(e.type === 'touchstart') e.preventDefault();

    isDragging = true;
    draggingOrigin = { row, col, value: pieceValue };
    highlightValidSquares(allowedMoves[key]);

    const originalPiece = e.target;
    draggedPiece = originalPiece.cloneNode(true);
    draggedPiece.classList.add('dragging');
    
    document.body.appendChild(draggedPiece);
    const pos = getEventPos(e);
    moveAt(pos.x, pos.y);
    originalPiece.style.opacity = '0'; 

    if (e.type === 'touchstart') {
        document.addEventListener('touchmove', onTouchMove, {passive: false});
        document.addEventListener('touchend', onTouchEnd);
    } else {
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}

function moveAt(x, y) {
    if(draggedPiece) {
        draggedPiece.style.left = (x - draggedPiece.offsetWidth / 2) + 'px';
        draggedPiece.style.top = (y - draggedPiece.offsetHeight / 2) + 'px';
    }
}
function onMouseMove(e) { moveAt(e.clientX, e.clientY); }
function onTouchMove(e) { e.preventDefault(); const pos = getEventPos(e); moveAt(pos.x, pos.y); }

function finishDrag(x, y) {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    
    document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
    if(draggedPiece) draggedPiece.style.display = 'none';
    let elemBelow = document.elementFromPoint(x, y);
    if(draggedPiece) draggedPiece.style.display = 'block'; 

    let squareBelow = elemBelow ? elemBelow.closest('.square') : null;
    let success = false;

    if (squareBelow && draggingOrigin) {
        const toRow = parseInt(squareBelow.dataset.row);
        const toCol = parseInt(squareBelow.dataset.col);
        const originKey = `${draggingOrigin.row}-${draggingOrigin.col}`;
        const validMoves = allowedMoves[originKey];
        if(validMoves) {
            const move = validMoves.find(m => m.to.row === toRow && m.to.col === toCol);
            if(move) {
                executeGameMove(draggingOrigin.row, draggingOrigin.col, move);
                success = true;
            }
        }
    }

    if(draggedPiece && draggedPiece.parentNode) document.body.removeChild(draggedPiece);
    draggedPiece = null;
    isDragging = false;
    draggingOrigin = null;

    if (!success) renderBoard();
}
function onMouseUp(e) { finishDrag(e.clientX, e.clientY); }
function onTouchEnd(e) { const touch = e.changedTouches[0]; finishDrag(touch.clientX, touch.clientY); }

function highlightValidSquares(moves) {
    moves.forEach(m => {
        const sq = document.querySelector(`.square[data-row='${m.to.row}'][data-col='${m.to.col}']`);
        if(sq) sq.classList.add('highlight');
    });
}

function hasAnyCaptureRequired() { return Object.values(allowedMoves).some(list => list.some(m => m.type === 'capture')); }

function updateTextStatus(msg, isHighlight) { 
    if(statusDiv) {
        statusDiv.textContent = msg; 
        statusDiv.style.color = isHighlight ? "#2ecc71" : "#fff"; 
    }
}

function checkNoPiecesGameOver() {
    let red=0, white=0;
    for (let r=0; r<8; r++) {
        for (let c=0; c<8; c++) {
            const p = boardState[r][c];
            if(p && p.startsWith('R')) red++;
            if(p && p.startsWith('W')) white++;
        }
    }
    if (red === 0 || white === 0) {
        const amIRed = (myColor === 'red');
        const myCount = amIRed ? red : white;
        
        let msg = "";
        let didWin = false;

        if (myCount === 0) {
            msg = "Você ficou sem peças.";
            didWin = false;
        } else {
            msg = "Oponente ficou sem peças.";
            didWin = true;
        }
        
        handleLocalGameOver(didWin, msg);
        return true;
    }
    return false;
}

function handleLocalGameOver(didWin, msg) {
    if(isSinglePlayer) {
        showGameOverModal(didWin, msg);
        isMyTurn = false;
    } else {
        const winnerColor = didWin ? myColor : (myColor==='red'?'white':'red');
        socket.emit('game_over', { room: currentRoom, winner: winnerColor, reason: msg });
    }
}

function showGameOverModal(didWin, reasonText = "") {
    modalTitle.textContent = didWin ? "VITÓRIA!" : "FIM DE JOGO";
    modalTitle.style.color = didWin ? "#2ecc71" : "#e74c3c";
    modalMessage.textContent = (didWin ? "Você venceu! " : "Você perdeu. ") + reasonText;
    
    if(didWin) playSound('win');
    else playSound('lose');

    gameOverModal.classList.remove('hidden');
}
function hideGameOverModal() { gameOverModal.classList.add('hidden'); }

// Eventos do Servidor (Fim de Jogo Online)
socket.on('opponent_left', () => {
    if(!isSinglePlayer) showGameOverModal(true, "Oponente saiu da sala.");
});

socket.on('game_over', (data) => {
    if(!isSinglePlayer) {
        if(data.winner === myColor) showGameOverModal(true, "Oponente sem peças/movimentos.");
        else showGameOverModal(false, "Você perdeu.");
        isMyTurn = false;
    }
});

socket.on('disconnect', () => {
    updateTextStatus("Conexão perdida...", false);
    if(statusDiv) statusDiv.style.color = "red";
});

// Extras
function toggleConfig() { document.getElementById('config-panel').classList.toggle('hidden'); }
function updatePieceColors() { renderBoard(); }