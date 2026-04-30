const express = require('express');

const session = require('cookie-session');

const cors = require('cors');

const { PORT, SERVER_SESSION_SECRET } = require('./config.js');

const bodyParser = require('body-parser');  

const http = require('http');

const WebSocket = require('ws');

const createwssRoutes = require('./routes/endpoints/websocket.js');



let app = express();

const server = http.createServer(app);

const clients = new Map();

const wss = new WebSocket.Server({

    noServer: true

});



wss.on("connection", function(ws, request) {

   

    const clientId = request.clientId;

    console.log("Client Id", clientId, " connected to websocket");



    clients.set(clientId, ws);

    

    const keepAliveInterval = setInterval(() => {

        if (ws.readyState === WebSocket.OPEN) {

            ws.send(JSON.stringify({ type: 'heartbeat', message: 'keep-alive' }));

        }

    }, 30000)



})





server.on('upgrade', (request, socket, head) => {

    // Only handle WebSocket upgrade requests

    const clientId = request.url.split("/").pop();





    wss.handleUpgrade(request, socket, head, (ws) => {

        request.clientId = clientId;

        wss.emit('connection', ws, request);

    });

});





app.use(bodyParser.urlencoded({ extended: true }));

app.use(bodyParser.json());

const corsOptions = {

    origin: '*'

}

app.use(cors(corsOptions));



app.use(session({

    secret: SERVER_SESSION_SECRET,

    resave: false,

    saveUninitialized: true,

    cookie: {

        maxAge: 24 * 60 * 60 * 1000,  // 1 day

        secure: true,                 // Only over HTTPS

        sameSite: 'None'             // For cross-site cookies

    }

}));

app.use(express.static('public'));

// app.use(session({ secret: SERVER_SESSION_SECRET, maxAge: 24 * 60 * 60 * 1000 }));

app.use(require('./routes/endpoints/oauth.js'));

app.use(require('./routes/endpoints/dm.js'));

app.use(require('./routes/endpoints/issues.js'));

app.use(require('./routes/endpoints/modelderivative.js'));

app.use(require('./routes/endpoints/sqlite.js'));

app.use(createwssRoutes(clients));





// --- Webhook route for Autodesk ACC issues ---

app.post('/webhook/issues', (req, res) => {

    console.log('🔔 New webhook event received from Autodesk:');

    console.log(JSON.stringify(req.body, null, 2));



    // Send to all connected clients

    sockets.forEach(ws => ws.send(JSON.stringify(req.body)));



    // Always send 200 OK fast so Autodesk knows we received it

    res.status(200).send('OK');

});







//app.use(require('./routes/endpoints/sqlite.js'));



server.listen(PORT, () => console.log(`Server listening on port ${PORT}...`));

String.prototype.format =function () {

    var args = arguments;

    return this.replace(/\{(\d+)\}/g, function(m, i){

        return args[i];

    });

  };