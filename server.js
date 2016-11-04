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

var clients = []; // list of all connected-clients
var players = [] 	// turn order of 4 players in current game
var round = []; 	// list of players remaining in current round
// var passed = [];	// list of players who passed in current round
var turn = 0;		// indicator for current turn

var p1_hand = [];
var p2_hand = [];
var p3_hand = [];
var p4_hand = [];
var p_hand_map = {}; // maps each player's id to a hand
var prev_comb = []; 	// previous combination in a format of [[comb], type]

var numbers = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"];
var suits = ["A", "B", "C", "D"];
var deck = [];
for (var i = 0; i < numbers.length; i++) {
	for (var j = 0; j < suits.length; j++) {
		deck.push(numbers[i] + suits[j]);
	}
}

// Fisher-Yates algorithm for shuffling a deck
function shuffle(deck) {
	var i = 0;
	var j = 0;
	var temp = null;

	for (i = deck.length-1; i > 0; i--) {
		j = Math.floor(Math.random()*(i+1));
		temp = deck[i];
		deck[i] = deck[j];
		deck[j] = temp;
	}
}

io.sockets.on("connection", function (socket) {
	console.log(socket.id + " connected.");
	players.push(socket.id);

	io.emit("user_connect", {user: socket.id});
	socket.emit("current_player", {user: socket.id});

	socket.on("disconnect", function() {
		console.log(socket.id + " disconnected.");
		var index = players.indexOf(socket.id);
		players.splice(index, 1);
		io.emit("user_disconnect", {user: socket.id});
	});

	if (players.length == 2) {
		round.splice(0, round.length);
		for (var i = 0; i < players.length; i++) {
			round.push(players[i]);
		}
		p1_hand.splice(0, p1_hand.length);
		p2_hand.splice(0, p2_hand.length);
		p3_hand.splice(0, p3_hand.length);
		p4_hand.splice(0, p4_hand.length);
		prev_comb.splice(0, prev_comb.length);
		shuffle(deck);
		for (var i = 0; i < deck.length; i+=4) {
			p1_hand.push(deck[i]);
			p2_hand.push(deck[i+1]);
			p3_hand.push(deck[i+2]);
			p4_hand.push(deck[i+3]);
		}
		p1_hand.sort();
		p2_hand.sort();
		p3_hand.sort();
		p4_hand.sort();
		p_hand_map[players[0]] = p1_hand;
		p_hand_map[players[1]] = p2_hand;
		// p_hand_map[players[2]] = p3_hand;
		// p_hand_map[players[3]] = p4_hand;
		io.to(players[0]).emit("player_hand", {hand: p_hand_map[players[0]]});
		io.to(players[1]).emit("player_hand", {hand: p_hand_map[players[1]]});
		// io.to(players[2]).emit("player_hand", {hand: p_hand_map[players[2]]});
		// io.to(players[3]).emit("player_hand", {hand: p_hand_map[players[3]]});
		io.emit("reset");
		io.emit("current_turn", {player: round[turn]});
	}

	socket.on("play", function(data) {
		console.log("Current turn: " + round[turn]);
		if (socket.id == round[turn]) {
			// check for combination type
			var type = "none";
			if (data.selected.length == 0) {
				type = "none";
			} else if (data.selected.length == 1) {
				type = "single";
			} else if (data.selected.length == 2) {
				var first = data.selected[0].substring(0, 2);
				var second = data.selected[1].substring(0, 2);
				if (first == second) {
					type = "double";
				}
			} else if (data.selected.length == 3) {
				var first = data.selected[0].substring(0, 2);
				var second = data.selected[1].substring(0, 2);
				var third = data.selected[2].substring(0, 2);
				if (first == second && first == third) {
					type = "triple";
				} else if (second-first == 1 && third-first == 2) {
					type = "run";
				}
			} else if (data.selected.length == 4) {
				var first = data.selected[0].substring(0, 2);
				var second = data.selected[1].substring(0, 2);
				var third = data.selected[2].substring(0, 2);
				var fourth = data.selected[3].substring(0, 2);
				if (first == second && first == third && first == fourth) {
					type = "bomb";
				} else if (second-first == 1 && third-first == 2 && fourth-first == 3) {
					type = "run";
				}
			} else if (data.selected.length == 6) {
				var first = data.selected[0].substring(0, 2);
				var second = data.selected[1].substring(0, 2);
				var third = data.selected[2].substring(0, 2);
				var fourth = data.selected[3].substring(0, 2);
				var fifth = data.selected[4].substring(0, 2);
				var sixth = data.selected[5].substring(0, 2);
				if (first == second && third == fourth && fifth == sixth && third-first == 1 && fifth-first == 2) {
					type = "bomb";
				} else if (second-first == 1 && third-first == 2 && fourth-first == 3 && fifth-first == 4 && sixth-first == 5) {
					type = "run";
				}
			} else {
				var run = true;
				var current = data.selected[0].substring(0, 2);
				for (var i = 1; i < data.selected.length; i++) {
					var next = data.selected[i].substring(0, 2);
					if (next-current != 1) {
						run = false;
						break;
					} else {
						current = next;
					}
				}
				if (run) {
					type = "run";
				}
			}
			// check if current combination beats previous combination
			if (type != "none") {
				if (prev_comb.length == 0) {
					next_turn(data, type);
				} else {
					if (type == "bomb") {
						if (prev_comb[1] == type) {
							if (prev_comb[0].length == 6 && data.selected.length == 4) {
								next_turn(data, type);
							} else if (prev_comb[0].length == data.selected.length) {
								var last = prev_comb[0].length-1;
								var prev = prev_comb[0][last].substring(0, 2);
								last = data.selected.length-1;
								var current = data.selected[last].substring(0, 2);
								if (current-prev > 0) {
									next_turn(data, type);
								} else {
									wrong_msg("Please choose a higher bomb.");
								}
							} else {
								wrong_msg("Triple straight cannot beat four of a kind.");
							}
						} else {
							next_turn(data, type);
						}
					} else if (prev_comb[1] == type) {
						if (type == "single") {
							var prev = prev_comb[0][0].substring(0, 2);
							var current = data.selected[0].substring(0, 2);
							if (current-prev > 0) {
								next_turn(data, type);
							} else if (current-prev == 0) {
								var prev_suit = prev_comb[0][0].substring(2, 3);
								var current_suit = data.selected[0].substring(2, 3);
								if (current_suit>prev_suit) {
									next_turn(data, type);
								} else {
									wrong_msg("Please choose a higher suit.");
								}
							} else {
								wrong_msg("Please choose a higher " + type + ".");
							}
						} else if (type == "double" || type == "triple") {
							var prev = prev_comb[0][0].substring(0, 2);
							var current = data.selected[0].substring(0, 2);
							if (current-prev > 0) {
								next_turn(data, type);
							} else {
								wrong_msg("Please choose a higher " + type + ".");
							}
						} else if (type == "run") {
							if (prev_comb[0].length == data.selected.length) {
								var last = prev_comb[0].length-1;
								var prev = prev_comb[0][last].substring(0, 2);
								last = data.selected.length-1;
								var current = data.selected[last].substring(0, 2);
								if (current-prev > 0) {
									next_turn(data, type);
								} else {
									wrong_msg("Please choose a higher straight.");
								}
							} else {
								wrong_msg("Please choose same number of cards to macth the straight.");
							}
						}
					} else {
						wrong_msg("Please choose a combination that matches previous combination.");
					}
				}
			} else {
				wrong_msg("Please choose a correct combination.");
			}
		}
	});
	socket.on("pass_turn", function() {
		console.log("Current turn: " + round[turn]);
		if (socket.id == round[turn]) {
			var index = round.indexOf(socket.id);
			round.splice(index, 1);
			// passed.push(socket.id);				// do i need passed?
			if (turn == round.length) {
				turn = 0;
			}
			if (round.length == 1) {
				console.log("end of round");
				turn = players.indexOf(round[0]);
				round.pop();
				for (var i = 0; i < players.length; i++) {
					round.push(players[i]);
				}
				prev_comb.splice(0, prev_comb.length);
				io.emit("reset");
				io.emit("current_turn", {player: round[turn]});
				io.emit("new_round", {player: round[turn]});
			} else {
				io.emit("current_turn", {player: round[turn]});
			}
		}
	});

	function next_turn(data, type) {
		turn++;
		if (turn == round.length) {
			turn = 0;
		}
		prev_comb.splice(0, prev_comb.length);
		prev_comb.push(data.selected);
		prev_comb.push(type);
		var hand = p_hand_map[socket.id]
		for (var i = 0; i < data.selected.length; i++) {
			var index = hand.indexOf(data.selected[i]);
			hand.splice(index, 1);
		}
		io.emit("current_turn", {player: round[turn]});
		socket.emit("player_hand", {hand: p_hand_map[socket.id]});
		io.emit("cards_played", {played: data.selected});
	}
	function wrong_msg(msg) {
		socket.emit("wrong_cards", {response: msg});
	}
});