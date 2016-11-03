var express = require("express");
var bodyParser = require("body-parser");
var path = require("path");
var session = require("express-session");
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

var clients = [];
var turn = 0;

var numbers = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"];
var suits = ["A", "B", "C", "D"];
var cards = [];
for (var i = 0; i < numbers.length; i++) {
	for (var j = 0; j < suits.length; j++) {
		cards.push(numbers[i] + suits[j]);
	}
}

function shuffle(cards) {
	var i = 0;
	var j = 0;
	var temp = null;

	for (i = cards.length-1; i > 0; i--) {
		j = Math.floor(Math.random()*(i+1));
		temp = cards[i];
		cards[i] = cards[j];
		cards[j] = temp;
	}
}

io.sockets.on("connection", function (socket) {
	console.log(socket.id + " connected.");
	clients.push(socket.id);
	io.emit("user_connect", {user: socket.id});
	socket.emit("current_player", {user: socket.id});
	
	socket.on("disconnect", function() {
		console.log(socket.id + " disconnected.");
		var index = clients.indexOf(socket.id);
		clients.splice(index, 1);
		io.emit("user_disconnect", {user: socket.id});
	});

	if (clients.length == 2) {
		shuffle(cards);
		var player1 = [];
		var player2 = [];
		var player3 = [];
		var player4 = [];
		for (var i = 0; i < cards.length; i+=4) {
			player1.push(cards[i]);
			player2.push(cards[i+1]);
			player3.push(cards[i+2]);
			player4.push(cards[i+3]);
		}
		player1.sort();
		player2.sort();
		player3.sort();
		player4.sort();		
		io.to(clients[0]).emit("cards", {cards: player1});
		io.to(clients[1]).emit("cards", {cards: player2});
		io.emit("player_turn", {player: clients[turn]});
	}

	socket.on("pass_turn", function() {
		console.log("Current turn: " + clients[turn]);
		if (socket.id == clients[turn]) {
			turn++;
			if (turn == clients.length) {
				turn = 0;
			}
			io.emit("player_turn", {player: clients[turn]});
		}
	});

	socket.on("play", function(data) {
		if (socket.id == clients[turn]) {
			turn++;
			if (turn == clients.length) {
				turn = 0;
			}
			io.emit("player_turn", {player: clients[turn]});
		}
	});
});