const {Server,Room} = require('../index.js'); 

const RoomA = new Room('roomA');
RoomA.on('connection',(socket) => {
    console.log(`Socket ${socket.id} connected to ${RoomA.name}`);
}); 

RoomA.on('disconnect',(socket) => {
    console.log(`Socket ${socket.id} disconnected from ${RoomA.name}`);
});

setInterval(function() {
    console.log('Broadcast lol event to roomA');
    RoomA.broadcast('lol',{
        msg: 'lolilol!'
    });
},6000);

const server = new Server({port: 3000});
server.on('connection',function(socket) {
    console.log(`Socket id ${socket.id} connected!`);

    socket.on('test',function(data) {
        console.log('test event received!');
        console.log(data);
        socket.join(RoomA);
        // unsafe version : RoomA.addSocket(socket);
    });

    socket.on('close',function() {
        console.log(`Socket ${socket.id} is now disconnected!`);
    });

});

