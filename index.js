// Require dependencies & npm packages!
const { Server: SocketServer } = require('uws');
const events = require('events');
const https = require('https');
const uuid = require('uuid');

/*
 * uVyper core. Native implementation to catch all events for the Redis support!
 * @class Core
 * @extended Events
 * 
 * @param {Map} rooms
 */
class Controller extends events {

    /*
     * @constructor
     */
    constructor() {
        super();
        this.rooms = new Map();
    }

    /*
     * add a new Room
     * @function Core.addRoom
     * @param {Room} room
     * @return void 0
     */
    addRoom(room) {
        if(room instanceof Room === false) {
            throw new TypeError('Not a room Object');
        }
        if(this.rooms.has(room.name) === true) return;
        this.emit('new_room',room);
        this.rooms.set(room.name,room);
    }

    /*
     * delete a Room (that you joined before)
     * @function Core.deleteRoom
     * @param {Room} room
     * @return void 0
     */
    deleteRoom(room) {
        if(room instanceof Room === false) {
            throw new TypeError('Not a room Object');
        }
        if(this.rooms.has(room.name) === false) return;
        this.emit('delete_room',room);
        this.rooms.delete(room.name);
    }

}
const EventsObserver = new Controller(); // Create EventsObserver instance

/*
 * SocketsPools collection that allow user to broadcast events.
 * @class SocketsPools
 * @extended Map
 * 
 * @property {String} room
 */
class SocketsPools extends Map {
    
    /*
     * @constructor 
     * @param {Array} DefaultMapValue
     * @param {String} roomName
     */
    constructor(DefaultMapValue,roomName) {
        super(DefaultMapValue);
        if('string' === typeof(roomName)) {
            this.room = roomName;
        }
    }

    /*
     * Return a array of socketsHandler!
     * @function SocketsPools.toArray
     * @return Socket[]
     */
    toArray() {
        const ret = [];
        for(let [,socket] of this) {
            ret.push(socket);
        }
        return ret;
    }

    /*
     * Return a array of all sockets ids!
     * @function SocketsPools.idsArray
     * @return String[]
     */
    idsArray() {
        const ret = [];
        for(let [id,] of this) {
            ret.push(id);
        }
        return ret;
    }

    /*
     * Add a new socket to the collection (safe way).
     * @function SocketsPools.add
     * @param {Socket} socket
     */
    add(socket) {
        if(socket instanceof Socket === false) {
            throw new TypeError('Not a SocketHandler type!');
        }
        this.set(socket.id,socket);
    }

