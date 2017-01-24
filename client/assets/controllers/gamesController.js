app.controller("gamesController", ["$scope", "usersFactory", "$routeParams", "$location", "socket", "$uibModal", function($scope, usersFactory, $routeParams, $location, socket, $uibModal) {
	// Retrieve currently logged-in user's info
	usersFactory.getUser(function(returnedData) {
		$scope.user = returnedData;
	});

	// Assign variables for the game
	$scope.roomNum = $routeParams.roomNum;
	$scope.gameStart = false;
	$scope.rightPlayer = {};
	$scope.topPlayer = {};
	$scope.leftPlayer = {};
	$scope.startingHand = [];
	$scope.rules = {
		templateUrl: "static/directives/rules.html",
	}

	$scope.ai = function() {
		socket.emit("ai");
	}

	$scope.ready = function() {
		socket.emit("ready");
	}

	$scope.play = function() {
		if ($scope.currentTurn == $scope.user.original) {
			var selected = [];
			var elem = angular.element(document.querySelectorAll(".selected"));
			for (var i = 0; i < elem.length; i++) {
				var index = elem[i].src.indexOf(".png");
				selected.push(elem[i].src.substring(index-3, index));
			}
			console.log(selected);
			socket.emit("play", {selected: selected});
		} else {
			$scope.alertMsg = "It's not your turn!";
		}
	}

	$scope.pass = function() {
		if ($scope.currentTurn == $scope.user.original) {
			stopTimer();
			socket.emit("passTurn");
		} else {
			$scope.alertMsg = "It's not your turn!";
		}
	}

	$scope.leave = function() {
		$scope.exit = true;
		usersFactory.setPrevPath();
		socket.disconnect();
		$location.url("/main");
	}

	$scope.clearAlert = function() {
		$scope.alertMsg = "";
	}

	$scope.send = function() {
		if ($scope.chat) {
			socket.emit("newMsg", {chat: $scope.chat});
			$scope.chat = null;
		}
	}

	$scope.open = function (size, parentSelector) {
		var parentElem = parentSelector ? 
			angular.element($document[0].querySelector('.cardbackModal' + parentSelector)) : undefined;
		var modalInstance = $uibModal.open({
			animation: true,
			ariaLabelledBy: 'modal-title',
			ariaDescribedBy: 'modal-body',
			templateUrl: 'cardback.html',
			controller: 'cbModalInstance',
			controllerAs: '$cbCtrl',
			size: size,
			appendTo: parentElem
		});

		modalInstance.result.then(function(cardback) {
			$scope.user.cardback = cardback;
		});
	};

	// Prevent from using back button so that it does not break the game
	// Using back button will not disconnect the socket
	$scope.$on("$locationChangeStart", function(event) {
		if (!$scope.exit) {
			alert("Back button is prevented due to technical issue in game. Please use 'Leave' buttton at the end of the game.");
			event.preventDefault();
		} 
	});

	// Scrolls down to the most recent msg in chat
	function scroll() {
		var elem = document.querySelector(".msgBlock");
		elem.scrollTop = elem.scrollHeight;
	}

	// Redirect to homepage if a user is not logged in
	if (!$scope.user) {
		$scope.exit = true;
		$location.url("/");

	// Redirect to main page if a user did not join this room through join button on main page
	} else if ($scope.user && !$scope.user.fromMain) {
		$scope.exit = true;
		$location.url("/main");

	// Otherwise, connect to namespace of game to play the game
	} else {
	socket.connect("/game");

	socket.on("connect", function() {
		socket.emit("userConnected", {roomNum: $scope.roomNum, player: $scope.user});
	});

	socket.on("updateScore", function(data) {
		$scope.user.score = data.score;
		usersFactory.updateScore(data.score);
	});

	socket.on("userConnections", function(data) {
		var elem = angular.element(document.querySelector(".msgBlock"));
		if (data.connect) {
			elem.append('<p class="message" style="color: lightgreen;">' + data.user + ' connected.</p>');
		} else {
			elem.append('<p class="message" style="color: crimson;">' + data.user + ' disconnected.</p>');
		}
		scroll();
	});

	socket.on("freeze", function(data) {
		$scope.freeze = true;
		stopTimer();
		destroyTimer();
		var msg = data.dc[0];
		for (var i = 1; i < data.dc.length; i++) {
			if (i < data.dc.length-1) {
				msg += ", " + data.dc[i];
			} else {
				msg += "and " + data.dc[data.dc.length-1];
			}
		}
		$scope.msg = msg + " left the game. Game is frozen and will resume in";
		createTimer(30, false);
	});

	socket.on("reconnected", function(data) {
		$scope.gameStart = true;
		$scope.msg = data.player + " reconnected. Waiting for other disconnected players to reconnect.";
	});

	socket.on("resume", function() {
		$scope.freeze = false;
	});

	socket.on("ready", function(data) {
		$scope.winners = [];
		var msg = "";
		if (data.ready.length == 1) {
			msg = data.ready[0] + " is ready.";
		} else {
			for (var i = 0; i < data.ready.length-1; i++) {
				msg += data.ready[i] + ", ";
			}
			msg += "and " + data.ready[data.ready.length-1] + " are ready.";
		}
		$scope.msg = msg;
	});

	socket.on("aiButton", function(data) {
		$scope.aiButton = data.show;
	});

	socket.on("playerNames", function(data) {
		var list = [$scope.user, $scope.rightPlayer, $scope.topPlayer, $scope.leftPlayer];
		for (var i = 0; i < data.index; i++) {
			var name = list.pop();
			list.unshift(name);
		}
		for (var i = 0; i < 4; i++) {
			if (i < data.names.length) {
				list[i].profilePath = data.names[i].profilePath
				list[i].original = data.names[i].original;
				list[i].score = data.names[i].score;
			} else {
				delete list[i].profilePath;
				delete list[i].original;
				delete list[i].score;
			}
		}
	});

	socket.on("startingHand", function(data) {
		$scope.gameStart = true;
		$scope.msg = "";
		$scope.winners = [];
		$scope.bottomHand = [];
		$scope.rightHand = [];
		$scope.topHand = [];
		$scope.leftHand = [];
		$scope.cardsDiscarded = [];
		for (var i = 0; i < 13; i++) {
			$scope.startingHand.push("static/img/" + data.hand[i] + ".png");
			$scope.startingHand.push("static/img/" + $scope.user.cardback);
			$scope.startingHand.push("static/img/" + $scope.user.cardback);
			$scope.startingHand.push("static/img/" + $scope.user.cardback);
		}
	});

	socket.on("start", function() {
		$scope.translate = [];
		for (var i = 0; i < 13; i++) {
			$scope.translate.push({transform: "translate(" + (i*30-254) + "px, 313px)"});
			$scope.translate.push({transform: "translate(432px, " + (i*30-205) + "px) rotate(-90deg)"});
			$scope.translate.push({transform: "translate(" + (i*30-254) + "px, -358px) rotate(180deg)"});
			$scope.translate.push({transform: "translate(-431px, " + (i*30-205) + "px) rotate(90deg)"});
		}
	});

	socket.on("currentTurn", function(data) {
		if (!$scope.freeze) {
			$scope.currentTurn = data.player;
			$scope.alertMsg = "";
			if (data.player.endsWith("s") || data.player.endsWith("S")) {
				$scope.msg = data.player + "' turn!";
			} else {
				$scope.msg = data.player + "'s turn!";
			}
			if (data.resume) {
				$scope.msg = data.resume + " Game will resume. " + $scope.msg;
			}
			if ($scope.currentTurn == $scope.user.original) {
				createTimer(15, true, function() {
					socket.emit("passTurn");
				});
			} else {
				createTimer(15, false);
			}
		}
	});

	socket.on("stopTimer", function() {
		stopTimer();
	});

	socket.on("playerHand", function(data) {
		$scope.startingHand = [];
		$scope.bottomHand = [];
		$scope.rightHand = [];
		$scope.topHand = [];
		$scope.leftHand = [];
		$scope.bottomStyle = [];
		$scope.rightStyle = [];
		$scope.topStyle = [];
		$scope.leftStyle = [];
		for (var i = 0; i < data.hand[0].length; i++) {
			$scope.bottomHand.push(data.hand[0][i]);			
			$scope.bottomStyle.push({left: ((i+1)*30) + "px"});
		}
		for (var i = 0; i < data.hand[1]; i++) {
			$scope.rightHand.push("static/img/" + $scope.user.cardback);
			$scope.rightStyle.push({top: ((i*30)-10) + "px"});
		}
		for (var i = 0; i < data.hand[2]; i++) {
			$scope.topHand.push("static/img/" + $scope.user.cardback);
			$scope.topStyle.push({left: ((i+1)*30) + "px"});
		}
		for (var i = 0; i < data.hand[3]; i++) {
			$scope.leftHand.push("static/img/" + $scope.user.cardback);
			$scope.leftStyle.push({top: ((i*30)-10) + "px"});
		}
	});

	socket.on("animateCards", function(data) {
		var element;
		if (data.direction == "bottom" || data.direction == "top") {
			var start;
			var indices;
			if (data.direction == "bottom") {
				element = $scope.bottomStyle;
				indices = [];
				var elem = angular.element(document.querySelectorAll(".selected"));
				for (var i = 0; i < elem.length; i++) {
					var index = elem[i].src.indexOf(".png");
					var card = elem[i].src.substring(index-3, index);
					indices.push($scope.bottomHand.indexOf(card));
				}
				start = ((indices[0]+1)*30);
			} else {
				element = $scope.topStyle;
				start = ((data.indices[0]+1)*30);
				indices = data.indices;
			}
			var counter = 0;
			for (var i = indices[0]; i < element.length; i++) {
				if (indices[counter] == i) {
					if (data.direction == "bottom") {
						element[i].transform = "translate(" + (100-(i-counter)*30) + "px, -303px) rotate(0deg)";
					} else {
						element[i].transform = "translate(" + (100-(i-counter)*30) + "px, 358px) rotate(0deg)";
					}
					element[i].transition = "all 1s ease";
					element[i]['z-index'] = 2;
					counter++;
				} else {
					element[i].left = start + "px";
					element[i].transition = "all 500ms ease";
					start += 30;
				}
			}
		} else {
			if (data.direction == "right") {
				element = $scope.rightStyle;
			} else {
				element = $scope.leftStyle;
			}
			var start = data.indices[0]*30-10;
			var counter = 0;
			for (var i = data.indices[0]; i < element.length; i++) {
				if (data.indices[counter] == i) {
					if (data.direction == "right") {
						element[i].transform = "translate(-" + (586-counter*30) + "px, " + (205-i*30) + "px) rotate(0deg)";
					} else {
						element[i].transform = "translate(" + (277+counter*30) + "px, " + (205-i*30) + "px) rotate(0deg)";
					}
					element[i].transition = "all 1s ease";
					element[i]['z-index'] = 2;
					counter++;
				} else {
					element[i].top = start + "px";
					element[i].transition = "all 500ms ease";
					start += 30;
				}
			}
		}
	});

	socket.on("animateDiscard", function(data) {
		if ($scope.cardsPlayed) {
			for (var i = 0; i < $scope.cardsPlayed.length; i++) {
				$scope.translate[i].width = "70px";
				$scope.translate[i].transition = "all 400ms ease";
				$scope.translate[i]['z-index'] = 1;
				var num;
				if (data.discarded + i < 26) {
					num = ((data.discarded*20)-(i*10)-83);
					$scope.translate[i].transform = "translate(" + num + "px, 155px)";
				} else {
					num = (((data.discarded-26)*20)-(i*10)-83);
					$scope.translate[i].transform = "translate(" + num + "px, 195px)";
				}
			}
		}
	});

	socket.on("cardsPlayed", function(data) {
		$scope.cardsPlayed = [];
		$scope.translate = [];
		for (var i = 0; i < data.played.length; i++) {
			$scope.cardsPlayed.push("static/img/" + data.played[i] + ".png");
			$scope.translate.push({left: (i*30+133) + "px"});
		}
	});

	socket.on("cardsDiscarded", function(data) {
		$scope.cardsDiscarded = [];
		$scope.translate2 = [];
		for (var i = 0; i < data.discarded.length; i++) {
			if (i < 26) {
				$scope.cardsDiscarded.push("static/img/" + data.discarded[i] + ".png");
				$scope.translate2.push({left: (50+i*20) + "px"});
			} else {
				$scope.cardsDiscarded.push("static/img/" + data.discarded[i] + ".png");
				$scope.translate2.push({left: (50+(i-26)*20) + "px", top: "40px"});
			}
		}
	});

	socket.on("newRound", function(data) {
		if (!$scope.freeze) {
			$scope.currentTurn = data.player;
			$scope.cardsPlayed = [];
			if ($scope.currentTurn == $scope.user.original) {
				createTimer(15, true, function() {
					socket.emit("passTurn");
				});
			} else {
				createTimer(15, false);
			}
			if (data.msg == 1) {
				$scope.msg = data.player + " won the round. " + data.player + " may play any combination.";
			} else if (data.msg == 2) {
				$scope.msg = "Nobody was able to beat the previous combination. " + data.player + " will start new round.";
			} else {
				$scope.msg = "Everybody passed. " + data.player + " will start round again.";
			}
		}
	});

	socket.on("end", function(data) {
		destroyTimer();
		$scope.msg = "";
		$scope.winners = [];
		if (data.score[0].charAt(1) != "-") {
			$scope.winners.push("1st place: " + data.winners[0] + data.score[0]);
		} else {
			$scope.winners.push("Leaver: " + data.winners[0] + data.score[0]);
		}
		if (data.score[1].charAt(1) != "-") {
			$scope.winners.push("2nd place: " + data.winners[1] + data.score[1]);
		} else {
			$scope.winners.push("Leaver: " + data.winners[1] + data.score[1]);
		}
		if (data.score[2].charAt(1) != "-") {
			$scope.winners.push("3rd place: " + data.winners[2] + data.score[2]);
		} else {
			$scope.winners.push("Leaver: " + data.winners[2] + data.score[2]);
		}
		if (data.score[3].charAt(1) != "-") {
			$scope.winners.push("4th place: " + data.winners[3] + data.score[3]);
		} else {
			$scope.winners.push("Leaver: " + data.winners[3] + data.score[3]);
		}
		for (var i = 0; i < data.winners.length; i++) {
			if (data.winners[i] == $scope.user.original) {
				usersFactory.updateScore($scope.user.score);
				break;
			}
		}
		$scope.gameStart = false;
		$scope.cardsPlayed = [];
	});

	socket.on("wrongCards", function(data) {
		$scope.alertMsg = data.response;
	});

	socket.on("newChat", function(data) {
		var elem = angular.element(document.querySelector(".msgBlock"));
		elem.append('<p class="message" style="color: skyblue;">' + data.user + ': ' + data.chat + '</p>');
		scroll();
	});

	}
}]);