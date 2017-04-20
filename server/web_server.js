var express = require('express');
var bodyParser = require('body-parser');
var util = require('util');

var q = require('q');


/*
bucket.get('2000000',function(err,result) {
    if (err) {
        console.error("Error:" + err);
    } else if(result) {
         console.log(result.value.username); 
    }
});
*/

var app = express();
var router = express.Router();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('app'));

var server = app.listen(process.argv[2], function() {
  console.log('Express is listening to http://localhost:'+process.argv[2]);
});
