from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'segredo_damas_123'
socketio = SocketIO(app, cors_allowed_origins="*")

# Variável global para armazenar quem está esperando jogo
waiting_player = None

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    global waiting_player
    player_id = request.sid
    print(f'Cliente conectado: {player_id}')

    if waiting_player:
        # Se já tem alguém esperando, cria o jogo
        room_id = f"room-{waiting_player}-{player_id}"
        
        # Coloca o jogador atual na sala
        join_room(room_id)
        # Coloca o jogador que estava esperando na sala (precisamos do socket dele, 
        # mas como não temos objeto socket direto aqui como no node, 
        # o join_room funciona para o request atual. Para o waiting_player,
        # ele já deve ter entrado numa sala temporária ou gerenciamos via front.
        # Simplificação: O waiting_player entra na sala via evento no front ou aqui forçamos)
        
        # No Flask-SocketIO, adicionar um SID arbitrário a uma sala é mais complexo.
        # Vamos usar uma abordagem onde avisamos o waiting_player que ele achou partida.
        
        # Avisa o jogador ATUAL (que acabou de entrar)
        emit('init_game', {'color': 'red', 'room': room_id, 'turn': False}, room=player_id)
        
        # Avisa o jogador QUE ESTAVA ESPERANDO
        emit('init_game', {'color': 'white', 'room': room_id, 'turn': True}, room=waiting_player)
        
        # Faz o waiting_player entrar na sala lógica (via socketio server side)
        # Nota: join_room só funciona para o contexto atual do request por padrão.
        # Workaround: O front do waiting_player receberá o evento e pedirá para entrar na sala,
        # ou simplificamos enviando mensagens diretas para os SIDs.
        
        # Para este MVP, vamos manter simples: enviamos o ID da sala e ambos usam esse ID para falar.
        
        waiting_player = None
    else:
        waiting_player = player_id
        emit('waiting', 'Aguardando oponente...', room=player_id)

@socketio.on('join_specific_room')
def handle_join_room(data):
    # Evento auxiliar para garantir que ambos estejam na sala correta de socket
    room = data['room']
    join_room(room)

@socketio.on('make_move')
def handle_move(data):
    room = data['room']
    move = data['move']
    # Envia para todos na sala, exceto quem enviou (include_self=False)
    emit('opponent_move', move, room=room, include_self=False)

@socketio.on('disconnect')
def handle_disconnect():
    global waiting_player
    if waiting_player == request.sid:
        waiting_player = None
    print(f'Cliente desconectado: {request.sid}')

if __name__ == '__main__':
    socketio.run(app, debug=True)