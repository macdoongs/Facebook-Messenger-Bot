
var express = require('express');
var app = express();
var webhook = require('./webhook/webhook');

app.use('/webhook', webhook);

var server = app.listen(3000, function(){
  console.log('Express server has started on port 3000!');
});

app.get('/', function(req, res){
  res.send('Hello world!')
})
