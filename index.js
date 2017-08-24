const { Server: WebSocketServer } = require('uws');
const Events = require('events');
const uuid = require('uuid');

/*
 * SocketMap with broadcast events...
 */
class SocketMap extends Map {
    
    constructor(_o,roomName) {
        super(_o);
        this.room = roomName || void 0;
    }

    /*
     * Return a array of socketsHandler!
     */
    toArray() {
        const ret = [];
        for(let [,socketHandler] of this) {
            ret.push(socketHandler);
        }
        return ret;
    }

    /*
     * Return a array of all sockets ids!
     */
    idsArray() {
        const ret = [];
        for(let [id,] of this) {
            ret.push(id);
        }
        return ret;
    }

    /*
     * add a new socket to the collection (safe way).
     */
    add(socket) {
        if(socket instanceof SocketHandler === false) {
            throw new TypeError('Not a SocketHandler type!');
        }
        this.set(socket.id,socket);
    }

    /*
     * Broadcast event to all sockets!
     */
    broadcast(event,data = {},exclude = []) {
        if('undefined' === typeof(event)) {
            throw new Error('Impossible to broadcast to an undefined event!');
        }
        let _O = {
            event,
            roomName: this.room,
            data
        }; 

        const excludeSet = new Set(exclude);
        try {
            _O = JSON.stringify(_O);
            for(let [id,socket] of this) {
                if(excludeSet.has(id)) {
                    continue;
                }
                socket.ws.send(_O);
            }
        }
        catch(E) {
            throw E;
        }
    }

}

/*
 * UWS Room
 */
class Room extends Events {

    constructor(name) {
        super();
        this.name = name;
        this.sockets = new SocketMap([],name);
        this.alive = true;
        Room.rooms.add(this);
    }

    /*
     * Add a new socket to the room!
     */
    addSocket(client) {
        if(this.alive === false) return;
        if(client instanceof SocketHandler === false) {
            throw new TypeError('Invalid client type');
        }
        if(this.sockets.has(client.id) === true) return;
        client.rooms.add(this);
        this.sockets.add(client);
        this.emit('connection',client);
    }

    /*
     * Delete a socket from the room!
     */
    deleteSocket(client) {
        if(client instanceof SocketHandler === false) {
            throw new TypeError('Invalid client type');
        }
        if(this.sockets.has(client.id) === false) return;
        
        client.rooms.delete(this);
        this.sockets.delete(client.id);
        this.emit('disconnect',client);
    }

    /*
     * Disconnect all sockets
     */
    disconnectAll() {
        for(let [,socket] of this.sockets) {
            this.deleteSocket(socket);
        }
    }

    /*
     * Destroy the room! (You should put the room to undefined in your code too!)
     */
    destroy() {
        this.alive = false;
        this.disconnectAll();
        Room.rooms.delete(this);
    }

}
Room.rooms = new Set();

/*
 * UWS SocketHandler Proxy class
 */
class SocketHandler extends Events {

    constructor(ws) {
        super();
        this.ws = ws;
        this.id = uuid.v1();
        this.rooms = new Set();

        /* 
         * Handle raw message to transform into structured message!
         */
        this.ws.on('message',(buf) => {
            try {
                var jsonMessage = JSON.parse(buf.toString());
            }
            catch(E) {
                // Emit raw message!
                this.emit('message',buf);
                return;
            }

            const { event, data = {}, roomName } = jsonMessage;
            if('undefined' === typeof(event)) {
                return;
            }

            if('undefined' === typeof(roomName)) {
                this.emit(event,data);
            }
            else if(this.rooms.has(roomName)){
                data.from = this.id;
                this.rooms.get(roomName).broadcast(event,data,[this.id]);
            }
        });
    }

    /* 
     * Await an event with a timeout fallback!
     */
    get(eventName,msTimeOut = 5000) {
        return new Promise( (resolve,reject) => {
            const timer = setTimeout(() => {
                reject();
            },msTimeOut);
            this.once(eventName,function(data) {
                clearTimeout(timer);
                resolve(data || {});
            });
        });
    }

    /* 
     * close()
     * Close all connexions.
     */
    close() {
        this.emit('close');
        if(this.rooms.size > 0) {
            for(let room of this.rooms) {
                room.deleteSocket(this);
            }
        }
    }

    /*
     * Send a new structured data!
     */
    send(event,data) {
        let _O = {
            event,
            data
        }; 

        try {
            _O = JSON.stringify(_O);
        }
        catch(E) {
            return;
        }
        this.ws.send(_O);
    }

    /*
     * Send a new raw data (buffer).
     */
    sendRaw(buf) {
        this.ws.send(buf);
    }

    /*
     * join(Room room)
     * join a new room with the current socket
     */
    join(room) {
        if(room instanceof Room === false) {
            throw new TypeError('Invalid room!');
        }
        room.addSocket(this);
    }

    /*
     * leave(Room room)
     * leave a room where the current socket is eventually connected.
     */
    leave(room) {
        if(room instanceof Room === false) {
            throw new TypeError('Invalid room!');
        }
        room.deleteSocket(this);
    }

}

/* 
 * UWS Server interface
 */
class Server extends Events {

    constructor({port = 3000}) {
        super({ port });
        this.sockets = new SocketMap();
        this.wss = new WebSocketServer({port});
        this.wss.on('connection', (ws) => {
            let socket = new SocketHandler(ws);
            this.sockets.add(socket);
            this.emit('connection',socket);

            ws.on('close',() => {
                socket.close();
                this.sockets.delete(socket.id);
                this.emit('disconnect',socket);
                socket = undefined;
            });
        });
    }

}

// Export class!
module.exports = {Server,Room};