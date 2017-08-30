const test = require('japa');
const events = require('events');

class t2 extends events {}
const eWrapper = new t2(); 

const {Server} = require('../index.js');

let WSServer;
process.nextTick(function() {
    setImmediate(function() {
        WSServer = new Server({port: 3000});
        WSServer.wss.on('listening',function() {
            eWrapper.emit('listening');
        });
    });
});

test('Server listening',(assert,done) => {
    eWrapper.on('listening',function() {
        done();
    });
}).timeout(1000);

/*function testEvent(strTitle,fn) {
    return new Promise((resolve,reject) => {
        console.log(`TEST:: ${strTitle}`);
        const timeOut = setTimeout(function() {
            reject('timeout');
        },5000);
        const done = function() {
            clearTimeout(timeOut);
            resolve();
        };
        process.nextTick( function() {
            fn(done);
        });
    });
}

testEvent('Server listening',function(done) {
    WSServer.wss.on('listening',function() {
        console.log('listening triggered!');
        done();
    });
})
.then( () => {
    console.log('Resolved!');
    WSServer.close();
    process.exit(0);
})
.catch( E => {
    throw E;
}); */