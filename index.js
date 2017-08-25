const { Server: SocketServer } = require('uws');
const Events = require('events');
const uuid = require('uuid');

/*
 * uVyper core
 */
class Core extends Events {

    constructor() {
        super();
        this.rooms = new Set();
    }

    addRoom(room) {
        if(room instanceof Room === false) {
            throw new TypeError('Not a room Object');
        }
        if(this.rooms.has(room) === true) return;
        this.emit('new_room',room);
        this.rooms.add(room);
    }

    deleteRoom(room) {
        if(room instanceof Room === false) {
            throw new TypeError('Not a room Object');
        }
        if(this.rooms.has(room) === false) return;
        this.emit('delete_room',room);
        this.rooms.delete(room);
    }

}
const EventsObserver = new Core(); // Create EventsObserver instance

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
    broadcast(event,data = {},excludedIDs = []) {
        if('undefined' === typeof(event)) {
            throw new Error('Impossible to broadcast to an undefined event!');
        }
        let _O = {
            event,
            roomName: this.room,
            data
        };

        const excludeSet = new Set( excludedIDs.map( v => v instanceof SocketHandler ? v.id : v ) );
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

    constructor(roomName) {
        super();
        if('undefined' === typeof(roomName)) {
            throw new TypeError('Undefined roomName');
        }
        this.name = roomName;
        this.sockets = new SocketMap([],roomName);
        this.alive = true;
        EventsObserver.addRoom(this);
    }

    /*
     * Add a new socket to the room!
     */
    addSocket(socket) {
        if(this.alive === false) return;
        if(socket instanceof SocketHandler === false) {
            throw new TypeError('Invalid socket type');
        }
        if(this.sockets.has(socket.id) === true) return;
        socket.rooms.add(this);
        this.sockets.add(socket);
        this.emit('connection',socket);
    }

    /*
     * Delete a socket from the room!
     */
    deleteSocket(socket) {
        if(socket instanceof SocketHandler === false) {
            throw new TypeError('Invalid socket type');
        }
        if(this.sockets.has(socket.id) === false) return;
        
        socket.rooms.delete(this);
        this.sockets.delete(socket.id);
        this.emit('disconnect',socket);
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
        EventsObserver.deleteRoom(this);
    }

}

/*
 * UWS SocketHandler Proxy class
 */
class SocketHandler extends Events {

    constructor(uWebSocket) {
        super();
        if('undefined' === typeof(uWebSocket)) {
            throw new Error('Undefined uWS socket!');
        }

        this.ws = uWebSocket;
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
     * Send a new socket message!
     */
    send(event,data = {}) {
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
        EventsObserver.emit('send',_O);
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
        if('undefined' === typeof(room)) {
            throw new TypeError('Cannot join an undefined room!');
        }
        if('string' === typeof(room)) {
            if(EventsObserver.rooms.has(room) === false) {
                throw new TypeError(room+' room doesn\'t exist! ');
            }
            room = EventsObserver.rooms.get(room);
        }
        else if(room instanceof Room === false) {
            throw new TypeError('Invalid room!');
        }
        room.addSocket(this);
    }

    /*
     * leave(Room room)
     * leave a room where the current socket is eventually connected.
     */
    leave(room) {
        if('undefined' === typeof(room)) {
            throw new TypeError('Cannot leave an undefined room!');
        }
        if('string' === typeof(room)) {
            if(EventsObserver.rooms.has(room) === false) {
                throw new TypeError(room+' room doesn\'t exist! ');
            }
            room = EventsObserver.rooms.get(room);
        }
        else if(room instanceof Room === false) {
            throw new TypeError('Invalid room!');
        }
        room.deleteSocket(this);
    }

}

// Server constructor Interface
const IServerConstructor = {
    port: 3000
};

/* 
 * UWS Server interface
 */
class Server extends Events {

    constructor(options = {}) {
        super();
        options = Object.assign(options,{},IServerConstructor);
        this.id = uuid.v4();
        this.sockets = new SocketMap();
        this.wss = new SocketServer({ port: options.port });
        this.wss.on('connection', (ws) => {
            let socket = new SocketHandler(ws);
            this.sockets.add(socket);
            this.emit('connection',socket);

            socket.on('close', () => {
                this.sockets.delete(socket.id);
                this.emit('disconnect',socket);
                socket = undefined;
            });

            ws.on('close',() => {
                socket.close();
            });
        });

        this.wss.on('error',(err) => {
            this.emit('error',err);
        });
        EventsObserver.emit('server_connected',this.id);
    }

}
Server.EventsObserver = EventsObserver;

// Export class!
module.exports = {
    Server,
    Room
};