var express = require('express');

var app = express();
var router = express.Router();
app.use(express.static('app'));

var server = app.listen(process.argv[2], function() {
  console.log('Express is listening to http://localhost:'+process.argv[2]);
});
