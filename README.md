# uWebSocket_rooms
Node.JS uWebSocket rooms

# Example 

```js
const {Server,Room} = require('../index.js'); 

const RoomA = new Room('roomA');
RoomA.on('connection',(socket) => {
    console.log(`Socket ${socket.id} connected to ${RoomA.name}`);
}); 

RoomA.on('disconnect',(socket) => {
    console.log(`Socket ${socket.id} disconnected from ${RoomA.name}`);
});

const server = new Server({port: 3000});
server.on('connection',async function(socket) {
    console.log(`Socket id ${socket.id} connected!`);
    
    socket.on('close',function() {
        console.log(`Socket ${socket.id} is now disconnected!`);
    });

    const data = await socket.get('test',10000);

    console.log('test event received!');
    console.log(data);
    socket.join(RoomA); 
    // unsafe version : RoomA.addSocket(socket);

});
```