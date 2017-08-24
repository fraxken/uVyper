const WebSocketServer = require('uws').Server;
const Events = require('events');

/*
 * Generate UUID for every socket!
 */
function guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

/*
 * UWS Room
 */
class Room extends Events {

    constructor(name) {
        super();
        this.name = name;
        this.sockets = new Map();
        Room.rooms.add(this);
    }

    broadcast(event,data = {}) {
        if('undefined' === typeof(event)) {
            throw new Error('Impossible to broadcast an undefined event!');
        }
        let _O = {
            event,
            roomName: this.name,
            data
        }; 
        _O = JSON.stringify(_O);
        for(let [,socket] of this.sockets) {
            socket.ws.send(_O);
        }
    }

    has(id) {
        return this.sockets.has(id);
    }

    addSocket(client) {
        if(client instanceof SocketHandler === false) {
            throw new TypeError('Invalid client');
        }
        if(this.sockets.has(client.id) === true) {
            return;
        }
        this.emit('connection',client);
        client.rooms.add(this);
        this.sockets.set(client.id,client);
    }

    deleteSocket(client) {
        if(client instanceof SocketHandler === false) {
            throw new TypeError('Invalid client');
        }
        if(this.sockets.has(client.id) === false) {
            console.log('client not connected!');
            return;
        }
        this.emit('disconnect',client);
        client.rooms.delete(this);
        this.sockets.delete(client.id);
    }

}
Room.rooms = new Set();

/*
 * UWS Socket proxy class
 */
class SocketHandler extends Events {

    constructor(ws) {
        super();
        this.ws = ws;
        this.id = guid();
        this.rooms = new Set();
        this.ws.on('message',(buf) => {
            try {
                var jsonMessage = JSON.parse(buf.toString());
            }
            catch(E) {
                console.error(E);
                return;
            }

            const { event, data = {}, roomName } = jsonMessage;
            if('undefined' === typeof(event)) {
                return;
            }

            if('undefined' === typeof(roomName)) {
                this.emit(event,data);
            }
            else {
                if(this.rooms.has(roomName)) {
                    data.from = this.id;
                    this.rooms.get(roomName).emit(event,data);
                }
            }
        });
    }

    join(room) {
        if(room instanceof Room === false) {
            throw new TypeError('Invalid room!');
        }
        room.addSocket(this);
    }

    leave(room) {
        if(room instanceof Room === false) {
            throw new TypeError('Invalid room!');
        }
        room.deleteSocket(this);
    }

}

/* 
 * FastSocket UWS Server interface
 */
class Server extends Events {

    constructor({port = 3000}) {
        super();
        this.wss = new WebSocketServer({ port });
        this.sockets = new Map();
        this.wss.on('connection', (ws) => {
            const Client = new SocketHandler(ws);
            this.sockets.set(Client.id,Client);
            this.emit('connection',Client);

            ws.on('close',() => {
                Client.emit('close');
                this.emit('disconnect',Client);
                this.removeSocket(Client);
            });
        });
    }
    
    getSocket(id) {
        if('undefined' === typeof(id)) {
            throw new Error('Undefined id');
        }
        return this.sockets.get(id);
    }

    broadcast(event,data = {}) {
        if('undefined' === typeof(event)) {
            throw new Error('Impossible to broadcast an undefined event!');
        }
        let _O = {
            event,
            data
        }; 
        _O = JSON.stringify(_O);
        for(let [,socket] of this.sockets) {
            socket.ws.send(_O);
        }
    }

    removeSocket(Client) {
        if(Client.rooms.size > 0) {
            for(let room of Client.rooms) {
                room.deleteSocket(Client);
            }
        }
        this.sockets.delete(Client.id);
    }

}

module.exports = {Server,Room};