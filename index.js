// Require dependencies & npm packages!
const uws = require('uws');
const events = require('events');
const https = require('https');
const uuid = require('uuid');

/*
 * uVyper Controller. Native implementation to catch all events for the Redis support!
 * @class Controller
 * @extended events
 * 
 * @property {Map} rooms
 * @property {Array} socketsServer
 */
class Controller extends events {

    /*
     * @constructor
     */
    constructor() {
        super();
        this.rooms = new Map();
        this.socketsServer = [];
    }

    /*
     * Get a socketServer with the array position
     * @function Controller.getServer
     * @param {Number} slotId
     * @return Server
     */
    getServer(slotId = 0) {
        if('number' !== typeof(slotId)) {
            throw new TypeError('Invalid slotId type!');
        }
        if('undefined' === typeof(this.socketsServer[slotId])) {
            throw new RangeError('Socket server not found in the range of slotId');
        }
        return this.socketsServer[slotId];
    }

    /*
     * add a new Room
     * @function Controller.addRoom
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
     * @function Controller.deleteRoom
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
 * Built-in stringify message!
 * @function Stringify
 * @param {String} event
 * @param {Object} data
 */
function Stringify(event,data = {}) {
    if('string' !== typeof(event)) {
        throw new TypeError('event argument should be a valid string');
    }
    return JSON.stringify({event,data});
}


/*
 * uVyper Event message!
 * @class Message
 * @extended Events
 * 
 * @property {String} eventName
 * @property {Object} sourceData
 * @property {Set} exclude
 */ 
class Message extends events {

    /*
     * @constructor
     * @param {String} eventName
     * @param {Object} sourceData
     * @param {Array} exclude
     */
    constructor(eventName,sourceData = {},exclude = []) {
        super();
        if('string' !== typeof(eventName)) {
            throw new TypeError('Invalid name type!');
        }
        this.eventName = eventName;
        this.sourceData = sourceData;
        this.exclude = new Set(exclude);
    }

    /*
     * Exclude some socket/socket.id from the message
     * @function Message.exclude
     * @param {Socket|String} socket
     * return Message
     */
    exclude(socket) {
        if(socket instanceof Array === true) {
            socket.forEach( (sock) => {
                this.exclude.add( sock instanceof Socket === true ? sock.id : sock );
            });
        }
        else {
            this.exclude.add( socket instanceof Socket === true ? socket.id : socket );
        }
        return this;
    }

    /*
     * Publish a message to a source!
     * @function Message.publish
     * @param {Socket|Server|Room} source
     * @param {Object} data
     * return void 0
     */
    publish(source,data) {
        return new Promise((resolve,reject) => {
            if('undefined' === typeof(source)) {
                try {
                    source = EventsObserver.getServer(0);
                }
                catch(E) {
                    reject(E);
                }
            }
            {
                const tData = typeof(data);
                if('undefined' !== tData && 'object' === tData) {
                    data = Object.assign(this.sourceData,data);
                }
            }
            if(source instanceof Socket === true) {
                try {
                    const messageObject = Stringify(this.eventName,data);
                    EventsObserver.emit('send',messageObject);
                    source.ws.send(messageObject);
                    resolve();
                }
                catch(E) {
                    reject(E);
                }
            }
            else if(source instanceof Server === true) {
                try {
                    const messageObject = Stringify(this.eventName,data);
                    for(let [id,socket] of source) {
                        if(this.exclude.has(id)) continue;
                        socket.ws.send(messageObject);
                    }
                    resolve();
                }
                catch(E) {
                    reject(E);
                }
            }
            else if(source instanceof Room === true) {
                try {
                    const messageObject = JSON.stringify({
                        event: this.eventName,
                        roomName: source.sockets.room,
                        data
                    });
                    for(let [id,socket] of source) {
                        if(this.exclude.has(id)) continue;
                        socket.ws.send(messageObject);
                    }
                    resolve();
                }
                catch(E) {
                    reject(E);
                }
            }
            else {
                reject('Unknow source type');
            }
        });
    }

}

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
     * Get a specific Socket 
     * @function SocketsPools.get 
     * @param {Socket|String} socket
     * return Socket;
     */
    get(socket) {
        if('undefined' === typeof(socket)) {
            throw new TypeError('Cannot get undefined socket');
        }
        return this.get(socket instanceof Socket ? socket.id : socket);
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
        // Define class properties
        this.ws = uSocket;
        this.id = uuid.v1();
        this.rooms = new Set();

        /* 
         * Handle raw message from original uSocket to transform it into structured message!
         */
        this.ws.on('message',(buf) => {
            EventsObserver.emit('message',buf);
            let jsonMessage;
            try {
                jsonMessage = JSON.parse(buf.toString());
            }
            catch(E) {
                // Fallback Emit raw message!
                this.emit('message',buf);
                return;
            }

            const { event: eventName, data = {}, roomName } = jsonMessage;
            if('undefined' === typeof(eventName)) {
                return;
            }

            // TODO: Review broadcast!
            if('undefined' === typeof(roomName)) {
                this.emit(eventName,data);
            }
            else if(this.rooms.has(roomName) === true){
                data.from = this.id;
                new Message(eventName,data).exclude(this.id).publish(this.rooms.get(roomName));
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
    send(eventName,data) {
        new Message(eventName,data).publish(this);
    }
    

    /*
     * Send a new raw data (buffer). It's like sending an original uWebSocket message!
     * @function Socket.sendRaw
     * @param {Buffer|String} buffer
     * @return void 0
     */
    sendRaw(buffer) {
        if('undefined' === typeof(buffer)) {
            throw new TypeError('cannot send a undefined buffer!');
        }
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
 * @extended events
 * 
 * @property {String} id
 * @property {SocketsPools} sockets
 * @property {uws.Server} wss
 * @property {Boolean} ssl
 * @property {Https.Server} httpsServer
 * @property {Any} adapter
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
            this.wss = new uws.Server({ port: 443, server: this.httpsServer });
        }
        else {
            this.wss = new uws.Server({ port: options.port });
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
            EventsObserver.emit('listening',this.id);
        });
        EventsObserver.socketsServer.push(this);
    }

    /*
     * Set a adapter
     * @function Server.setAdapter
     * @param {Any} AdapterInstance
     * @return void 0
     */
    async setAdapter(AdapterInstance) {
        if('undefined' === typeof(AdapterInstance)) {
            throw new TypeError('Undefined adapter');
        }
        if('undefined' !== typeof(this.adapter)) {
            throw new Error('Adapter is already defined!');
        }
        await AdapterInstance.init(EventsObserver,this);
        this.adapter = AdapterInstance;
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
    
    /*
     * Native broadcast to all connected sockets
     * @function Server.broadcast
     * @param {String} message
     * @return void 0
     */
    broadcast(message) {
        this.wss.broadcast(message);
    }

    /*
     * Close websocket server!
     * @function Server.close
     * @param {Callback} cb
     * @return void 0
     */
    close(cb) {
        this.wss.close(cb);
    }

}
// Attach EventsObserver Object to Server!
Server.EventsObserver = EventsObserver;

/*
 * Export all core class!
 */
module.exports = {
    Server,
    Client: uws,
    Socket,
    Message,
    SocketsPools,
    Room,
    Controller,
    Stringify
};