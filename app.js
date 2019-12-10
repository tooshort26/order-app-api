const PORT = process.env.port || 3030;
const feathers = require('@feathersjs/feathers');
const express  = require('@feathersjs/express');
const socketio = require('@feathersjs/socketio');
const moment   = require('moment');
const knex     = require('knex');
const service  = require('feathers-knex');
const cors = require('cors');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const myPlaintextPassword = 's0/\/\P4$$w0rD';
const someOtherPlaintextPassword = 'not_bacon';
const bodyParser = require('body-parser');
const _ = require('underscore');
var os = require('os');
var ifaces = os.networkInterfaces();


const db = knex({
  client: 'sqlite3',
  connection: {
    filename: './db.sqlite'
  },
  useNullAsDefault: true
});

const bookshelf = require('bookshelf')(db);

const FoodImage = bookshelf.model('FoodImage', {
  tableName : 'food_images',
});


const Food = bookshelf.model('Food', {
  tableName : 'foods',
  images() {
      return this.hasMany(FoodImage)
  }
});

const Category = bookshelf.model('Category', {
  tableName : 'categories',
  foods() {
      return this.hasMany(Food)
  }
});

const Customer = bookshelf.model('Customer', {
  tableName : 'customers',
});


const app = express(feathers())

app.use(bodyParser.json());       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 

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

app.use('/categories', {
  async find(data) {
    return new Category().fetchAll({withRelated : ['foods', 'foods.images']});
  },
  async get(id) {
    return new Category({id:id}).fetch({withRelated : ['foods', 'foods.images']})
  },
  async create(data) {
      return new Category().save(data, { method : 'insert'});
  },
  async update(id, params) {
    return new Category({ id: id })
        .save(params,{ patch: true });
  }
});

app.use('/foods', {
  async find(params) {
    if (params.query.category_id) {
      return new Food().query('where', 'category_id', '=', params.query.category_id)
      .fetchAll({
        withRelated : [
          {
            'images' : function (qb) {
              qb.column('food_id', 'image');
            }
          }
        ],
        columns: ['id', 'name', 'description', 'price']
      });
    } else {
        return new Food().fetchAll({
        withRelated : [
          {
            'images' : function (qb) {
              qb.column('food_id', 'image');
            }
          }
        ],
        columns: ['*']
      });
    }
  },
  async get(id) {
    return new Food({id :id }).fetch({withRelated : ['images']});
  },
  async create(data) {
      let food = new Food().save({
        name : data.name,
        description : data.description,
        category_id : data.category_id,
        price : data.price,
      }, { method : 'insert' });

      food.then((food) => {
         new FoodImage().save({
            food_id : food.id,
            image : data.image,
          }, { method : 'insert'});
      });

      return food;
  },
  async update(id, params) {
    return new Food({ id: id })
        .save(params,{ patch: true });
  }
});


app.use('/customers', {
  async get(email) {
    return db.table('customers').where('email', email).select('*');
  },
  async create(data, params) {
      let customer = db.table('customers')
        .insert(data);
      return customer;
  }
}); 



app.use(express.errorHandler());

app.post('/customer/login' , (req, res) => {
  app.service('customers').get(req.body.email).then((customer) => {
      bcrypt.compare(req.body.password, customer[0].password, (err, result) => {
          if (result) {
            res.json({
                message : 'Authorized',
                id : customer.id,
                code : 200
            });
          } else {
            res.json({
              message : 'Invalid Email/Password',
              code : 401
            });
          }
      });
  }).catch((err) => res.json({message : 'Invalid Email/Password', code : 401 }));
});

app.post('/customer/register', (req, res) => {
  bcrypt.genSalt(saltRounds, function(err, salt) {
    bcrypt.hash(req.body.password, salt, function(err, hash) {
            let customer = app.service('customers').create({
                password : hash,
                firstname : req.body.firstname,
                middlename : req.body.middlename,
                lastname : req.body.lastname,
                email : req.body.email,
                address : req.body.address,
                phone_number : req.body.phone_number,
            });
          customer.then((customer) => {
              res.json({
                message : 'Succesfully registered',
                id : customer[0], // id fo the customer.
              });
          });
          
      });
  });
});

app.get('/foods/:category_id', (req, res) => {
    app.use('foods').find(req.params.category_id)
       .then((foods) => {
          res.json(foods);
       });
});


// New connections connect to stream channel
app.on('connection', conn => app.channel('stream').join(conn));

// Publish events to stream
app.publish(data => app.channel('stream'));

let IP = ifaces['Wireless Network Connection'][1].address;
app.listen(PORT, IP).on('listening', _ => console.log(`Real time server running on ${IP} port ${PORT}`));







