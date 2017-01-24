var fs = require("fs");
var mongoose = require("mongoose");
var Users = mongoose.model("Users");

module.exports = function(game, main, rooms, userLogin, variables) {

// Generates a deck for the game
var ranks = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"];
var suits = ["A", "B", "C", "D"];
var deck = [];
for (var i = 0; i < ranks.length; i++) {
	for (var j = 0; j < suits.length; j++) {
		deck.push(ranks[i] + suits[j]);
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

// Sockets for the namespace of game
game.on("connection", function(socket) {
	// Declare room number variable
	var roomNum;

	// Initialization when a player connects
	socket.on("userConnected", function(data) {
		// Assign variables
		roomNum = data.roomNum;
		socket.join(roomNum);
		var players = variables[roomNum].players;

		// Clear the logout timer
		clearTimeout(userLogin[data.player.original].logoutTimer);

		// If game did not start and players are less than 4, current player joins the game
		if (!variables[roomNum].start && players.length < 4) {
			players.push(socket.id);
			var username = data.player.original;
			console.log(username + " connected to room number " + roomNum + ".");
			game.to(roomNum).emit("userConnections", {user: username, connect: true});

			// If first player of the gameroom, assign the player as creator
			if (players.length == 1) {
				variables[roomNum].creator = socket.id;
			}

			// Query server for information of the connecting player
			Users.findOne({username: username.toLowerCase()}, function(err, user) {
				// If the score value on server does not match score value from connecting player, update it by score value on server
				if (user.score != data.player.score) {
					socket.emit("updateScore", {score: user.score});
					data.player.score = user.score;
				}

				// Assign current socket id to the player's info
				variables[roomNum].socketUserMap[socket.id] = data.player;

				// Update the player-board on new player's info
				var usernames = [];
				for (var i = 0; i < players.length; i ++) {
					usernames.push(variables[roomNum].socketUserMap[players[i]]);
				}
				for (var i = 0; i < players.length; i++) {
					game.to(players[i]).emit("playerNames", {names: usernames, index: i});
				}
				aiButton();
			});

		// If the game already started, check whether current player is reconnecting
		} else if (variables[roomNum].start) {
			// Assign variables
			var socketUserMap = variables[roomNum].socketUserMap;
			var pHandMap = variables[roomNum].pHandMap;
			var aiMap = variables[roomNum].aiMap;
			var round = variables[roomNum].round;
			var winners = variables[roomNum].winners;
			var dc = variables[roomNum].dc;

			// If current player is reconnecting after dc, update the player on current game progress
			var index = dc.indexOf(data.player.original);
			if (index != -1) {
				var username = data.player.original;
				console.log(username + " connected to room number " + roomNum + ".");
				game.to(roomNum).emit("userConnections", {user: username, connect: true});

				// Update the log
				variables[roomNum].logs += "\r\n" + username + " reconnected.";

				// Remove the player from dc list
				dc.splice(index, 1);

				// Retrieve the previous socket id for reconnecing player
				var prevSocketID;
				var index;
				for (var i = 0; i < players.length; i++) {
					if (socketUserMap[players[i]].original == data.player.original) {
						prevSocketID = players[i];
						index = i;
						break;
					}
				}

				// Reassign player's info to new socket id, and remove player's info related to previous socket id
				socketUserMap[socket.id] = data.player;
				delete socketUserMap[prevSocketID];
				pHandMap[socket.id] = pHandMap[prevSocketID];
				delete pHandMap[prevSocketID];
				players[index] = socket.id;
				if (variables[roomNum].creator == prevSocketID) {
					variables[roomNum].creator = socket.id;
				}
				if (round.indexOf(prevSocketID) != -1) {
					round[round.indexOf(prevSocketID)] = socket.id;
				}
				if (winners.indexOf(prevSocketID) != -1) {
					winners[winners.indexOf(prevSocketID)] = socket.id;
				}

				// Update the reconnecting player on the current game progress
				var playerNames = [];
				for (var i = 0; i < players.length; i ++) {
					if (typeof(players[i]) == "number") {
						var ai = variables[roomNum].aiMap[players[i]];
						var type;
						if (ai == "Auto") {
							type = ".jpeg";
						} else {
							type = ".jpg";
						}
						playerNames.push({profilePath: "static/img/" + ai.toLowerCase() + type, original: ai, score: 99999});
					} else {
						playerNames.push(variables[roomNum].socketUserMap[players[i]]);
					}
				}
				socket.emit("playerNames", {names: playerNames, index: index});
				socket.emit("playerHand", {hand: pHandMap[socket.id]});
				socket.emit("cardsPlayed", {played: variables[roomNum].prevComb[0]});
				socket.emit("cardsDiscarded", {discarded: variables[roomNum].discarded});
				game.to(roomNum).emit("reconnected", {player: data.player.original});

				// If all of the dc players reconnected, resume the game
				if (dc.length == 0) {
					game.to(roomNum).emit("resume");
					variables[roomNum].logs += "\r\nPlayers reconncted, and game will resume.";
					if (players.indexOf(1) != -1) {
						rooms[roomNum].status = "Playing vs A.I.";
					} else {
						rooms[roomNum].status = "Playing vs players";
					}
					main.emit("roomList", {list: rooms});
					clearTimeout(variables[roomNum].freezeTimer);
					resume("Players reconnected.");
				}
			}
		}
	});

	// Adds or removes 'vs A.I.' button
	function aiButton() {
		if (!variables[roomNum].start && variables[roomNum].players.length < 4) {
			game.to(variables[roomNum].creator).emit("aiButton", {show: true});
		} else if (variables[roomNum].players.length == 4) {
			game.to(variables[roomNum].creator).emit("aiButton", {show: false});
		}
	}

	// Resumes the game after dc players whether reconnected or dropped
	function resume(msg) {
		variables[roomNum].freeze = false;
		var aiMap = variables[roomNum].aiMap;
		var round = variables[roomNum].round;
		var turn = variables[roomNum].turn;
		var socketUserMap = variables[roomNum].socketUserMap;
		// A.I.'s turn
		if (typeof(round[turn]) == "number") {
			game.to(roomNum).emit("currentTurn", {player: aiMap[round[turn]], resume: msg});
			setTimeout(function() {aiTurn(turn);}, 1500);
		// Player's turn
		} else {
			var username = socketUserMap[round[turn]].original;
			game.to(roomNum).emit("currentTurn", {player: username, resume: msg});
		}
	}

	// Disconnects the player from game
	socket.on("disconnect", function() {
		var username = variables[roomNum].socketUserMap[socket.id].original;
		console.log(username + " disconnected from room number " + roomNum + ".");
		game.to(roomNum).emit("userConnections", {user: username, connect: false});
		var players = variables[roomNum].players;
		userLogin[username].logoutTimer = setTimeout(function() {
			Users.update({username: username.toLowerCase()}, {loggedIn: false}, function(err) {
				console.log(username + " logged out.");
				delete userLogin[username];
			});
		}, 5000);

		// If a player dc during game, freeze the game
		if (variables[roomNum].start) {
			variables[roomNum].freeze = true;
			variables[roomNum].dc.push(username);
			rooms[roomNum].status = "Frozen";
			main.emit("roomList", {list: rooms});
			variables[roomNum].logs += "\r\n" + username + " disconnected from game.";
			variables[roomNum].logs += "\r\nGame is frozen";
			game.to(roomNum).emit("freeze", {dc: variables[roomNum].dc});
			freeze();

		// Otherwise dc the player from game
		} else {
			// Remove the player from player's list
			index = players.indexOf(socket.id);
			if (index != -1) {
				players.splice(index, 1);
				delete variables[roomNum].socketUserMap[socket.id];
				// Reassign the creator just in case creator left the game
				variables[roomNum].creator = players[0];
				aiButton();
			}

			// Update the player-board that a player left
			var usernames = [];
			for (var i = 0; i < players.length; i ++) {
				usernames.push(variables[roomNum].socketUserMap[players[i]]);
			}
			for (var i = 0; i < players.length; i++) {
				game.to(players[i]).emit("playerNames", {names: usernames, index: i});
			}

			// If number is players is zero, destroy the room
			if (players.length == 0) {
				delete rooms[roomNum];
				delete variables[roomNum];
				main.emit("roomList", {list: rooms});
			// Otherwise, remove the player from the room's player-list
			} else {
				var index = rooms[roomNum].players.indexOf(username);
				rooms[roomNum].players.splice(index, 1);
				main.emit("roomList", {list: rooms});
			}
		}
	});

	// Freezes the game when players disconnect during the game, and waits 15 seconds for players to reconnect
	function freeze() {
		variables[roomNum].freezeTimer = setTimeout(function() {
			// Game resumes by dropping disconnected users who did not reconnect
			if (variables[roomNum].freeze) {
				variables[roomNum].logs += "\r\nGame continues by dropping disconnected players.";
				// Assign variables
				var players = variables[roomNum].players;
				var round = variables[roomNum].round;
				var winners = variables[roomNum].winners;
				var dc = variables[roomNum].dc;
				var leavers = variables[roomNum].leavers;
				var socketUserMap = variables[roomNum].socketUserMap;

				// Add dc players to leaver's list, remove dc players from room.players, retrive socket ids for dc players, and deduct 50pts from dc players' score
				var dcSockets = [];
				for (var i = 0; i < dc.length; i++) {
					leavers.push(dc[i]);
					var index = rooms[roomNum].players.indexOf(dc[i]);
					rooms[roomNum].players.splice(index, 1);
					for (var j = 0; j < players.length; j++) {
						if (socketUserMap[players[j]].original == dc[i]) {
							dcSockets.push(players[j]);
							break;
						}
					}
					var username = dc[i].toLowerCase();
					Users.findOne({username: username}, function(err, returnedUser) {
						var newScore = returnedUser.score - 50;
						if (newScore < 0) {
							newScore = 0;
						}
						Users.update({username: username}, {score: newScore}, function(err) {});
					});
				}

				// Clear disconnected-users array
				dc.splice(0, dc.length);

				// Find the next player who is still in game
				while (dcSockets.indexOf(round[variables[roomNum].turn]) != -1) {
					variables[roomNum].turn++;
					if (variables[roomNum].turn == round.length) {
						variables[roomNum].turn = 0;
					}
				}
				var nextPlayer = round[variables[roomNum].turn];

				// Remove leavers from round and add them to winner's list temporarily
				// Leavers will be temporarily on winner's list so that flow of game logic does not break
				// Leavers will be removed from winner's list at the end of game
				for (var i = 0; i < dcSockets.length; i++) {
					var index = round.indexOf(dcSockets[i]);
					if (index != -1) {
						round.splice(index, 1);
					}
					index = winners.indexOf(dcSockets[i]);
					if (index == -1) {
						winners.push(dcSockets[i]);
					}
				}

				// Reassign the turn to next player who is still in game
				variables[roomNum].turn = round.indexOf(nextPlayer);

				// Update the room status to main page
				if (players.indexOf(1) != -1) {
					rooms[roomNum].status = "Playing vs A.I.";
				} else {
					rooms[roomNum].status = "Playing vs players";
				}
				main.emit("roomList", {list: rooms});

				// Move to end of round if only one player left in round after drop
				game.to(roomNum).emit("resume");
				if (round.length == 1) {
					variables[roomNum].freeze = false;
					endOfRound(1);
				// Otherwise resumes the game
				} else {
					resume("Leavers dropped.");
				}
			}
		}, 30000);
	}

	socket.on("ready", function() {
		var ready = variables[roomNum].ready;
		if (ready.indexOf(socket.id) == -1) {
			ready.push(socket.id);
		}
		if (ready.length == 4) {
			rooms[roomNum].status = "Playing vs players";
			main.emit("roomList", {list: rooms});
			startGame();
		} else {
			var playerNames = [];
			for (var i = 0; i < ready.length; i ++) {
				playerNames.push(variables[roomNum].socketUserMap[ready[i]].original);
			}
			game.to(roomNum).emit("ready", {ready: playerNames});
		}
	});

	socket.on("ai", function() {
		rooms[roomNum].status = "Playing vs A.I.";
		main.emit("roomList", {list: rooms});
		var players = variables[roomNum].players;
		var ai = ["Jarvis", "Auto", "Skynet"];
		shuffle(ai);
		ai.splice(0, players.length-1);
		var aiNum = 1;
		var playerNames = [];
		for (var i = 0; i < players.length; i ++) {
			playerNames.push(variables[roomNum].socketUserMap[players[i]]);
		}
		for (var i = 0; i < ai.length; i ++) {
			players.push(aiNum);
			variables[roomNum].aiMap[aiNum] = ai[i];
			var type;
			if (ai[i] == "Auto") {
				type = ".jpeg";
			} else {
				type = ".jpg";
			}
			playerNames.push({profilePath: "static/img/" + ai[i].toLowerCase() + type, original: ai[i], score: 99999});
			aiNum++;
		}
		for (var i = 0; i < players.length; i++) {
			if (typeof(players[i]) != "number") {
				game.to(players[i]).emit("playerNames", {names: playerNames, index: i});
			}
		}
		startGame();
	});

	function startGame() {
		variables[roomNum].start = true;
		variables[roomNum].prevCombPlayerWon = ["playerName", false];
		variables[roomNum].prevPlayerPasses = false;
		variables[roomNum].oneMoreTurn = false;
		variables[roomNum].firstTurn = true;
		var players = variables[roomNum].players;
		var ready = variables[roomNum].ready;
		var round = variables[roomNum].round;
		var discarded = variables[roomNum].discarded;
		var winners = variables[roomNum].winners;
		var socketUserMap = variables[roomNum].socketUserMap;
		var p1Hand = variables[roomNum].p1Hand;
		var p2Hand = variables[roomNum].p2Hand;
		var p3Hand = variables[roomNum].p3Hand;
		var p4Hand = variables[roomNum].p4Hand;
		var pHandMap = variables[roomNum].pHandMap;
		var aiMap = variables[roomNum].aiMap;
		variables[roomNum].prevComb = [[], ""];
		ready.splice(0, ready.length);
		round.splice(0, round.length);
		discarded.splice(0, discarded.length);
		winners.splice(0, winners.length);
		p1Hand.splice(0, p1Hand.length);
		p2Hand.splice(0, p2Hand.length);
		p3Hand.splice(0, p3Hand.length);
		p4Hand.splice(0, p4Hand.length);
		variables[roomNum].logs = "Room Number: " + roomNum;
		variables[roomNum].logs += "\r\nRoom Name: " + rooms[roomNum].name;
		var time = getDate(1);
		variables[roomNum].logs += "\r\nGame Start: " + time;
		variables[roomNum].logs += "\r\n";
		variables[roomNum].logs += "\r\nPlayers";
		for (var i = 0; i < players.length; i++) {
			round.push(players[i]);
			if (typeof(players[i]) == "number") {
				variables[roomNum].logs += "\r\n" + aiMap[players[i]] + ": 99999 (A.I.)";
			} else {
				var user = socketUserMap[players[i]];
				variables[roomNum].logs += "\r\n" + user.original + ": " + user.score;  
			}
		}
		variables[roomNum].logs += "\r\n";
		shuffle(deck);
		for (var i = 0; i < deck.length; i+=4) {
			p1Hand.push(deck[i]);
			p2Hand.push(deck[i+1]);
			p3Hand.push(deck[i+2]);
			p4Hand.push(deck[i+3]);
		}
		p1Hand.sort();
		p2Hand.sort();
		p3Hand.sort();
		p4Hand.sort();

		// Uncomment following line for dubugging purpose
		// recreate(roomNum);

		pHandMap[players[0]] = p1Hand;
		pHandMap[players[1]] = p2Hand;
		pHandMap[players[2]] = p3Hand;
		pHandMap[players[3]] = p4Hand;
		if (p1Hand[0] == "01A") {
			variables[roomNum].turn = 0;
		} else if (p2Hand[0] == "01A") {
			variables[roomNum].turn = 1;
		} else if (p3Hand[0] == "01A") {
			variables[roomNum].turn = 2;
		} else {
			variables[roomNum].turn = 3;
		}
		variables[roomNum].logs += "\r\nPlayer Hands";
		for (var i = 0; i < players.length; i++) {
			if (typeof(players[i]) == "number") {
				analyzeAiHand(i);
				variables[roomNum].logs += "\r\n" + aiMap[players[i]] + ": [";
				variables[roomNum].logs += translateCards(pHandMap[players[i]][0]) + "]";
			} else {
				game.to(players[i]).emit("startingHand", {hand: pHandMap[players[i]]});
				variables[roomNum].logs += "\r\n" + socketUserMap[players[i]].original + ": [";
				variables[roomNum].logs += translateCards(pHandMap[players[i]]) + "]";
			}
		}
		variables[roomNum].logs += "\r\n";
		game.to(roomNum).emit("start");
		if (typeof(round[variables[roomNum].turn]) == "number") {
			game.to(roomNum).emit("currentTurn", {player: aiMap[round[variables[roomNum].turn]]});
		} else {
			var username = variables[roomNum].socketUserMap[round[variables[roomNum].turn]].original;
			game.to(roomNum).emit("currentTurn", {player: username});
		}
		setTimeout(function() {
			updatePlayersHand();
			if (typeof(round[variables[roomNum].turn]) == "number") {
				if (!variables[roomNum].freeze) {
					setTimeout(function() {aiTurn(variables[roomNum].turn);}, 1500);
				}
			}
		}, 1000);
	}

	function analyzeAiHand(aiIndex) {
		var pHandMap = variables[roomNum].pHandMap;
		var players = variables[roomNum].players;
		var hand = pHandMap[players[aiIndex]];
		var handType = {single:[], double:[], triple:[], run:[], bomb:[]};
		var currentCard = hand[0];
		var currentRank = hand[0].substring(0, 2);
		var bombDouble = false;
		var bombIndex = 0;
		var bombRun = 1;
		var count = 1;
		var temp = [currentCard];
		// Sort out bombs and 2's if they exist
		for (var i = 1; i < hand.length; i++) {
			var nextCard = hand[i];
			var nextRank = hand[i].substring(0, 2);
			if (nextRank != "13") {
				temp.push(nextCard);
				if (nextRank-currentRank == 1) {
					if (bombDouble) {            
						bombRun++;
						bombDouble = false;
					} else {
						bombRun = 1;
					}
					count = 1;
				} else if (currentRank == nextRank) {
					count++;
					if (bombRun == 1 && count == 2) {
						bombIndex = i - 1;
					}
					if (count == 4) {
						var last = temp.length-1;
						handType.bomb.push([temp[last-3], temp[last-2], temp[last-1], temp[last]]);
						temp.splice(last-3, 4);
						count = 1;
						bombDouble = false;
					} else if (bombRun == 3) {
						if (i+2 < hand.length && hand[i+1].substring(0,2) == currentRank && hand[i+2].substring(0,2) == currentRank) {
							bombRun = 1;
						} else {
							var max = temp.length - bombIndex;
							var bomb = [];
							for (var j = 0; j < max; j++) {
								if (bomb.length == 0 || bomb.length == 1 || bomb.length == 3 || bomb.length == 5) {
									bomb.push(temp[bombIndex]);
									temp.splice(bombIndex, 1);
								} else if (bomb.length == 2 || bomb.length == 4) {
									if (temp[bombIndex].substring(0,2) == bomb[bomb.length-1].substring(0,2)) {
										bombIndex++;
									} else {
										bomb.push(temp[bombIndex]);
										temp.splice(bombIndex, 1);
									}
								}
							}
							handType.bomb.push(bomb);
							bombDouble = false;
							bombRun = 1;
							count = 1;
						}
					} else {
						bombDouble = true;
					}
				} else {				
					bombDouble = false;
					bombRun = 1;
					count = 1;
				}
				currentCard = nextCard;
				currentRank = nextRank;
			} else {
				handType.single.push([nextCard]);
			}
		}
		handType.bomb.sort(function(a, b) {return a.length < b.length;});
		temp.push("20A"); 	// Dummy card to run for-loop one more time
		currentCard = temp[0];
		currentRank = temp[0].substring(0, 2);
		count = 1;
		var run = 1;
		var comb = [currentCard];
		var prevDoubleLength = 0;
		var prevTripleLength = 0;
		// Sort out single, double, triple, and run
		for (var i = 1; i < temp.length; i++) {
			var nextCard = temp[i];
			var nextRank = temp[i].substring(0, 2);
			if (nextRank-currentRank == 1) {
				run++;
				if (count > 1) {
					var last = comb.length-1;
					if (count == 2) {
						handType.double.push([comb[last-1], comb[last]]);
						comb.splice(last, 1);
					} else {
						handType.triple.push([comb[last-2], comb[last-1], comb[last]]);
						comb.splice(last-1, 2);
					}
					count = 1;
				}
			} else if (currentRank == nextRank) {
				count++;
			} else {
				if (count > 1) {
					var last = comb.length-1;
					if (count == 2) {
						handType.double.push([comb[last-1], comb[last]]);
						comb.splice(last, 1);
					} else {
						handType.triple.push([comb[last-2], comb[last-1], comb[last]]);
						comb.splice(last-1, 2);
					}
				}
				if (run >= 3) {
					var double = handType.double.length - prevDoubleLength;
					var triple = handType.triple.length - prevTripleLength;
					if (double > comb.length-(double+triple)) {
						for (var j = 0; j < comb.length; j++) {
							var found = false;
							for (var k = 0; k < handType.double.length; k++) {
								if (comb[j].substring(0,2) == handType.double[k][0].substring(0,2)) {
									found = true;
									break;
								}
							}
							if (!found) {
								for (var k = 0; k < handType.triple.length; k++) {
									if (comb[j].substring(0,2) == handType.triple[k][0].substring(0,2)) {
										found = true;
										break;
									}
								}
							}
							if (!found) {
								handType.single.push([comb[j]]);
							}
						}
					} else {
						var start = 1;
						var end = comb.length-1;
						if (comb.length == 3) {
							start = 0;
							end = comb.length;
						}
						for (var j = start; j < end; j++) {
							var found = false;
							for (var k = 0; k < handType.double.length; k++) {
								if (comb[j].substring(0,2) == handType.double[k][0].substring(0,2)) {
									handType.single.push([handType.double[k][1]]);
									handType.double.splice(k, 1);
									found = true;
									break;
								}
							}
							if (!found) {
								for (var k = 0; k < handType.triple.length; k++) {
									if (comb[j].substring(0,2) == handType.triple[k][0].substring(0,2)) {
										handType.double.push([handType.triple[k][1], handType.triple[k][2]]);
										handType.triple.splice(k, 1);
										found = true;
										break;
									}
								}
							}
						}
						handType.run.push(comb);
					}
				} else {
					var index = hand.indexOf(comb[0]);
					if (index == 12 || comb[0].substring(0, 2) != hand[index+1].substring(0, 2)) {
						handType.single.push([comb[0]]);
					}
					if (comb.length == 2 && count == 1) {
						handType.single.push([comb[1]]);
					}
				}
				prevDoubleLength = handType.double.length;
				prevTripleLength = handType.triple.length;
				count = 1;
				run = 1;
				comb = [];
			}
			comb.push(nextCard);
			currentCard = nextCard;
			currentRank = nextRank;
		}
		handType.single.sort(function(a, b) {return a[0] > b[0];});
		handType.double.sort(function(a, b) {return a[0] > b[0];});
		handType.triple.sort(function(a, b) {return a[0] > b[0];});
		pHandMap[players[aiIndex]] = [hand, handType];
	}

	function updatePlayersHand() {
		var players = variables[roomNum].players;
		var pHandMap = variables[roomNum].pHandMap;
		var p1Hand = variables[roomNum].p1Hand;
		var p2Hand = variables[roomNum].p2Hand;
		var p3Hand = variables[roomNum].p3Hand;
		var p4Hand = variables[roomNum].p4Hand;
		if (typeof(players[0]) != "number") {
			pHandMap[players[0]] = [p1Hand, p2Hand.length, p3Hand.length, p4Hand.length];
			game.to(players[0]).emit("playerHand", {hand: pHandMap[players[0]]});
		}
		if (typeof(players[1]) != "number") {
			pHandMap[players[1]] = [p2Hand, p3Hand.length, p4Hand.length, p1Hand.length];
			game.to(players[1]).emit("playerHand", {hand: pHandMap[players[1]]});
		}
		if (typeof(players[2]) != "number") {
			pHandMap[players[2]] = [p3Hand, p4Hand.length, p1Hand.length, p2Hand.length];
			game.to(players[2]).emit("playerHand", {hand: pHandMap[players[2]]});
		}
		if (typeof(players[3]) != "number") {
			pHandMap[players[3]] = [p4Hand, p1Hand.length, p2Hand.length, p3Hand.length];
			game.to(players[3]).emit("playerHand", {hand: pHandMap[players[3]]});
		}
	}

	// Decides the next move the ai
	function aiTurn(turn) {
		var round = variables[roomNum].round;
		var handType = variables[roomNum].pHandMap[round[turn]][1];
		var prevComb = variables[roomNum].prevComb;
		if (variables[roomNum].firstTurn) {
			variables[roomNum].firstTurn = false;
			if (handType.bomb.length != 0 && handType.bomb[0][0] == "01A") {
				nextTurn(handType.bomb[0], "bomb", round[turn]);
				handType.bomb.splice(0, 1);
			} else if (handType.run.length != 0 && handType.run[0][0] == "01A") {
				checkDuplicates(handType);
				nextTurn(handType.run[0], "run", round[turn]);
				handType.run.splice(0, 1);
			} else if (handType.triple.length != 0 &&  handType.triple[0][0] == "01A") {
				checkDuplicatesInRun(handType.triple[0][0], handType);
				nextTurn(handType.triple[0], "triple", round[turn]);
				handType.triple.splice(0, 1);
			} else if (handType.double.length != 0 &&  handType.double[0][0] == "01A") {
				checkDuplicatesInRun(handType.double[0][0], handType);
				nextTurn(handType.double[0], "double", round[turn]);
				handType.double.splice(0, 1);
			} else {
				nextTurn(handType.single[0], "single", round[turn]);
				handType.single.splice(0, 1);
			}
		} else if (prevComb[0].length == 0) {
			if (handType.single.length > 0 && handType.single[0][0].substring(0,2) == "01") {
				nextTurn(handType.single[0], "single", round[turn]);
				handType.single.splice(0, 1);
			} else if (handType.run.length > 0) {
				checkDuplicates(handType);
				nextTurn(handType.run[0], "run", round[turn]);
				handType.run.splice(0, 1);
			} else if (handType.triple.length > 0) {
				checkDuplicatesInRun(handType.triple[0][0], handType);
				nextTurn(handType.triple[0], "triple", round[turn]);
				handType.triple.splice(0, 1);
			} else if (handType.double.length > 0) {
				checkDuplicatesInRun(handType.double[0][0], handType);
				nextTurn(handType.double[0], "double", round[turn]);
				handType.double.splice(0, 1);
			} else if (handType.single.length > 0) {
				nextTurn(handType.single[0], "single", round[turn]);
				handType.single.splice(0, 1);
			} else {
				nextTurn(handType.bomb[0], "bomb", round[turn]);
				handType.bomb.splice(0, 1);
			}
		} else {
			var beat = false;
			var type = prevComb[1];
			if (type == "bomb" && handType.bomb.length > 0) {
				var last = prevComb[0].length-1;
				var prev = prevComb[0][last].substring(0, 2);
				for (var i = 0; i < handType.bomb.length; i++) {
					if (prevComb[0].length == 6 && handType.bomb[i].length == 4) {
						nextTurn(handType.bomb[i], "bomb", round[turn]);
						handType.bomb.splice(i, 1);
						beat = true;
						break;
					} else if (prevComb[0].length == handType.bomb[i].length) {
						last = handType.bomb[i].length-1;
						var current = handType.bomb[i][last].substring(0, 2);
						if (current-prev > 0) {
							nextTurn(handType.bomb[i], "bomb", round[turn]);
							handType.bomb.splice(i, 1);
							beat = true;
							break;
						}
					}
				}
			} else if (type == "run") {
				var last = prevComb[0].length-1;
				var prev = prevComb[0][last].substring(0, 2);
				for (var i = 0; i < handType.run.length; i++) {
					last = handType.run[i].length-1;
					var current = handType.run[i][last].substring(0, 2);
					var indices = {};
					if (current-prev > 0 && prevComb[0].length <= handType.run[i].length) {
						for (var j = 0; j < handType.run[i].length; j++) {
							current = handType.run[i][j].substring(0, 2);
							if (current-prevComb[0][0].substring(0,2) > 0) {
								indices.start = j;
								break;
							}
						}
						indices.end = indices.start + prevComb[0].length - 1;
						for (var j = 0; j < handType.double.length; j++) {
							if (handType.double[j][0] == handType.run[i][0]) {
								indices.first = ["double", j];
							} else if (handType.double[j][0] == handType.run[i][last]) {
								indices.last = ["double", j];
							}
						}
						for (var j = 0; j < handType.triple.length; j++) {
							if (handType.triple[j][0] == handType.run[i][0]) {
								indices.first = ["triple", j];
							} else if (handType.triple[j][0] == handType.run[i][last]) {
								indices.last = ["triple", j];
							}
						}
						for (var j = indices.end; j < handType.run[i].length; j++) {
							if (indices.start == 0 || (indices.start == 1 && indices.first != undefined) || indices.start > 2) {
								if (indices.end == handType.run[i].length-1 || (indices.end == last-1 && indices.last != undefined) || handType.run[i].length-indices.end > 3) {
									if (indices.start == 0 && indices.first != undefined) {
										var index = indices.first[1];
										if (indices.first[0] == "double") {
											handType.single.push([handType.double[index][1]]);
											if (indices.last != undefined && indices.last[0] == "double") {
												indices.last[1] -= 1;
											}
											handType.double.splice(index, 1);
										} else {
											handType.double.push([handType.triple[index][1], handType.triple[index][2]]);
											if (indices.last != undefined && indices.last[0] == "triple") {
												indices.last[1] -= 1;
											}
											handType.triple.splice(index, 1);
										}
									}
									if (indices.end == handType.run[i].length-1 && indices.last != undefined) {
										var index = indices.last[1];
										if (indices.last[0] == "double") {
											handType.single.push([handType.double[index][1]]);
											handType.double.splice(index, 1);
										} else {
											handType.double.push([handType.triple[index][1], handType.triple[index][2]]);
											handType.triple.splice(index, 1);
										}
									}
									var cards = [];
									for (var k = indices.start; k <= indices.end; k++) {
										cards.push(handType.run[i][k]);
									}
									if (indices.end == last-1 && indices.last != undefined) {
										handType.run[i].splice(last, 1);
									}
									var length = indices.end - indices.start + 1;
									handType.run[i].splice(indices.start, length);
									if (indices.start == 1 && indices.first != undefined) {
										handType.run[i].splice(0, 1);
									} else if (indices.start > 2) {
										if (indices.start == 3 && indices.first != undefined) {
											var index = indices.first[1];
											if (indices.first[0] == "double") {
												handType.single.push([handType.double[index][1]]);
												handType.double.splice(index, 1);
											} else {
												handType.double.push([handType.triple[index][1], handType.triple[index][2]]);
												handType.triple.splice(index, 1);
											}
				  						}
										var temp = [];
										for (var k = 0; k < indices.start; k++) {
											temp.push(handType.run[i][k]);
										}
										handType.run[i].splice(0, indices.start);
										handType.run.push(temp);
										handType.run.sort(function(a, b) {return a[0] > b[0];});
									}
									if (handType.run[i].length == 0) {
										handType.run.splice(i, 1);
									} else if (handType.run[i].length == 3 && indices.last != undefined) {
										var index = indices.last[1];
										if (indices.last[0] == "double") {
											handType.single.push([handType.double[index][1]]);
											handType.double.splice(index, 1);
										} else {
											handType.double.push([handType.triple[index][1], handType.triple[index][2]]);
											handType.triple.splice(index, 1);
										}
									}
									handType.single.sort(function(a, b) {return a[0] > b[0];});
									handType.double.sort(function(a, b) {return a[0] > b[0];});
									nextTurn(cards, "run", round[turn]);
									beat = true;
									break;
								}
							}
							indices.start += 1;
							indices.end += 1;
						}
						if (beat) {
							break;
						}
					}
				}
				if (!beat && prevComb[0].length >= 5 && handType.bomb.length > 0) {
					nextTurn(handType.bomb[0], "bomb", round[turn]);
					handType.bomb.splice(0, 1);
					beat = true;
				}
			} else if (type == "triple") {
				var rank = prevComb[0][0].substring(0,2);
				for (var i = 0; i < handType.triple.length; i++) {
					if (handType.triple[i][0].substring(0,2)-rank > 0) {
						checkDuplicatesInRun(handType.triple[i][0], handType);
						nextTurn(handType.triple[i], "triple", round[turn]);
						handType.triple.splice(i, 1);
						beat = true;
						break;
					}
				}
				if (!beat && (rank == "12" || rank == "11" || rank == "10") && handType.bomb.length > 0) {
					nextTurn(handType.bomb[0], "bomb", round[turn]);
					handType.bomb.splice(0, 1);
					beat = true;
				}
			} else if (type == "double") {
				var rank = prevComb[0][0].substring(0,2);
				for (var i = 0; i < handType.double.length; i++) {
					if (handType.double[i][0].substring(0,2)-rank > 0) {
						checkDuplicatesInRun(handType.double[i][0], handType);
						nextTurn(handType.double[i], "double", round[turn]);
						handType.double.splice(i, 1);
						beat = true;
						break;
					}
				}
				if (!beat && (rank == "12" || rank == "11") && handType.bomb.length > 0) {
					nextTurn(handType.bomb[0], "bomb", round[turn]);
					handType.bomb.splice(0, 1);
					beat = true;
				}
			} else if (type == "single") {
				var rank = prevComb[0][0].substring(0,2);
				for (var i = 0; i < handType.single.length; i++) {
					if (handType.single[i][0].substring(0,2)-rank == 0) {
						var prevSuit = prevComb[0][0].substring(2, 3);
						var currentSuit = handType.single[i][0].substring(2, 3);
						if (currentSuit > prevSuit) {
							nextTurn(handType.single[i], "single", round[turn]);
							handType.single.splice(i, 1);
							beat = true;
							break;
						}
					} else if (handType.single[i][0].substring(0,2)-rank > 0) {
						nextTurn(handType.single[i], "single", round[turn]);
						handType.single.splice(i, 1);
						beat = true;
						break;
					} 
				}
				if (!beat && prevComb[0][0] == "13D" && handType.bomb.length > 0) {
					nextTurn(handType.bomb[0], "bomb", round[turn]);
					handType.bomb.splice(0, 1);
					beat = true;
				}
			}
			if (!beat) {
				passTurn(round[turn]);
			}
		}
	}

	// Check for duplicates in doubles and triples when playing a run
	function checkDuplicates(handType) {
		var last = handType.run[0].length-1;
		for (var i = 0; i < handType.double.length; i++) {
			if (handType.run[0][0] == handType.double[i][0]) {
				handType.single.push([handType.double[i][1]]);
				handType.double.splice(i, 1);
				i--;
			} else if (handType.run[0][last] == handType.double[i][0]) {
				handType.single.push([handType.double[i][1]]);
				handType.double.splice(i, 1);
			}
		}
		for (var i = 0; i < handType.triple.length; i++) {
			if (handType.run[0][0] == handType.triple[i][0]) {
				handType.double.push([handType.triple[i][1], handType.triple[i][2]]);
				handType.triple.splice(i, 1);
				i--;
			} else if (handType.run[0][last] == handType.triple[i][0]) {
				handType.double.push([handType.triple[i][1], handType.triple[i][2]]);
				handType.triple.splice(i, 1);
			}
		}
		handType.double.sort(function(a, b) {return a[0] > b[0];});
		handType.single.sort(function(a, b) {return a[0] > b[0];});
	}

	// Check for duplicates in runs when playing a double or a triple
	function checkDuplicatesInRun(card, handType) {
		for (var i = 0; i < handType.run.length; i++) {
			var last = handType.run[i].length-1;
			if (handType.run[i][0] == card) {
				handType.run[i].splice(0, 1);
				if (handType.run[i].length == 3) {
					last -= 1;
					var lastCard = handType.run[i][last];
					for (var j = 0; j < handType.double.length; j++) {
						if (handType.double[j][0] == lastCard) {
							handType.single.push([handType.double[j][1]]);
							handType.double.splice(j, 1);
						}
					}
					for (var j = 0; j < handType.triple.length; j++) {
						if (handType.triple[j][0] == lastCard) {
							handType.double.push([handType.triple[j][1], handType.triple[j][2]]);
							handType.triple.splice(j, 1);
						}
					}
				}
				break;
			} else if (handType.run[i][last] == card) {
				handType.run[i].splice(last, 1);
				if (handType.run[i].length == 3) {
					var firstCard = handType.run[i][0];
					for (var j = 0; j < handType.double.length; j++) {
						if (handType.double[j][0] == firstCard) {
							handType.single.push([handType.double[j][1]]);
							handType.double.splice(j, 1);
						}
					}
					for (var j = 0; j < handType.triple.length; j++) {
						if (handType.triple[j][0] == firstCard) {
							handType.double.push([handType.triple[j][1], handType.triple[j][2]]);
							handType.triple.splice(j, 1);
						}
					}
				}
				break;
			}
		}
	}

	socket.on("play", function(data) {
		if (socket.id == variables[roomNum].round[variables[roomNum].turn] && !variables[roomNum].freeze) {
			// Check for combination type
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
			// Check if current combination beats previous combination
			if (type != "none") {
				var prevComb = variables[roomNum].prevComb;
				if (prevComb[0].length == 0) {
					if (variables[roomNum].firstTurn && data.selected[0] != "01A") {
						errorMsg("You must include spades of 3 on first turn.");
					} else {
						variables[roomNum].firstTurn = false;
						nextTurn(data.selected, type, socket.id);
					}
				} else {
					if (type == "bomb") {
						if (prevComb[1] == type) {
							if (prevComb[0].length == 6 && data.selected.length == 4) {
								nextTurn(data.selected, type, socket.id);
							} else if (prevComb[0].length == data.selected.length) {
								var last = prevComb[0].length-1;
								var prev = prevComb[0][last].substring(0, 2);
								last = data.selected.length-1;
								var current = data.selected[last].substring(0, 2);
								if (current-prev > 0) {
									nextTurn(data.selected, type, socket.id);
								} else {
									errorMsg("Please choose a higher bomb.");
								}
							} else {
								errorMsg("Triple straight cannot beat four of a kind.");
							}
						} else {
							nextTurn(data.selected, type, socket.id);
						}
					} else if (prevComb[1] == type) {
						if (type == "single") {
							var prev = prevComb[0][0].substring(0, 2);
							var current = data.selected[0].substring(0, 2);
							if (current-prev > 0) {
								nextTurn(data.selected, type, socket.id);
							} else if (current-prev == 0) {
								var prevSuit = prevComb[0][0].substring(2, 3);
								var currentSuit = data.selected[0].substring(2, 3);
								if (currentSuit > prevSuit) {
									nextTurn(data.selected, type, socket.id);
								} else {
									errorMsg("Please choose a higher suit.");
								}
							} else {
								errorMsg("Please choose a higher " + type + ".");
							}
						} else if (type == "double" || type == "triple") {
							var prev = prevComb[0][0].substring(0, 2);
							var current = data.selected[0].substring(0, 2);
							if (current-prev > 0) {
								nextTurn(data.selected, type, socket.id);
							} else {
								errorMsg("Please choose a higher " + type + ".");
							}
						} else if (type == "run") {
							if (prevComb[0].length == data.selected.length) {
								var last = prevComb[0].length-1;
								var prev = prevComb[0][last].substring(0, 2);
								last = data.selected.length-1;
								var current = data.selected[last].substring(0, 2);
								if (current-prev > 0) {
									nextTurn(data.selected, type, socket.id);
								} else {
									errorMsg("Please choose a higher straight.");
								}
							} else {
								errorMsg("Please choose same number of cards to macth the straight.");
							}
						}
					} else {
						errorMsg("Please choose a combination that matches previous combination.");
					}
				}
			} else {
				errorMsg("Please choose a correct combination.");
			}
		}
	});

	function nextTurn(selected, type, id) {
		// Server side logs
		var result = translateCards(selected);
		if (typeof(id) == "number") {
			result = variables[roomNum].aiMap[id] + " plays [" + result + "].";
		} else {
			var user = variables[roomNum].socketUserMap[id].original;
			result = user + " plays [" + result + "].";
		}
		variables[roomNum].logs += "\r\n" + result;

		socket.emit("stopTimer");
		if (variables[roomNum].prevCombPlayerWon[1]) {
			variables[roomNum].prevCombPlayerWon = ["playerName", false];
		}
		if (variables[roomNum].passedOnNewRound[1]) {
			variables[roomNum].passedOnNewRound = ["playerName", false];
		}
		var discarded = variables[roomNum].discarded;
		var prevComb = variables[roomNum].prevComb;
		var round = variables[roomNum].round;
		var winners = variables[roomNum].winners;
		var players = variables[roomNum].players;
		var aiMap = variables[roomNum].aiMap;
		var prevDiscardedLength = discarded.length;
		var delay = 1200;
		if (prevComb.length != 0) {
			delay = 1600;
			for (var i = 0; i < prevComb[0].length; i++) {
				discarded.push(prevComb[0][i]);
			}
		}
		prevComb.splice(0, prevComb.length);
		prevComb.push(selected);
		prevComb.push(type);
		var hand = variables[roomNum].pHandMap[id][0];
		var randomIndices = [];
		for (var i = 0; i < hand.length; i++) {
			randomIndices.push(i);
		}			
		for (var i = 0; i < selected.length; i++) {
			var index = hand.indexOf(selected[i]);
			hand.splice(index, 1);
		}
		if (hand.length == 0) {
			var index = round.indexOf(id);
			round.splice(index, 1);
			winners.push(id);
			if (typeof(id) == "number") {
				variables[roomNum].logs += "\r\n" + aiMap[id] + " wins and is added to winner's list.";
			} else {
				variables[roomNum].logs += "\r\n" + variables[roomNum].socketUserMap[id].original + " wins and is added to winner's list.";
			}
			variables[roomNum].prevCombPlayerWon = [id, true];
			if (winners.length == 3) {
				winners.push(round[0]);
			}
		} else {
			variables[roomNum].turn++;
		}
		if (variables[roomNum].turn == round.length) {
			variables[roomNum].turn = 0;
		}		
		shuffle(randomIndices);
		randomIndices = randomIndices.slice(0, selected.length);
		randomIndices.sort(function(a, b) {return a > b;});
		var index = players.indexOf(id);
		var direction = ["bottom", "left", "top", "right"];
		for (var i = 0; i < 4; i++) {
			if (index == 4) {
				index = 0;
			}
			if (typeof(players[index]) != "number") {
				game.to(players[index]).emit("animateCards", {indices: randomIndices, direction: direction[i]});
			}
			index++;
		}
		setTimeout(function() {
			game.to(roomNum).emit("animateDiscard", {discarded: prevDiscardedLength});
		}, 1000);
		setTimeout(function() {
			// End of game
			if (winners.length == 4) {
				var endTime = getDate(1);
				variables[roomNum].logs += "\r\n";
				variables[roomNum].logs += "\r\nGame End: " + endTime;
				variables[roomNum].logs += "\r\nEnd of Game";
				endTime = getDate(2);
				updatePlayersHand();
				game.to(roomNum).emit("cardsPlayed", {played: selected});
				game.to(roomNum).emit("cardsDiscarded", {discarded: discarded});
				setTimeout(function() {
					game.to(roomNum).emit("animateDiscard", {discarded: discarded.length});
					for (var i = 0; i < selected.length; i++) {
						discarded.push(selected[i]);
					}
				}, 200);
				setTimeout(function() {	
					game.to(roomNum).emit("cardsDiscarded", {discarded: discarded});
					var socketUserMap = variables[roomNum].socketUserMap;
					var pHandMap = variables[roomNum].pHandMap;
					var leavers = variables[roomNum].leavers;
					var winnersUsername = [];
					var scoresArr = [];
					var halfScore = false;
					if (winners.indexOf(3) != -1) {
						halfScore = true;
					}
					for (var i = 0; i < winners.length; i++) {
						if (typeof(winners[i]) != "number") {
							var user = socketUserMap[winners[i]];
							if (leavers.indexOf(user.original) != -1) {
								var temp = winners[i];
								winners.splice(i, 1);
								winners.push(temp);
							}
						}
					}
					for (var i = 0; i < winners.length; i++) {
						var score;
						if (typeof(winners[i]) == "number") {
							winnersUsername.push(aiMap[winners[i]]);
							score = 50-i*20;
							if (score < 0) {
								score = 0;
							}
							if (halfScore) {
								score = score/2;
							}
							scoresArr.push(" +" + score);
							variables[roomNum].logs += "\r\n" + aiMap[winners[i]] + ": +" + score;
						} else {
							var user = socketUserMap[winners[i]];
							var text = "\r\n" + user.original + ": " + user.score;
							if (leavers.indexOf(user.original) == -1) {
								score = 50-i*20;
								if (score < 0) {
									score = 0;
								}
								if (halfScore) {
									score = score/2;
								}
								user.score += score;
								scoresArr.push(" +" + score);
								Users.update({username: user.username}, {score: user.score}, function(err) {});
								text += " +" + score + " = " + user.score;
							} else {
								score = 0;
								user.score -= 50;
								if (user.score < 0) {
									user.score = 0;
								}
								scoresArr.push(" -50");
								text += " -" + score + " = " + user.score;
							}
							winnersUsername.push(user.original);
							variables[roomNum].logs += text;
						}
					}
					for (var i = 0; i < players.length; i++) {
						if (typeof(players[i]) == "number") {
							players.splice(i, 1);
							i--;
						} else {
							var user = socketUserMap[players[i]];
							if (leavers.indexOf(user.original) != -1) {
								delete socketUserMap[players[i]];
								delete pHandMap[players[i]];
								players.splice(i, 1);
								i--;
							}
						}
					}
					variables[roomNum].creator = players[0];
					var usernames = [];
					for (var i = 0; i < players.length; i ++) {
						usernames.push(variables[roomNum].socketUserMap[players[i]]);
					}
					for (var i = 0; i < players.length; i++) {
						game.to(players[i]).emit("playerNames", {names: usernames, index: i});
					}
					game.to(roomNum).emit("end", {winners: winnersUsername, score: scoresArr});
					variables[roomNum].start = false;
					aiButton();
					rooms[roomNum].status = "Waiting";
					main.emit("roomList", {list: rooms});

					// Save the game logs
					var filename = 10000 + roomNum;
					filename = filename + "_" + endTime;
					fs.writeFile("server/logs/" + filename + ".txt", variables[roomNum].logs, function(err) {});
				}, 600);
			// Move to the next player
			} else {
				updatePlayersHand();
				game.to(roomNum).emit("cardsDiscarded", {discarded: discarded});
				game.to(roomNum).emit("cardsPlayed", {played: selected});
				var turn = variables[roomNum].turn;
				if (round.length == 0) {
					endOfRound(2);
				} else if (round.length == 1 && variables[roomNum].prevPlayerPasses) {
					variables[roomNum].prevPlayerPasses = false;
					endOfRound(1);
				} else if (round.length == 1 && variables[roomNum].prevCombPlayerWon[1]) {
					variables[roomNum].oneMoreTurn = true;
					if (typeof(round[turn]) == "number") {
						game.to(roomNum).emit("currentTurn", {player: aiMap[round[turn]]});
						if (!variables[roomNum].freeze) {
							setTimeout(function() {aiTurn(turn);}, 1500);
						}
					} else {
						var username = variables[roomNum].socketUserMap[round[variables[roomNum].turn]].original;
						game.to(roomNum).emit("currentTurn", {player: username});
					}
				} else if (round.length == 1 && variables[roomNum].oneMoreTurn) {
					variables[roomNum].oneMoreTurn = false;
					endOfRound(1);
				} else {
					if (typeof(round[turn]) == "number") {
						game.to(roomNum).emit("currentTurn", {player: aiMap[round[turn]]});
						if (!variables[roomNum].freeze) {
							setTimeout(function() {aiTurn(turn);}, 1500);
						}
					} else {
						var username = variables[roomNum].socketUserMap[round[variables[roomNum].turn]].original;
						game.to(roomNum).emit("currentTurn", {player: username});
					}
				}
			}
		}, delay);
	}

	function errorMsg(msg) {
		socket.emit("wrongCards", {response: msg});
	}

	socket.on("passTurn", function() {
		if (socket.id == variables[roomNum].round[variables[roomNum].turn] && !variables[roomNum].freeze) {
			passTurn(socket.id);
		}
	});

	function passTurn(id) {
		// Server side logs
		if (typeof(id) == "number") {
			variables[roomNum].logs += "\r\n" + variables[roomNum].aiMap[id] + " passes.";
		} else {
			variables[roomNum].logs += "\r\n" + variables[roomNum].socketUserMap[id].original + " passes.";
		}

		variables[roomNum].firstTurn = false;
		var prevComb = variables[roomNum].prevComb;
		var round = variables[roomNum].round;
		var prevCombPlayerWon = variables[roomNum].prevCombPlayerWon;
		if (prevComb[0].length == 0 && !variables[roomNum].passedOnNewRound[1]) {
			variables[roomNum].passedOnNewRound = [id, true];
		}
		var index = round.indexOf(id);
		round.splice(index, 1);
		if (variables[roomNum].turn == round.length) {
			variables[roomNum].turn = 0;
		}
		if (round.length == 0 && prevComb[0].length == 0) {
			endOfRound(3);
		} else if (round.length == 0) {
			variables[roomNum].oneMoreTurn = false;
			endOfRound(2);
		} else if (round.length == 1 && !prevCombPlayerWon[1] && prevComb[0].length != 0) {
			endOfRound(1);
		} else {
			if (round.length == 1 && prevCombPlayerWon[1]) {
				variables[roomNum].prevPlayerPasses = true;
			}
			var turn = variables[roomNum].turn;
			if (typeof(round[turn]) == "number") {
				game.to(roomNum).emit("currentTurn", {player: variables[roomNum].aiMap[round[turn]]});
				if (!variables[roomNum].freeze) {
					setTimeout(function() {aiTurn(turn);}, 1500);
				}
			} else {
				var username = variables[roomNum].socketUserMap[round[variables[roomNum].turn]].original;
				game.to(roomNum).emit("currentTurn", {player: username});
			}
		}
	}

	function endOfRound(msg) {
		variables[roomNum].logs += "\r\n" + "End of Round.";
		variables[roomNum].logs += "\r\n";
		var round = variables[roomNum].round;
		var players = variables[roomNum].players;
		var discarded = variables[roomNum].discarded;
		var player = round[0];
		round.pop();
		for (var i = 0; i < players.length; i++) {
			if (variables[roomNum].winners.indexOf(players[i]) == -1) {
				round.push(players[i]);
			}
		}
		if (variables[roomNum].prevCombPlayerWon[1]) {
			var index = players.indexOf(variables[roomNum].prevCombPlayerWon[0]);
			do {
				index++;
				if (index == players.length) {
					index = 0;
				}
				player = players[index];
			} while (round.indexOf(player) == -1);
			variables[roomNum].turn = round.indexOf(player);
			variables[roomNum].prevCombPlayerWon = ["playerName", false];
		} else if (msg == 3) {
			variables[roomNum].turn = round.indexOf(variables[roomNum].passedOnNewRound[0]);
			variables[roomNum].passedOnNewRound = ["playerName", false];
		} else {
			variables[roomNum].turn = round.indexOf(player);
		}
		var prevDiscardedLength = discarded.length;
		for (var i = 0; i < variables[roomNum].prevComb[0].length; i++) {
			discarded.push(variables[roomNum].prevComb[0][i]);
		}
		variables[roomNum].prevComb = [[], ""];
		setTimeout(function() {
			game.to(roomNum).emit("animateDiscard", {discarded: prevDiscardedLength});
		}, 200);
		setTimeout(function() {
			game.to(roomNum).emit("cardsDiscarded", {discarded: discarded});
			var turn = variables[roomNum].turn;
			if (typeof(round[turn]) == "number") {
				game.to(roomNum).emit("newRound", {player: variables[roomNum].aiMap[round[turn]], msg: msg});
				if (!variables[roomNum].freeze) {
					setTimeout(function() {aiTurn(turn);}, 1500);
				}
			} else {
				var username = variables[roomNum].socketUserMap[round[variables[roomNum].turn]].original;
				game.to(roomNum).emit("newRound", {player: username, msg: msg});
			}
		}, 800);
	}

	socket.on("newMsg", function(data) {
		var username = variables[roomNum].socketUserMap[socket.id].original;
		game.to(roomNum).emit("newChat", {user: username, chat: data.chat});
	});
});

// Returns the current date and time in a format of 1)YYYY/MM/DD HH:MM:SS or 2)YYYY-MM-DD_HH-MM-SS
function getDate(type) {
	var d = new Date();
	var date = d.getFullYear();
	var m = d.getMonth()+1;
	if (m < 10) {
		m = "0" + m;
	}
	var da = d.getDate();
	if (da < 10) {
		da = "0" + da;
	}
	var h = d.getHours();
	if (h < 10) {
		h = "0" + h;
	}
	var min = d.getMinutes();
	if (min < 10) {
		min = "0" + min;
	}
	var s = d.getSeconds();
	if (s < 10) {
		s = "0" + s;
	}
	if (type == 1) {
		date += "/" + m + "/" + da + " " + h + ":" + min + ":" + s;
	} else {
		date += "-" + m + "-" + da + "_" + h + "-" + min + "-" + s;
	}
	return date;
}

// Translates the cards' rank and suit to actual values for game logs
function translateCards(cards) {
	var result = "";
	for (var i = 0; i < cards.length; i++) {
		var card = cards[i];
		var s = "";
		if (card.substring(0, 2) == "01") {
			s += "3";
		} else if (card.substring(0, 2) == "02") {
			s += "4";
		} else if (card.substring(0, 2) == "03") {
			s += "5";
		} else if (card.substring(0, 2) == "04") {
			s += "6";
		} else if (card.substring(0, 2) == "05") {
			s += "7";
		} else if (card.substring(0, 2) == "06") {
			s += "8";
		} else if (card.substring(0, 2) == "07") {
			s += "9";
		} else if (card.substring(0, 2) == "08") {
			s += "10";
		} else if (card.substring(0, 2) == "09") {
			s += "J";
		} else if (card.substring(0, 2) == "10") {
			s += "Q";
		} else if (card.substring(0, 2) == "11") {
			s += "K";
		} else if (card.substring(0, 2) == "12") {
			s += "A";
		} else {
			s += "2";
		}

		if (card.substring(2, 3) == "A") {
			s += "S";
		} else if (card.substring(2, 3) == "B") {
			s += "C";
		} else if (card.substring(2, 3) == "C") {
			s += "D";
		} else {
			s += "H";
		}

		if (i < cards.length-1) {
			result += s + ", ";
		} else {
			result += s;
		}
	}
	return result;
}

// Example of debugging by recreating the same situation based on game logs
function recreate(roomNum) {
	// Copy and paste the starting hands from game log
	var p1 = reverseTranslate("[3S, 5D, 6S, 6C, 9C, 9D, 10S, JH, QD, QH, AC, AD, 2D]");
	var p2 = reverseTranslate("[3D, 6H, 8S, 8H, 9H, 10C, JS, JD, KH, AH, 2S, 2C, 2H]");
	var p3 = reverseTranslate("[4S, 4H, 5S, 5C, 5H, 6D, 7S, 8C, 10D, 10H, JC, KC, AS]");
	var p4 = reverseTranslate("[3C, 3H, 4C, 4D, 7C, 7D, 7H, 8D, 9S, QS, QC, KS, KD]");
	var p1Hand = variables[roomNum].p1Hand;
	var p2Hand = variables[roomNum].p2Hand;
	var p3Hand = variables[roomNum].p3Hand;
	var p4Hand = variables[roomNum].p4Hand;
	p1Hand.splice(0, p1Hand.length);
	p2Hand.splice(0, p2Hand.length);
	p3Hand.splice(0, p3Hand.length);
	p4Hand.splice(0, p4Hand.length);
	for (var i = 0; i < 13; i++) {
		p1Hand.push(p1[i]);
		p2Hand.push(p2[i]);
		p3Hand.push(p3[i]);
		p4Hand.push(p4[i]);
	}
}

// Translates the cards' rank and suit back to game values for debugging purpose
function reverseTranslate(s) {
	var result = [];
	for (var i = 0; i < s.length; i++) {
		if (s.charAt(i) == "," || s.charAt(i) == "]") {
			if (s.charAt(i-3) == " " || s.charAt(i-3) == "[") {
				result.push(rtHelper(s.substring(i-2, i)));
			} else {
				result.push(rtHelper(s.substring(i-3, i)));
			}
		}
	}
	return result;
}

// Helper function for the reverseTranslate function
function rtHelper(card) {
	var result = "";
	if (card.length == 3) {
		result += "08";
		if (card.substring(2, 3) == "S") {
			result += "A";
		} else if (card.substring(2, 3) == "C") {
			result += "B";
		} else if (card.substring(2, 3) == "D") {
			result += "C";
		} else {
			result += "D";
		}
	} else {
		if (card.substring(0, 1) == "3") {
			result += "01";
		} else if (card.substring(0, 1) == "4") {
			result += "02";
		} else if (card.substring(0, 1) == "5") {
			result += "03";
		} else if (card.substring(0, 1) == "6") {
			result += "04";
		} else if (card.substring(0, 1) == "7") {
			result += "05";
		} else if (card.substring(0, 1) == "8") {
			result += "06";
		} else if (card.substring(0, 1) == "9") {
			result += "07";
		} else if (card.substring(0, 1) == "J") {
			result += "09";
		} else if (card.substring(0, 1) == "Q") {
			result += "10";
		} else if (card.substring(0, 1) == "K") {
			result += "11";
		} else if (card.substring(0, 1) == "A") {
			result += "12";
		} else {
			result += "13";
		}

		if (card.substring(1, 2) == "S") {
			result += "A";
		} else if (card.substring(1, 2) == "C") {
			result += "B";
		} else if (card.substring(1, 2) == "D") {
			result += "C";
		} else {
			result += "D";
		}
	}

	return result;
}

}