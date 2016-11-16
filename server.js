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
var ready = [];	// list of players who are ready to start game
var round = []; 	// list of players remaining in current round
var winners = []; // list of winners in order
var turn = 0;		// indicator for current player's turn

// various flags for special cases
var prev_comb_player_won = ["player_name", false];
var passed_on_new_round = ["player_name", false];
var prev_player_passes = false; 	
var one_more_turn = false;
var first_turn = true;

var p1_hand = [];
var p2_hand = [];
var p3_hand = [];
var p4_hand = [];
var p_hand_map = {}; // maps each player's id to a hand
var prev_comb = []; 	// previous combination in a format of [[comb], type]
var discarded = []; 	// pile of discarded cards

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
		if (index != -1) {
			players.splice(index, 1);
		}
		io.emit("user_disconnect", {user: socket.id});
	});

	socket.on("ready", function() {
		if (ready.indexOf(socket.id) == -1) {
			ready.push(socket.id);
		}
		if (ready.length == 4) {
			start_game();
		} else {
			io.emit("ready", {ready: ready});
		}
	});
	function start_game() {
		prev_comb_player_won = ["player_name", false];
		prev_player_passes = false;
		one_more_turn = false;
		first_turn = true;
		ready.splice(0, ready.length);
		round.splice(0, round.length);
		prev_comb = [[], ""];
		discarded.splice(0, discarded.length);
		winners.splice(0, winners.length);
		p1_hand.splice(0, p1_hand.length);
		p2_hand.splice(0, p2_hand.length);
		p3_hand.splice(0, p3_hand.length);
		p4_hand.splice(0, p4_hand.length);
		for (var i = 0; i < players.length; i++) {
			round.push(players[i]);
		}
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
		if (p1_hand[0] == "01A") {
			turn = 0;
		} else if (p2_hand[0] == "01A") {
			turn = 1;
		} else if (p3_hand[0] == "01A") {
			turn = 2;
		} else if (p4_hand[0] == "01A") {
			turn = 3;
		}
		p_hand_map[players[0]] = p1_hand;
		p_hand_map[players[1]] = p2_hand;
		p_hand_map[players[2]] = p3_hand;
		p_hand_map[players[3]] = p4_hand;
		io.to(players[0]).emit("starting_hand", {hand: p_hand_map[players[0]]});
		io.to(players[1]).emit("starting_hand", {hand: p_hand_map[players[1]]});
		io.to(players[2]).emit("starting_hand", {hand: p_hand_map[players[2]]});
		io.to(players[3]).emit("starting_hand", {hand: p_hand_map[players[3]]});
		io.emit("start");
		io.emit("current_turn", {player: round[turn]});
		setTimeout(function() {update_players_hand()}, 1500);
	}
	function update_players_hand() {
		p_hand_map[players[0]] = [p1_hand, p2_hand.length, p3_hand.length, p4_hand.length];
		p_hand_map[players[1]] = [p2_hand, p3_hand.length, p4_hand.length, p1_hand.length];
		p_hand_map[players[2]] = [p3_hand, p4_hand.length, p1_hand.length, p2_hand.length];
		p_hand_map[players[3]] = [p4_hand, p1_hand.length, p2_hand.length, p3_hand.length];
		io.to(players[0]).emit("player_hand", {hand: p_hand_map[players[0]]});
		io.to(players[1]).emit("player_hand", {hand: p_hand_map[players[1]]});
		io.to(players[2]).emit("player_hand", {hand: p_hand_map[players[2]]});
		io.to(players[3]).emit("player_hand", {hand: p_hand_map[players[3]]});
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
				var first 	= data.selected[0].substring(0, 2);
				var second 	= data.selected[1].substring(0, 2);
				if (first == second) {
					type = "double";
				}
			} else if (data.selected.length == 3) {
				var first 	= data.selected[0].substring(0, 2);
				var second 	= data.selected[1].substring(0, 2);
				var third 	= data.selected[2].substring(0, 2);
				if (first == second && first == third) {
					type = "triple";
				} else if (second-first == 1 && third-first == 2) {
					type = "run";
				}
			} else if (data.selected.length == 4) {
				var first 	= data.selected[0].substring(0, 2);
				var second 	= data.selected[1].substring(0, 2);
				var third 	= data.selected[2].substring(0, 2);
				var fourth 	= data.selected[3].substring(0, 2);
				if (first == second && first == third && first == fourth) {
					type = "bomb";
				} else if (second-first == 1 && third-first == 2 && fourth-first == 3) {
					type = "run";
				}
			} else if (data.selected.length == 6) {
				var first 	= data.selected[0].substring(0, 2);
				var second 	= data.selected[1].substring(0, 2);
				var third 	= data.selected[2].substring(0, 2);
				var fourth 	= data.selected[3].substring(0, 2);
				var fifth 	= data.selected[4].substring(0, 2);
				var sixth 	= data.selected[5].substring(0, 2);
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
				if (prev_comb[0].length == 0) {
					if (first_turn && data.selected[0] != "01A") {
						wrong_msg("You must include spades of 3 on first turn.");
					} else {
						first_turn = false;
						next_turn(data, type);
					}
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
								if (current_suit > prev_suit) {
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
	function next_turn(data, type) {
		socket.emit("stop_timer");
		if (prev_comb_player_won[1]) {
			prev_comb_player_won = ["player_name", false];
		}
		if (passed_on_new_round[1]) {
			passed_on_new_round = ["player_name", false];
		}
		var delay = 1500;
		var prev_discarded_length = discarded.length;
		if (prev_comb.length != 0) {
			delay = 2000;
			for (var i = 0; i < prev_comb[0].length; i++) {
				discarded.push(prev_comb[0][i]);
			}
		}
		prev_comb.splice(0, prev_comb.length);
		prev_comb.push(data.selected);
		prev_comb.push(type);
		var hand = p_hand_map[socket.id][0];
		var random_indices = [];
		for (var i = 0; i < hand.length; i++) {
			random_indices.push(i);
		}			
		for (var i = 0; i < data.selected.length; i++) {
			var index = hand.indexOf(data.selected[i]);
			hand.splice(index, 1);
		}
		if (hand.length == 0) {
			var index = round.indexOf(socket.id);
			round.splice(index, 1);
			winners.push(socket.id);
			prev_comb_player_won = [socket.id, true];
			if (winners.length == 3) {
				winners.push(round[0]);
			}
		} else {
			turn++;
		}
		if (turn == round.length) {
			turn = 0;
		}		
		shuffle(random_indices);
		random_indices = random_indices.slice(0, data.selected.length);
		random_indices.sort(function(a, b) {return a > b;});
		var index = players.indexOf(socket.id);
		var direction = ["bottom", "left", "top", "right"];
		for (var i = 0; i < 4; i++) {
			if (index == 4) {
				index = 0;
			}
			io.to(players[index]).emit("animate_cards", {indices: random_indices, direction: direction[i]});
			setTimeout(function() {
				io.emit("animate_discard", {discarded: prev_discarded_length});
			}, 1500);
			index ++;
		}
		setTimeout(function() {
			if (winners.length == 4) { // end of game
				io.emit("cards_played", {played: data.selected});
				io.emit("animate_discard", {discarded: discarded.length});
				for (var i = 0; i < data.selected.length; i++) {
					discarded.push(data.selected[i]);
				}
				setTimeout(function() {	
					io.emit("cards_discarded", {discarded: discarded});
					io.emit("end", {winners: winners});
				}, 500);
			} else { // move to next player
				update_players_hand();
				io.emit("cards_discarded", {discarded: discarded});
				io.emit("cards_played", {played: data.selected});
				if (round.length == 0) {
					end_of_round(2);
				} else if (round.length == 1 && prev_player_passes) {
					end_of_round(1);
					prev_player_passes = false;
				} else if (round.length == 1 && prev_comb_player_won[1]) {
					io.emit("current_turn", {player: round[turn]});
					one_more_turn = true;
				} else if (round.length == 1 && one_more_turn) {
					end_of_round(1);
					one_more_turn = false;
				} else {
					io.emit("current_turn", {player: round[turn]});
				}
			}
		}, delay);
	}
	function wrong_msg(msg) {
		socket.emit("wrong_cards", {response: msg});
	}

	socket.on("pass_turn", function() {
		console.log("Current turn: " + round[turn]);
		if (socket.id == round[turn]) {
			first_turn = false;
			if (prev_comb[0].length == 0 && !passed_on_new_round[1]) {
				passed_on_new_round = [socket.id, true];
			}
			var index = round.indexOf(socket.id);
			round.splice(index, 1);
			if (turn == round.length) {
				turn = 0;
			}
			if (round.length == 0 && prev_comb[0].length == 0) {
				end_of_round(3);
			} else if (round.length == 0) {
				end_of_round(2);
				one_more_turn = false;
			} else if (round.length == 1 && !prev_comb_player_won[1] && prev_comb[0].length != 0) {
				end_of_round(1);
			} else {
				io.emit("current_turn", {player: round[turn]});
				if (round.length == 1 && prev_comb_player_won[1]) {
					prev_player_passes = true;
				}
			}
		}
	});
	function end_of_round(msg) {
		console.log("End of round");
		var player = round[0];
		round.pop();
		for (var i = 0; i < players.length; i++) {
			if (winners.indexOf(players[i]) == -1) {
				round.push(players[i]);
			}
		}
		if (prev_comb_player_won[1]) {
			var index = players.indexOf(prev_comb_player_won[0]);
			do {
				index++;
				if (index == players.length) {
					index = 0;
				}
				player = players[index];
			} while (round.indexOf(player) == -1);
			turn = round.indexOf(player);
			prev_comb_player_won = ["player_name", false];
		} else if (msg == 3) {
			turn = round.indexOf(passed_on_new_round[0]);
			passed_on_new_round = ["player_name", false];
		} else {
			turn = round.indexOf(player);
		}
		var prev_discarded_length = discarded.length;
		for (var i = 0; i < prev_comb[0].length; i++) {
			discarded.push(prev_comb[0][i]);
		}
		prev_comb = [[], ""];
		io.emit("animate_discard", {discarded: prev_discarded_length});
		setTimeout(function() {
			io.emit("cards_discarded", {discarded: discarded});
			io.emit("new_round", {player: round[turn], msg: msg});
		}, 800);
	}
});