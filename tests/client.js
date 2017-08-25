const {Client} = require('../index.js'); 

const SocketClient = new Client('ws://localhost:3000');
SocketClient.on('open',function() {
    console.log('Client connexion open!');
    SocketClient.send('test',{});
});