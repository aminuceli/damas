from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, close_room
import random
import string

app = Flask(__name__)
app.config['SECRET_KEY'] = 'damas_lobby_secret'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode=None)

# Estrutura: { 'ABCD': { 'p1': 'id...', 'p2': None } }
rooms = {}

def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))

# Função auxiliar para enviar a lista de salas para TODOS
def broadcast_room_list():
    # Filtra apenas salas que tem vaga (p2 é None)
    available_rooms = [code for code, data in rooms.items() if data['p2'] is None]
    # Envia para todos os conectados ('broadcast=True')
    emit('update_room_list', available_rooms, broadcast=True)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    print(f'Cliente conectado: {request.sid}')
    # Assim que conecta, o cliente recebe a lista atual
    available_rooms = [code for code, data in rooms.items() if data['p2'] is None]
    emit('update_room_list', available_rooms)

# --- CRIAR SALA ---
@socketio.on('create_room')
def handle_create_room():
    room_code = generate_room_code()
    while room_code in rooms: 
        room_code = generate_room_code()

    rooms[room_code] = {
        'p1': request.sid,
        'p2': None
    }
    join_room(room_code)
    
    emit('room_created', {'room': room_code, 'color': 'white'})
    print(f"Sala criada: {room_code}")
    
    # Atualiza a lista para todo mundo (uma nova sala apareceu)
    broadcast_room_list()

# --- ENTRAR EM SALA (Via Clique na Lista) ---
@socketio.on('join_game')
def handle_join_room(data):
    room_code = data.get('room_code')
    
    if room_code not in rooms:
        emit('error_msg', 'Sala não existe mais.')
        broadcast_room_list() # Atualiza lista para remover sala fantasma
        return
    
    room = rooms[room_code]
    
    if room['p2'] is not None:
        emit('error_msg', 'Sala cheia.')
        return

    room['p2'] = request.sid
    join_room(room_code)
    
    # Inicia o jogo
    emit('init_game', {'room': room_code, 'color': 'white', 'turn': True}, room=room['p1'])
    emit('init_game', {'room': room_code, 'color': 'red', 'turn': False}, room=room['p2'])
    
    # Atualiza a lista (a sala encheu, então deve sumir da lista)
    broadcast_room_list()

# --- MOVIMENTOS ---
@socketio.on('make_move')
def handle_move(data):
    room = data.get('room')
    if room in rooms:
        emit('opponent_move', data, room=room, include_self=False)

@socketio.on('game_over')
def handle_game_over(data):
    room = data.get('room')
    emit('game_over', data, room=room)

# --- DESCONEXÃO ---
@socketio.on('disconnect')
def handle_disconnect():
    player_id = request.sid
    room_to_close = None
    
    for code, data in list(rooms.items()):
        if data['p1'] == player_id or data['p2'] == player_id:
            room_to_close = code
            break
    
    if room_to_close:
        emit('opponent_left', {'message': 'Oponente desconectou.'}, room=room_to_close)
        del rooms[room_to_close]
        # Se uma sala for fechada, atualiza a lista para todos
        broadcast_room_list()

if __name__ == '__main__':
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)