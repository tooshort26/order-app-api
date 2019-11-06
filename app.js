const feathers = require('@feathersjs/feathers');
const express  = require('@feathersjs/express');
const socketio = require('@feathersjs/socketio');
const moment   = require('moment');
const knex     = require('knex');
const service  = require('feathers-knex');
var cors = require('cors');

const PORT = process.env.port || 3030;
const HOST = '192.168.1.11';

const db = knex({
  client: 'sqlite3',
  connection: {
    filename: './db.sqlite'
  }
});


const app = express(feathers())

app.use(cors())

// Parse JSON
app.use(express.json())

// Config Socket.io realtime APIs
app.configure(socketio(function(io) {
  io.on('connection', function(socket) {
  	socket.on('sample', function (data) {
  		socket.broadcast.emit('sample', {
	       text : data.text,
	     });
  	});

    socket.on('student-publish', function (data) {
      socket.broadcast.emit('student-publish', {
         text : data,
       });
    });

  });
}));

// Enable REST Services
app.configure(express.rest());

app.use('/activities', service({Model: db, name: 'activities'}));
app.use('/students', service({Model: db, name: 'students'}));

app.use(express.errorHandler());

// New connections connect to stream channel
app.on('connection', conn => app.channel('stream').join(conn));

// Publish events to stream
app.publish(data => app.channel('stream'));


app.listen(PORT, HOST).on('listening', _ => console.log(`Real time server running on ${HOST} port ${PORT}`));







