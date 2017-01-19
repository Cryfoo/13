var express = require("express");
var bodyParser = require("body-parser");
var path = require("path");
var app = express();

app.use(express.static(path.join(__dirname, "./client")));
app.use(express.static(path.join(__dirname, "./bower_components")));
app.use(express.static(path.join(__dirname, "./node_modules")));
app.use(bodyParser.json());

require("./server/config/mongoose.js");
require("./server/config/routes.js")(app);

var server = app.listen(8000, function() {
	console.log("listening on port 8000");
});

var io = require("socket.io").listen(server);

// Object that holds all the users who are logged in
var userLogin = {};
// Object that holds all the rooms
var rooms = {};
// Object that holds the variables for all game rooms
var variables = {};

var main = io.of("/main");
var game = io.of("/game");

require("./server/config/main.js")(main, rooms, userLogin, variables);
require("./server/config/game.js")(game, main, rooms, userLogin, variables);