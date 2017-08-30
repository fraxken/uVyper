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
 * 
 * @events [
 *     send => (buf)
 *     message => ({event,data,source,source_id})
 *     room => ({action,room})
 * ]
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
     * @function Controller.addRoom
     * @param {Room} room
     * @return void 0
     */
    addRoom(room) {
        if(room instanceof Room === false) {
            throw new TypeError('Not a room Object');
        }
        if(this.rooms.has(room.name) === true) return;
        this.emit('room',{
            action: 'add',
            room
        });
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
        this.emit('room',{
            action: 'delete',
            room
        });
        this.rooms.delete(room.name);
    }

}
const EventsController = new Controller();

/*
 * uVyper Event message!
 * @class Message
 * 
 * @property {String} eventName
 * @property {Object} sourceData
 * @property {Set} exclude
 * @property {Boolean} pEvent
 */ 
class Message {

    /*
     * @constructor
     * @param {String} eventName
     * @param {Object} sourceData
     * @param {Array} exclude
     */
    constructor(eventName,sourceData = {},exclude = []) {
        if('string' !== typeof(eventName)) {
            throw new TypeError('Invalid name type!');
        }
        this.eventName = eventName;
        this.sourceData = sourceData;
        this.exclude = new Set(exclude);
        this.pEvent = true;
    }

    /*
     * Put off publishing of event to the controller
     * @function Method.off 
     * return Message
     */
    off() {
        this.pEvent = false;
        return this;
    }

    /*
     * Set from header
     * @function Message.id
     * @param {String} socketId
     * return Message
     */
    id(socketId) {
        if('string' !== typeof(socketId)) {
            throw new TypeError('Invalid type for socketId');
        }
        this.sourceData.from = socketId;
        return this;
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
     * return Promise
     */
    publish(source,data = {}) {
        if('undefined' === typeof(source)) {
            source = Server.Default;
        }
        data = Object.assign(this.sourceData,data);

        if('string' === typeof(source)) {
            if(this.pEvent === false) return;
            EventsController.emit('message',{
                event: this.eventName,
                data,
                source: 'Socket', 
                source_id: source
            });
        }
        else if(source instanceof Socket === true) {
            source.ws.send(JSON.stringify({event: this.eventName,data}));
        }
        else if(source instanceof Server === true) {
            if(this.pEvent === true) {
                EventsController.emit('message',{
                    event: this.eventName,
                    data,
                    source: 'Server'
                });
            }
            const messageObject = JSON.stringify({event: this.eventName,data});
            for(let [id,socket] of source.sockets) {
                if(this.exclude.has(id)) continue;
                socket.ws.send(messageObject);
            }
        }
        else if(source instanceof Room === true) {
            const messageObject = {
                event: this.eventName,
                data,
                source: 'Room',
                source_id: source.name
            };
            const strMsg = JSON.stringify(messageObject);
            for(let [id,socket] of source.sockets) {
                if(this.exclude.has(id)) continue;
                if(this.pEvent === true) {
                    EventsController.emit('message',messageObject);
                }
                socket.ws.send(strMsg);
            }
        }
        else {
            throw 'Unknow source type';
        }
    }

}

/* 
 * µVyper Room
 * @class Room
 * @extended events
 * 
 * @property {String} name
 * @property {Map} sockets
 * @property {Boolean} _alive
 * 
 * @events [
 *     connection => (Socket)
 *     disconnect => (Socket)
 * ]
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
        this.sockets = new Map();
        this._alive = true;
        EventsController.addRoom(this);
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
        this.sockets.set(socket.id,socket);
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
        EventsController.deleteRoom(this);
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
 * @events [
 *     close => ()
 * ]
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
            EventsController.emit('send',buf);
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
        return new Promise( (resolve,reject) => {
            if('string' !== typeof(eventName)) {
                throw new TypeError('Invalid type for eventName, it should be a string!');
            }
            const timer = setTimeout(() => {
                reject();
            },msTimeOut);
            this.once(eventName,function(data = {}) {
                clearTimeout(timer);
                resolve(data);
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
    sendRaw(buf) {
        if('undefined' === typeof(buf)) {
            throw new TypeError('cannot send an undefined buffer!');
        }
        this.ws.send(buf);
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
        else if('string' === typeof(room)) {
            if(EventsController.rooms.has(room) === false) {
                throw new TypeError(room+' room doesn\'t exist! ');
            }
            room = EventsController.rooms.get(room);
        }

        if(room instanceof Room === false) {
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
        else if('string' === typeof(room)) {
            if(EventsController.rooms.has(room) === false) {
                throw new TypeError(room+' room doesn\'t exist! ');
            }
            room = EventsController.rooms.get(room);
        }
        
        if(room instanceof Room === false) {
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
 * @param {Boolean} nextTick
 * @param {String} key
 * @param {String} cert
 */
const IServerConstructor = {
    port: 3000,
    key: void 0,
    cert: void 0,
    nextTick: true,
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
 * @property {Number} port
 * @property {String} key
 * @property {String} cert
 * @property {Any} adapter
 * 
 * @events [
 *     connection => (socket)
 *     disconnect => (socket)
 *     error => (errorMessage)
 *     listening => (Server.id)
 * ]
 */
class Server extends events {

    /*
     * @constructor 
     * @param {IServerConstructor} options
     */
    constructor(options = {}) {
        super();
        this.id = uuid.v4();
        this.sockets = new Map();
        Object.assign(this,IServerConstructor,options);
        if(this.nextTick === true) {
            process.nextTick(this.listen.bind(this));
        }
        Server.Default = this;
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
        await AdapterInstance.init(this,Server.Events);
        this.adapter = AdapterInstance;
    }

    /*
     * Listen to a port!
     * @function Server.listen
     * @param {Number} port
     * @return void 0
     */
    listen(port) {
        if(this.ssl === true) {
            if('undefined' === typeof(this.key) || 'undefined' === typeof(this.cert)) {
                throw new TypeError('Please define a key and cert for SSL');
            }
            this.httpsServer = https.createServer({key: this.key,cert: this.cert}, function(request,response) {
                response.end();
            }).listen(443);
            this.wss = new uws.Server({ port: 443, server: this.httpsServer });
            this.httpsServer.listen(port);
        }
        else {
            this.wss = new uws.Server({ port: port || this.port });
        }
        
        /*
         * When socket connect to the server!
         */
        this.wss.on('connection', (ws) => {
            let socket = new Socket(ws);
            this.sockets.set(socket.id,socket);
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

        // On error...
        this.wss.on('error',(error) => {
            this.emit('error',error);
        });

        // When the uWebSocket server is listening!
        this.wss.on('listening',() => {
            this.emit('listening',this.id);
            EventsController.emit('listening',this.id);
        });
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
Server.Default = void 0;
Server.Events = EventsController;

/*
 * Export all core class!
 */
module.exports = {
    Server,
    Client: uws,
    Socket,
    Message,
    Room,
    Controller
};