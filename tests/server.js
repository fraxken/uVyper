const {Server} = require('../index.js'); 

const server = new Server({port: 3000});
server.on('connection',async function(socket) {
    console.log(`Socket id ${socket.id} connected!`);

    socket.on('test',function() {
        console.log('test event triggered!');
    });
    
    socket.on('close',function() {
        console.log(`Socket ${socket.id} is now disconnected!`);
    });

});

console.log('Socket server started and listen on port 3000!');