    /*
     * Broadcast an event to all sockets stored in the collection.
     * @function SocketsPools.broadcast
     * @param {String} eventName
     * @param {Object} data
     * @param {Array} excludedIDs
     * @return void 0
     */
    broadcast(eventName,data = {},excludedIDs = []) {
        if('undefined' === typeof(eventName)) {
            throw new Error('Impossible to broadcast to an undefined event!');
        }
        let _O = {
            event: eventName,
            roomName: this.room,
            data
        };

        const excludeSet = new Set( excludedIDs.map( v => v instanceof Socket ? v.id : v ) );
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
 * µVyper Room
 * @class Room
 * @extended events
 * 
 * @property {String} name
 * @property {SocketsPools} sockets
 * @property {Boolean} _alive
 * 
 * @event 'connection' {
 *     @param {Socket} socket
 * }
 * 
 * @event 'disconnect' {
 *     @param {Socket} socket
 * }
 */
class Room extends events {

    /*
     * @constructor
     * @param {String} roomName
     */
    constructor(roomName) {
        super();
        if('undefined' === typeof(roomName)) {
            throw new TypeError('Undefined roomName');
        }
        this.name = roomName;
        this.sockets = new SocketsPools([],roomName);
        this._alive = true;
        EventsObserver.addRoom(this);
    }

    /*
     * Add a new socket to the room!
     * @function Room.addSocket
     * @param {Socket} socket
     * @return void 0
     */
    addSocket(socket) {
        if(this._alive === false) return; // Verify if the room is alive!
        if(socket instanceof Socket === false) {
            throw new TypeError('Invalid socket type');
        }
        if(this.sockets.has(socket.id) === true) return;
        socket.rooms.add(this);
        this.sockets.add(socket);
        this.emit('connection',socket);
    }

    /*
     * Delete a socket from the room!
     * @function Room.deleteSocket
     * @param {Socket} socket
     * @return void 0
     */
    deleteSocket(socket) {
        if(socket instanceof Socket === false) {
            throw new TypeError('Invalid socket type');
        }
        if(this.sockets.has(socket.id) === false) return;
        socket.rooms.delete(this);
        this.sockets.delete(socket.id);
        this.emit('disconnect',socket);
    }

    /*
     * Disconnect all sockets connected to the Room.
     * @function Room.disconnectAll()
     * @return void 0
     */
    disconnectAll() {
        for(let [,socket] of this.sockets) {
            this.deleteSocket(socket);
        }
    }

    /*
     * Destroy the whole room (the method will call disconnectAll() method and put alive property to false).
     * @function Room.destroy 
     * @return void 0
     */
    destroy() {
        this._alive = false;
        this.disconnectAll();
        EventsObserver.deleteRoom(this);
    }

}

/* 
 * µWebSockets Socket Proxy
 * @class Socket
 * @extended events
 * 
 * @property {String} id
 * @property {Set} rooms
 * @property {uSocket} ws
 * 
 * @event 'message' {
 *     @param {String} buffer
 * }
 * 
 * @event 'close' {}
 */
class Socket extends events {

    /*
     * @constructor 
     * @param {uSocket} uSocket
     */
    constructor(uSocket) {
        super();
        if('undefined' === typeof(uSocket)) {
            throw new Error('Undefined uWS socket!');
        }

        this.ws = uSocket;
        this.id = uuid.v1();
        this.rooms = new Set();

        /* 
         * Handle raw message from original uSocket to transform it into structured message!
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

            // TODO: Review broadcast!
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
     * Await an event with a timeout catch!
     * @function Socket.get 
     * @param {String} eventName
     * @param {Number} msTimeOut (default to 5000 ms)
     * @return Promise<Any>
     */
    get(eventName,msTimeOut = Socket.DEFAULT_GET_TIMEOUT) {
        if('string' !== typeof(eventName)) {
            throw new TypeError('Invalid eventName type, should be a string!');
        }
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
     * Close the socket.
     * @function Socket.close
     * @return void 0
     */
    close() {
        this.emit('close');
        for(let room of this.rooms) {
            room.deleteSocket(this);
        }
    }

    /*
     * Send a new structured JSON socket message!
     * @function Socket.send
     * @param {String} eventName
     * @param {Object|Void 0} data
     * @return void 0
     */
    send(eventName,data = {}) {
        let _O = {
            event: eventName,
            data
        }; 
    
        try {
            _O = JSON.stringify(_O);
        }
        catch(E) {
            throw E;
        }
        EventsObserver.emit('send',_O);
        this.ws.send(_O);
    }
    

    /*
     * Send a new raw data (buffer). It's like sending an original uWebSocket message!
     * @function Socket.sendRaw
     * @param {Buffer|String} buffer
     * @return void 0
     */
    sendRaw(buffer) {
        this.ws.send(buffer);
    }

    /*
     * join a new room
     * @function Socket.join
     * @param {Room|String} room
     * @return void 0
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
     * leave a room where the current socket is eventually connected.
     * @function Socket.join
     * @param {Room|String} room
     * @return void 0
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
// Default timeout in milliseconds of Socket.get method!
Socket.DEFAULT_GET_TIMEOUT = 5000;

/*
 * Interface for Server class constructor method.
 * 
 * @interface IServerConstructor
 * @param {Number} port
 * @param {Boolean} ssl
 * @param {String} key
 * @param {String} cert
 */
const IServerConstructor = {
    port: 3000,
    ssl: false
};

/* 
 * µWebSockets Server interface
 * @class Server
 * 
 * @property {String} id
 * @property {SocketsPools} sockets
 * @property {uws.Server} wss
 * @property {Boolean} ssl
 * @property {Https.Server} httpsServer
 * 
 * @event 'connection' {
 *     @param {Socket} socket
 * }
 * 
 * @event 'disconnect' {
 *     @param {Socket} socket
 * }
 * 
 * @event 'error' {
 *     @param {ErrorMessage} error
 * }
 */
class Server extends events {

    /*
     * @constructor 
     * @param {IServerConstructor} options
     */
    constructor(options = {}) {
        super();
        options = Object.assign(options,{},IServerConstructor);
        this.id = uuid.v4();
        this.sockets = new SocketsPools();
        this.ssl = options.ssl;
        if(this.ssl === true) {
            if('undefined' === typeof(options.key) || 'undefined' === typeof(options.cert)) {
                throw new TypeError('Please define a key and cert for SSL');
            }
            this.httpsServer = https.createServer({key: options.key,cert: options.cert}, function(request,response) {
                response.end();
            }).listen(443);
            this.wss = new SocketServer({ port: 443, server: this.httpsServer });
        }
        else {
            this.wss = new SocketServer({ port: options.port });
        }
        this.wss.on('connection', (ws) => {
            let socket = new Socket(ws);
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

        this.wss.on('error',(error) => {
            this.emit('error',error);
        });

        // When the uWebSocket server is listening!
        this.wss.on('listening',function() {
            EventsObserver.emit('server_connected',this.id);
        });
    }

    /*
     * Listen on a port for the https server 
     * @function Server.listen
     * @param {Number} port
     * @return void 0
     */
    listen(port) {
        if(this.ssl === false) return;
        if('number' !== typeof(port)) {
            throw new TypeError('Invalid type for port argument');
        }
        this.httpsServer.listen(port);
    }

}
// Attach EventsObserver Object to Server!
Server.EventsObserver = EventsObserver;

/*
 * Export all core class!
 */
module.exports = {
    Server,
    Socket,
    SocketsPools,
    Room
};