const {Server} = require('../index.js');
const test = require('japa');

/*function test(strTitle,fn) {
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
}*/

let WSServer = new Server({
    port: 3000
});

test('Server listening',function(assert,done) {
    WSServer.on('listening',function() {
        console.log('listening triggered!');
        done();
    });
});