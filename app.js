var express = require('express');
var bodyParser = require('body-parser');

var routes = require('./routes/index');

var app = express();

var multer = require('multer');
var cors = require('cors');
var store = require('haru-nodejs-store');

var config = require('./config');

var analysis = require('haru-nodejs-analysis');

store.connect(config.store);


app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cors());
app.use(analysis({analysis: config.mqueue.analysis}));

app.use(multer({
    inMemory: true,
    limits: config.limits,
    includeEmptyFields: true
}));

app.use('/1', routes);



module.exports = app;
