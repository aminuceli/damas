from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room

# Configuração padrão
app = Flask(__name__)
app.config['SECRET_KEY'] = 'segredo_damas_123'
socketio = SocketIO(app, cors_allowed_origins="*")

# Armazena quem está esperando para jogar
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
        # Se já tem alguém esperando, cria a sala
        room_id = f"room-{waiting_player}-{player_id}"
        join_room(room_id)
        
        # Avisa o Jogador 2 (que acabou de entrar) -> Ele será Vermelho
        emit('init_game', {'color': 'red', 'room': room_id, 'turn': False}, room=player_id)
        
        # Avisa o Jogador 1 (que estava esperando) -> Ele será Branco
        emit('init_game', {'color': 'white', 'room': room_id, 'turn': True}, room=waiting_player)
        
        print(f"Partida iniciada na sala: {room_id}")
        waiting_player = None
    else:
        # Se não tem ninguém, coloca este jogador na espera
        waiting_player = player_id
        emit('waiting', 'Aguardando oponente...', room=player_id)

@socketio.on('join_specific_room')
def handle_join_room(data):
    join_room(data['room'])

@socketio.on('make_move')
def handle_move(data):
    room = data['room']
    # Repassa o movimento para o adversário (include_self=False)
    emit('opponent_move', data, room=room, include_self=False)

@socketio.on('disconnect')
def handle_disconnect():
    global waiting_player
    if waiting_player == request.sid:
        waiting_player = None
    print(f'Cliente desconectado: {request.sid}')

if __name__ == '__main__':
    # Rodando no modo simples para evitar erros de firewall
    socketio.run(app, debug=True)