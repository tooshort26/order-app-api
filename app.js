const feathers = require('@feathersjs/feathers');
const express  = require('@feathersjs/express');
const socketio = require('@feathersjs/socketio');
const moment   = require('moment');
const knex     = require('knex');
const service  = require('feathers-knex');
const cors = require('cors');

const PORT = process.env.port || 3030;

const db = knex({
  client: 'sqlite3',
  connection: {
    filename: './db.sqlite'
  },
  useNullAsDefault: true
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
app.use('/attendances', {
  async get(activityId) {
    return db.select()
            .table('attendances')
            .join('activities', 'activities.id', 'attendances.activity_id')
            .leftJoin('students', 'students.id_number', 'attendances.id_number')
            .select('students.*');
  },

  async create(data, params) {
      db.table('attendances')
        .insert(data)
        .then((attendance) => console.log('Succesfully add new attendance.'));

      let attendance = db.select()
            .table('attendances')
            .join('activities', 'activities.id', 'attendances.activity_id')
            .leftJoin('students', 'students.id_number', 'attendances.id_number')
            .where('students.id_number', data.id_number)
            .andWhere('attendances.activity_id', data.activity_id)
            .limit(1)
            .select();
      return attendance;
  }
}); 


app.use(express.errorHandler());

// New connections connect to stream channel
app.on('connection', conn => app.channel('stream').join(conn));

// Publish events to stream
app.publish(data => app.channel('stream'));


app.listen(PORT).on('listening', _ => console.log(`Real time server running on port ${PORT}`));







