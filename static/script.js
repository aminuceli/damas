// =============================================================================
// 1. CONFIGURAÇÃO DE CONEXÃO E VARIAVEIS GLOBAIS
// =============================================================================
const socket = io({
    // Correção para estabilidade: Força WebSocket para evitar desconexões
    transports: ['websocket', 'polling'], 
    reconnection: true,
    reconnectionAttempts: 5
});

// -- Telas e Paineis (Lobby vs Jogo) --
const lobbyScreen = document.getElementById('lobby-screen');
const waitingScreen = document.getElementById('waiting-screen');
const gameScreen = document.getElementById('game-screen');
const lobbyStatus = document.getElementById('lobby-status');
const roomCodeDisplay = document.getElementById('display-room-code');

// A CORREÇÃO PRINCIPAL ESTAVA AQUI:
// Faltava definir onde a lista de salas deve aparecer
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

// -- Regras e Engine --
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
// 2. LÓGICA DO LOBBY (CRIAR / ENTRAR SALA)
// =============================================================================

socket.on('connect', () => {
    console.log("Conectado!");
    if(lobbyStatus) lobbyStatus.innerText = "Conectado ao servidor.";
});

// Funções chamadas pelos botões do HTML
function createRoom() {
    socket.emit('create_room');
}

function joinRoom(roomCode) {
    // Envia o código da sala ao clicar no botão "JOGAR" da lista
    socket.emit('join_game', { room_code: roomCode });
}

// Resposta: Atualizar Lista de Salas (Recebido do servidor)
socket.on('update_room_list', (rooms) => {
    // Agora a variável roomsContainer existe, então o código funciona
    if(roomsContainer) {
        roomsContainer.innerHTML = ''; // Limpa a lista atual para recriar

        if (rooms.length === 0) {
            roomsContainer.innerHTML = '<p style="opacity: 0.5; margin-top:10px;">Nenhuma sala disponível.<br>Crie uma!</p>';
            return;
        }

        // Cria um botão para cada sala disponível na lista
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

// Quando eu crio a sala, vou para a tela de espera
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
    console.log("JOGO INICIADO:", data);
    
    // UI: Esconde Lobby/Espera e mostra o tabuleiro
    if(lobbyScreen) lobbyScreen.classList.add('hidden');
    if(waitingScreen) waitingScreen.classList.add('hidden');
    if(gameScreen) gameScreen.classList.remove('hidden');
    hideGameOverModal();

    // Setup Lógico
    boardState = JSON.parse(JSON.stringify(initialBoard));
    myColor = data.color;
    currentRoom = data.room;
    isMyTurn = data.turn;

    // Atualiza cores visuais (se o config panel existir)
    const myInput = document.getElementById('myPieceColor');
    const oppInput = document.getElementById('oppPieceColor');
    if(myInput && oppInput) {
        myInput.value = (myColor === 'red') ? '#c0392b' : '#ecf0f1';
        oppInput.value = (myColor === 'red') ? '#ecf0f1' : '#c0392b';
        if(typeof updatePieceColors === 'function') updatePieceColors(); 
    }

    if(isMyTurn) {
        updateTextStatus("SUA VEZ", true);
        allowedMoves = calculateAllowedMoves(boardState);
        if (hasAnyCaptureRequired()) updateTextStatus('SUA VEZ (CAPTURA OBRIGATÓRIA!)', true);
    } else {
        updateTextStatus("VEZ DO OPONENTE", false);
        allowedMoves = {};
    }
    
    renderBoard();
});

// Recebe Jogada do Oponente
socket.on('opponent_move', (data) => {
    const move = data.move || data; 
    
    // 1. Aplica no tabuleiro local
    const piece = boardState[move.from.row][move.from.col];
    boardState[move.from.row][move.from.col] = null;
    boardState[move.to.row][move.to.col] = piece;

    // 2. Captura
    if(move.type === 'capture') {
         const dirR = move.to.row > move.from.row ? 1 : -1;
         const dirC = move.to.col > move.from.col ? 1 : -1;
         let r = move.from.row + dirR;
         let c = move.from.col + dirC;
         
         while(r !== move.to.row && c !== move.to.col) {
             if(boardState[r][c] !== null) boardState[r][c] = null;
             r += dirR; 
             c += dirC;
             if(r < 0 || r > 7 || c < 0 || c > 7) break;
         }
    }

    // 3. Promoção
    if (move.promoted) {
        const opponentKing = (myColor === 'red') ? 'WK' : 'RK';
        boardState[move.to.row][move.to.col] = opponentKing;
    }

    // 4. Verifica Fim
    if (checkNoPiecesGameOver()) return;

    // 5. Turno
    if (move.keepTurn) {
        updateTextStatus("OPONENTE EM COMBO...", false);
        isMyTurn = false;
    } else {
        isMyTurn = true;
        mustCaptureWith = null;
        updateTextStatus("SUA VEZ", true);
        
        allowedMoves = calculateAllowedMoves(boardState);
        
        if(Object.keys(allowedMoves).length === 0) {
            socket.emit('game_over', { room: currentRoom, winner: opponentColor(myColor), reason: 'Sem movimentos.' });
            showGameOverModal(false, "Você ficou sem movimentos.");
        } else {
             if (hasAnyCaptureRequired()) updateTextStatus('SUA VEZ (CAPTURA OBRIGATÓRIA!)', true);
        }
    }
    renderBoard();
});

// Eventos de Fim de Jogo e Saída
socket.on('opponent_left', (data) => {
    showGameOverModal(true, "Oponente saiu da sala.");
});

socket.on('game_over', (data) => {
    if(data.winner === myColor) showGameOverModal(true, "Oponente sem peças/movimentos.");
    else showGameOverModal(false, "Você perdeu.");
    isMyTurn = false;
});

socket.on('disconnect', () => {
    // Apenas avisa, não recarrega (evita loop)
    updateTextStatus("Conexão perdida...", false);
    if(statusDiv) statusDiv.style.color = "red";
});


// =============================================================================
// 4. ENGINE DE REGRAS E RENDERIZAÇÃO
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

// --- Execução ---
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

    let nextMoves = calculateAllowedMoves(boardState, {row: moveData.to.row, col: moveData.to.col});
    let hasCombo = false;
    const nextKey = `${moveData.to.row}-${moveData.to.col}`;
    
    if(moveData.type === 'capture' && nextMoves[nextKey] && nextMoves[nextKey].some(m => m.type === 'capture')) {
        hasCombo = true;
    }

    let promoted = false;
    const isKingAlready = piece.includes('K');
    const promotionRow = (myColor === 'red') ? 7 : 0;
    if (!isKingAlready && moveData.to.row === promotionRow && !hasCombo) {
        const kingVal = (myColor === 'red') ? 'RK' : 'WK';
        boardState[moveData.to.row][moveData.to.col] = kingVal;
        promoted = true;
    }

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

    if (hasCombo) {
        mustCaptureWith = { row: moveData.to.row, col: moveData.to.col };
        allowedMoves = nextMoves; 
        updateTextStatus("COMBO! Jogue novamente.", true);
    } else {
        isMyTurn = false;
        mustCaptureWith = null;
        allowedMoves = {};
        updateTextStatus("AGUARDANDO OPONENTE...", false);
    }
    if (checkNoPiecesGameOver()) return;
    renderBoard();
}

