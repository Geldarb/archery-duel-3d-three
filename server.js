// Archery Duel 3D server: static files + /health. v2 will add online rooms here.
const express = require('express');
const http = require('http');
const path = require('path');

const BUILD = 'ad3t-v1';
const app = express();
app.get('/health', (req, res) => res.json({ ok: true, build: BUILD }));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
server.listen(process.env.PORT || 3000, () => console.log('listening', server.address().port));
