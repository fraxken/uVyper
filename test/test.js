const assert = require('assert');
const {Server,SocketsPools,Client,Message} = require('../index.js');

const WSServer = new Server({port: 3000});

describe('uVyper Server properties tests...', function() {
    describe('WSServer.id',function() {
        it('should be a string', function() {
            assert.strictEqual('string', typeof(WSServer.id));
        });
    });

    describe('WSServer.ssl',function() {
        it('should be a boolean', function() {
            assert.strictEqual('boolean', typeof(WSServer.ssl));
        });
    });

    describe('WSServer.sockets',function() {
        it('should be instanceof SocketsPools', function() {
            assert.strictEqual( true , WSServer.sockets instanceof SocketsPools);
        });
    });

    describe('WSServer.wss',function() {
        it('should be instanceof Client.Server', function() {
            assert.strictEqual( true , WSServer.wss instanceof Client.Server);
        });
    });
});

describe('uVyper Server events tests...', function() {
    
});