// --- Cálculos de Regras ---
function calculateAllowedMoves(currentState, specificPiece = null) {
    let moves = {}; 
    let maxCaptures = 0;

    for(let r=0; r<8; r++){
        for(let c=0; c<8; c++){
            const p = currentState[r][c];
            if(!p || !isMyPiece(p)) continue;
            if(specificPiece && (r !== specificPiece.row || c !== specificPiece.col)) continue;

            const possible = getPieceMoves(currentState, r, c, p);
            if(possible.length > 0) {
                possible.forEach(m => {
                    if(m.type === 'capture') {
                        m.chainLength = 1 + getMaxChain(currentState, m.to.row, m.to.col, m.capturedRow, m.capturedCol, p);
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

function getMaxChain(board, r, c, ignoreR, ignoreC, pieceValue) {
    const moves = getPieceMoves(board, r, c, pieceValue);
    const captures = moves.filter(m => m.type === 'capture' && (m.capturedRow !== ignoreR || m.capturedCol !== ignoreC));
    return captures.length > 0 ? 1 : 0;
}

function getPieceMoves(board, r, c, piece) {
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

// --- Utils ---
function opponentColor(color) { return color === 'red' ? 'white' : 'red'; }
function hasAnyCaptureRequired() { return Object.values(allowedMoves).some(list => list.some(m => m.type === 'capture')); }
function isMyPiece(p) { if (!p) return false; const isRed = p.startsWith('R'); return (myColor === 'red' && isRed) || (myColor === 'white' && !isRed); }
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
        if (myCount === 0) showGameOverModal(false, "Você ficou sem peças.");
        else showGameOverModal(true, "Oponente ficou sem peças.");
        isMyTurn = false;
        return true;
    }
    return false;
}

// --- Modal ---
function showGameOverModal(didWin, reasonText = "") {
    modalTitle.textContent = didWin ? "VITÓRIA!" : "FIM DE JOGO";
    modalTitle.style.color = didWin ? "#2ecc71" : "#e74c3c";
    modalMessage.textContent = (didWin ? "Você venceu! " : "Você perdeu. ") + reasonText;
    gameOverModal.classList.remove('hidden');
}
function hideGameOverModal() { gameOverModal.classList.add('hidden'); }
function restartGame() { window.location.reload(); }
function exitGame() { window.location.reload(); }

// --- Funções de Config (Extras) ---
function toggleConfig() { document.getElementById('config-panel').classList.toggle('hidden'); }
function updatePieceColors() { renderBoard(); }