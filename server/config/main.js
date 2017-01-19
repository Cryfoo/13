var mongoose = require("mongoose");
var Users = mongoose.model("Users");

module.exports = function(main, rooms, userLogin, variables) {

// Room number counter
var counter = 1;
// List of connected users on main page
var users = [];

// Sockets for namespace of main
main.on("connection", function(socket) {
	var username;
	// Initialization when a player connects
	socket.on("userConnected", function(data) {
		username = data.user.original;
		if (users.indexOf(username) == -1) {
			users.push(username);
		}
		if (!userLogin[username]) {
			userLogin[username] = {logout: false, logoutTimer: null};
		} else {
			clearTimeout(userLogin[username].logoutTimer);
		}
		console.log(username + " connected to main page.");
		main.emit("userList", {list: users});
		socket.emit("roomList", {list: rooms});
	});

	socket.on("disconnect", function() {
		users.splice(users.indexOf(username), 1);
		main.emit("userList", {list: users});
		console.log(username + " disconnected from main page.");
		if (!userLogin[username].logout) {
			userLogin[username].logoutTimer = setTimeout(function() {
				Users.update({username: username.toLowerCase()}, {loggedIn: false}, function(err) {
					console.log(username + " logged out.");
					delete userLogin[username];
				});
			}, 5000);
		} else {
			delete userLogin[username];
		}
	});

	socket.on("logout", function() {
		userLogin[username].logout = true;
	});

	socket.on("newRoom", function(data) {
		rooms[counter] = {num: counter, name: data.roomname, status: "Waiting", players: [username]};
		if (!variables[counter]) {
			generateVariables(counter);
		}
		socket.emit("join", {roomNum: counter});
		main.emit("roomList", {list: rooms});
		counter++;
	});

	socket.on("joinRoom", function(data) {
		rooms[data.num].players.push(username);
		main.emit("roomList", {list: rooms});
	});

	socket.on("newMsg", function(data) {
		main.emit("newChat", {user: username, chat: data.chat});
	});
});

// Generates variables for the given room number
function generateVariables(roomNum) {
	variables[roomNum] = {};

	variables[roomNum].creator = ""; 	// Socket ID of the room creator
	variables[roomNum].players = []; 	// Turn order of socket ID of 4 players in current game
	variables[roomNum].ready = [];		// List of socket ID of players who are ready to start game
	variables[roomNum].round = []; 		// List of socket ID of players remaining in current round
	variables[roomNum].winners = []; 	// List of socket ID of winners in order
	variables[roomNum].dc = []; 			// List of players disconnected during game
	variables[roomNum].leavers = [];		// List of players who did not reconnect after dc
	variables[roomNum].turn = 0;			// Indicator for current player's turn

	// Various flags for special cases
	variables[roomNum].prevCombPlayerWon = ["playerName", false];
	variables[roomNum].passedOnNewRound = ["playerName", false];
	variables[roomNum].prevPlayerPasses = false; 	
	variables[roomNum].oneMoreTurn = false;
	variables[roomNum].firstTurn = true;
	variables[roomNum].start = false;
	variables[roomNum].freeze = false;
	variables[roomNum].freezeTimer;

	variables[roomNum].p1Hand = [];
	variables[roomNum].p2Hand = [];
	variables[roomNum].p3Hand = [];
	variables[roomNum].p4Hand = [];
	variables[roomNum].pHandMap = {}; 	// Maps each player's socket ID to a hand
	variables[roomNum].socketUserMap = {}; // Maps each socket ID to a user's info
	variables[roomNum].prevComb = []; 	// Previous combination in a format of [[comb], type]
	variables[roomNum].discarded = [];  // Pile of discarded cards
	variables[roomNum].aiMap = {};		// Maps AI's index to a name
	variables[roomNum].logs = "";			// Records logs for each game
}

}