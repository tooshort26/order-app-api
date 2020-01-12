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

const FoodOrder = bookshelf.model('FoodOrder', {
  tableName : 'food_orders',
  order_food () {
      return this.hasMany('Food', 'id', 'food_id');
  }
});


const Food = bookshelf.model('Food', {
  tableName : 'foods',
  images() {
      return this.hasMany(FoodImage)
  },
  category() {
      return this.hasOne(Category, 'id', 'category_id')
  },
  customers() {
    return this.belongsToMany('Customer')
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
  foods() {
    return this.belongsToMany('Food').withPivot(['created_at', 'status']);
  },
  orders() {
    return this.hasOne('Order');
  }
});

const Order = bookshelf.model('Order', {
  tableName : 'orders',
  foods() {
    return this.hasMany('FoodOrder', 'order_order_no', 'order_no');
  },
  customer () {
    return this.hasOne('Customer', 'id', 'customer_id');
  }
})


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

  	socket.on('submit-order', function (data) {
      socket.broadcast.emit('new-order', {
        order : data,
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
      let foods = new Food().query('where', 'category_id', '=', params.query.category_id)
      .fetchAll({
        withRelated : [
          {
            'category' : function (qb) {
              qb.column('id', 'name', 'description');
            },
            'images' : function (qb) {
              qb.column('id', 'food_id', 'image');
            }
          }
        ],
        columns: ['id', 'name', 'description', 'price', 'category_id']
      });
      return foods;
      
    } else {
        let foods = new Food().fetchAll({
        withRelated : [   {
           'category' : function (qb) {
              qb.column('id', 'name', 'description');
            },
            'images' : function (qb) {
              qb.column('id', 'food_id', 'image');
            }
          }],
          columns: ['id', 'name', 'description', 'price', 'category_id']
      });
      return foods;
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
        data.images.forEach((image) => {
          new FoodImage().save({
            food_id : food.id,
            image : image,
          }, { method : 'insert'});
        });
         
      });

      return food;
  },
  async update(id, params) {
    let data = {
      name : params.name,
      description  : params.description,
      price : params.price,
    };

    if (params.hasOwnProperty('category_id')) {
      data.category_id = params.category_id;
    }
    

    let food = new Food({ id: id })
        .save(data, { patch: true });
    if (params.hasOwnProperty('images')) {
        food.then((food) => {
            params.images.forEach((image) => {
              new FoodImage({id : params.food_images_id})
                  .save({food_id : food.id, image : image});
            });
        });  
    }
  }
});

app.use('/carts', {
  async get(customer_id) {
    return new Customer({id : customer_id}).fetch({ withRelated : [
          {
            'foods' : function (qb) {
              qb.leftJoin('food_images', 'food_images.food_id', 'foods.id')
                .select('foods.id', 'foods.name', 'foods.description', 'food_images.image')
                .where('_pivot_status', '=', 'in_cart')
                .groupBy('foods.name')
                .sum('foods.price as price')
                .count('foods.name as quantity');
            }
          }
        ]});
  },
  async create(data) {
    data.created_at = moment().format("DD-MM-YYYY hh:mm A");
    data.status = 'in_cart';
    new Customer({id : data.customer_id}).fetch({withRelated : ['foods']}).then((customer) => customer.foods().attach(data));
  },
  async remove(data) {
  	return new Customer({id : data.customer_id}).fetch({withRelated : ['foods']})
  				.then((customer) => customer.foods().where('food_id', data.food_id).detach(data));
  },
});


app.use('/customers', {
  async get(data) {
  	if(isNaN(parseInt(data))) { // The user want to fetch not using the customer id.
  		return db.table('customers').where('email', data).select('*');
  	}  else {
  		return new Customer({id : data}).fetch({columns : ['id', 'firstname', 'lastname', 'email', 'phone_number', 'address']});
  	}
  },
  async create(data, params) {
      let customer = db.table('customers')
        .insert(data);
      return customer;
  },
  async update(id,params) {
    return new Customer({id : id}).save(params,{ patch: true });
  }
}); 

