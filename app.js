const feathers = require('@feathersjs/feathers');
const express  = require('@feathersjs/express');
const socketio = require('@feathersjs/socketio');
const moment   = require('moment');

let mysql = require('mysql');
let connection = mysql.createConnection({
	 host     : 'localhost',
	 user     : 'root',
	 password : '',
	 database : 'attendancesys'
});


// Idea Service
class IdeaService
{
	constructor() {
		this.prepareData();
	}

	async prepareData() {
		connection.query(`SELECT * FROM ideas`,  (error, results, fields) => {
			if (error) throw error;
			this.load(results)
		});
	}

	load(ideas) {
		this.ideas = ideas;
	}

	async find() {
		await this.prepareData();
		return this.ideas;
	}

	async create(data) {

		const idea = {
			text : data.text,
			tech : data.tech,
			viewer : data.viewer
		}

		connection.query('INSERT INTO ideas SET ?', idea, function (error, results, fields) {
		  if (error) throw error;
		});

		this.prepareData();
		return idea;
	}
}

const app = express(feathers())



// Parse JSON
app.use(express.json())

// Config Socket.io realtime APIs
app.configure(socketio(function(io) {
  io.on('connection', function(socket) {
  	socket.on('sample', function (data) {
  		socket.broadcast.emit('sample', {
	     text : 'A client send some data.'
	  });
  	});
  });
}));

// Enable REST Services
app.configure(express.rest());

// Register Services
app.use('/ideas', new IdeaService());
/*app.use('/messages', {
  create(data, params) {
    return Promise.resolve(data);
  }
});

const messages = app.service('messages');
messages.on('created', (message, context) => {

});
*/

// New connections connect to stream channel
app.on('connection', conn => app.channel('stream').join(conn));

// Publish events to stream
app.publish(data => app.channel('stream'));

const PORT = process.env.port || 3030;
app.listen(PORT, '192.168.1.5').on('listening', _ => console.log(`Real time server running on ${PORT}`));







