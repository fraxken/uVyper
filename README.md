# uVyper
Node.JS µVyper is an high level implementation of µWebSockets with rooms and provide simpler messages handling.

```
npm install uvyper --save
```

run tests :

```
npm test 
```

# Roadmap 

- SSL Support [To be tested]

```js
const WSServer = new Server({
    ssl: true,
    key: '',
    cert: ''
});
WSServer.listen(3000); 
``` 

- Write tests with assert & mocha [Work in progress].
- Adapter support [uvyper-redis project].
- Interface the UWS Client (send-back support...).
- Client (ES5) lib for front-end use (with native WebSocket).


# Documentation

Find all API documentations and examples in the Wiki section of github!