app.use('/orders', {
  async find() {
    let today = moment().format('DD-MM-YYYY');
    return new Order().query('where', 'created_at', 'LIKE', today + "%").query('where', 'status','=', 'incoming').fetchAll({withRelated : ['customer','foods', 'foods.order_food']});
  }
  ,
  async get(data) {
     return new Order().where('order_no', data.order_no).fetch({withRelated : [
      { 'customer' : function (qb) {
          qb.select('id', 'firstname', 'lastname', 'email', 'phone_number', 'address')
            .where('id', data.customer_id);
        }
      },'foods', 'foods.order_food']});
  }
  ,
  async create(data) {
    let orders = JSON.parse(data.orders);
    let customer = data.customer_id;
    let orderType = data.order_type;
    let maxOrderNo = await db('orders').max('order_no as order_no').first();
    let orderNo = maxOrderNo.order_no == null ? 1 : maxOrderNo.order_no;
    orderNo++;


      new Order().save({
              order_no : orderNo,
              customer_id : customer,
              order_type : orderType,
              status : 'incoming',
              created_at : moment().format("DD-MM-YYYY hh:mm A"),
          });

      orders.forEach((order) => {
        let foodId = order.id;
        let quantity = order.quantity;
          new FoodOrder().save({
              order_order_no : orderNo,
              food_id : foodId,
              quantity : quantity
          });

          new Food({id : foodId}).fetch({  withRelated: ['customers'] });
     });
      return orderNo;
  },
  async update(order_no, data) {
    return new Order().where('order_no', '=', order_no)
                .where('customer_id', '=', data.customer_id)
                .save({ status : data.status }, { patch : true});
  },
});

app.use(express.errorHandler());

app.get('/', (req, res) => {
  res.end('');
});


app.post('/customer/login' , (req, res) => {
  app.service('customers').get(req.body.email).then((customer) => {
      bcrypt.compare(req.body.password, customer[0].password, (err, result) => {
          if (result) {
            res.json({
                message : 'Authorized',
                id : customer[0].id,
                firstname : customer[0].firstname,
                lastname : customer[0].lastname,
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

app.post('/customer/update/profile', (req,res) => {
  app.service('customers').update(req.body.id, req.body).then((customer) => {
    return res.json({
        message : 'Succesfully update user profile',
        id : customer.id
     });
  });
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

app.get('/customer/cart/:customer_id', (req, res) => {
  app.service('carts').get(req.params.customer_id).then((customer) => {
      return res.json(customer);
  });
});

app.post('/customer/cart', (req, res) => {
  let data = req.body;
  let orderQuantity = data.quantity;
  delete data.quantity;
  for(let iteration = 0; iteration<orderQuantity; iteration++) {
    app.service('carts').create(data).then((customer) => {
      if (iteration == (orderQuantity - 1)) {
        return res.status(200).json({
          message : 'Succesfully add to cart.',
          code : 201
        });  
      }
    });  
  }
});

app.post('/customer/cart/remove/item', (req, res) => {
	let data = req.body;
	app.service('carts').remove(data).then((cart) => {
		return res.status(200).json({
	        message : 'Succesfully remove the item.',
	        code : 200
      });
	});
});

app.post('/customer/order', (req, res) => {
  let data = req.body;
  app.service('orders').create(data).then((orderNo) => {
    // Here Update the cart.
      return res.status(200).json({
        message : 'Succesfully submit your order.',
        code : 201,
        order_no : orderNo
      });
  });
});

app.get('/prepare/order', (req, res) => {
   let today = moment().format('DD-MM-YYYY');
   return new Order().query('where', 'created_at', 'LIKE', today + "%")
                     .query('where', 'status','=', 'prepare')
                     .fetchAll({withRelated : ['customer','foods', 'foods.order_food']}).then((orders) => {
                        return res.status(200).json(orders);
                     });
});

app.get('/cancelled/order', (req, res) => {
   let today = moment().format('DD-MM-YYYY');
   return new Order().query('where', 'created_at', 'LIKE', today + "%")
                     .query('where', 'status','=', 'cancelled')
                     .fetchAll({withRelated : ['customer','foods', 'foods.order_food']}).then((orders) => {
                        return res.status(200).json(orders);
                     });
});

app.get('/customer/orders/:customer_id', (req, res) => {
  let data = req.params;
  let today = moment().format('DD-MM-YYYY');
  return new Order().query('where', 'created_at', 'LIKE' , today + "%")
            .query('where', 'status', '=', 'incoming')
            .fetchAll({withRelated : ['foods', 'foods.order_food']})
            .then((orders) => {
                return res.status(200).json(orders);
            });
});

app.post('/customer/cancel/order/', (req, res) => {
  let data = req.body;
  return app.service('orders').update(data.order_no, data).then((order) => {
    return res.status(200).json({
        order,
        message : 'Succesfully cancel your order',
        code : 200
    })  
  });
});


app.get('/customer/receipt/:customer_id/:order_no', (req, res) => {
  let data = req.params;
  app.service('orders').get(data).then((receiptInformation) => {
      return res.status(200).json(receiptInformation);
  });
});




// New connections connect to stream channel
app.on('connection', conn => app.channel('stream').join(conn));

// Publish events to stream
app.publish(data => app.channel('stream'));

// let IP = ifaces['Wireless Network Connection'][1].address;
// PORT, IP
// app.listen(process.env.PORT || 5000, '192.168.1.4').on('listening', _ => console.log(`app start running.`));
app.listen(process.env.PORT || 3030).on('listening', _ => console.log(`app start running.`));







