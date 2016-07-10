
var express = require('express');
var app = express();
var path = require('path');

var config = require('config.json')('./config/config.json');

console.log(config.app.title + " start!");

var fs = require('fs');

var webhook = require('./webhook/webhook');

var mysql = require('mysql');
var conn = mysql.createConnection({
	host      : config.rds.host,
	user      : config.rds.user,
	password  : config.rds.password,
	database  : config.rds.webdatabase
});

conn.connect();

var server = app.listen(config.app.port, function(){
	console.log('Express server has started on port ' + config.app.port + ' !');

	if( process.env.NODE_ENV == 'production' ) {
    		console.log("Production Mode");
  	} else if( process.env.NODE_ENV == 'development' ) {
    		console.log("Development Mode");
  	}
});

app.get(img = '/image/logo.jpg',function(req, res){
	res.sendFile(path.join(__dirname + img));
});

app.get(img = '/image/index.jpg',function(req, res){
	res.sendFile(path.join(__dirname + img));
});

app.use('/webhook', webhook);

app.get('/', function(req, res){
});

conn.end();
