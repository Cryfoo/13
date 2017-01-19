app.controller("mainController", ["$scope", "usersFactory", "$uibModal", "$location", "socket", function($scope, usersFactory, $uibModal, $location, socket) {
	// Retrieve currently logged-in user's info
	usersFactory.getUser(function(returnedData) {
		$scope.user = returnedData;
		if ($scope.user) {
			if ($scope.user.profile == null) {
				$scope.user.profilePath = "static/img/default.jpeg";
			} else {
				$scope.user.profilePath = "static/profile/" + $scope.user.profile;
			}
		}
	});

	// Changes a profile picture for the logged-in user
	$scope.changeProfile = function() {
		var profile = document.getElementById("profile").files[0];
		if (profile) {
			var index = profile.name.lastIndexOf(".");
			var type = profile.name.substring(index, profile.name.length).toLowerCase();
			var fd = new FormData();
			fd.append('profile', profile, $scope.user.username + type);
			usersFactory.upload(fd, $scope.user, function(data) {
				if (data.result == "LIMIT_FILE_SIZE") {
					$scope.fileError = "File size limit is 5 MB.";
				} else {
					setTimeout(function() {
						$scope.$apply(function() {
							$scope.user.profilePath = "static/profile/" + $scope.user.username + type + "?" + new Date().getTime();
						});
					}, 1000);
				}
			});
		}
	}

	// Opens a modal to create a new room
	$scope.open = function (size, parentSelector) {
		var parentElem = parentSelector ? 
			angular.element($document[0].querySelector('.newRoom ' + parentSelector)) : undefined;
		var modalInstance = $uibModal.open({
			animation: true,
			ariaLabelledBy: 'modal-title',
			ariaDescribedBy: 'modal-body',
			templateUrl: 'newRoom.html',
			controller: 'roomModalInstance',
			controllerAs: '$roomCtrl',
			size: size,
			appendTo: parentElem,
			resolve: {
				socket: function() {
					return socket;
				}
			}
		});
	};

	// Joins the room if status of the room is waiting or join the room if a player is reconnecting after dc
	$scope.joinRoom = function(i) {
		if ($scope.roomList[i].status == "Waiting" && $scope.roomList[i].players.length < 4) {
			socket.emit("joinRoom", {num: $scope.roomList[i].num});
			usersFactory.setPrevPath();
			socket.disconnect();
			$location.url("/game/" + $scope.roomList[i].num);
		} else if ($scope.roomList[i].status == "Frozen") {
			if ($scope.roomList[i].players.indexOf($scope.user.original) != -1) {
				usersFactory.setPrevPath();
				socket.disconnect();
				$location.url("/game/" + $scope.roomList[i].num);
			}
		}
	}

	// Sends the chat msg to server
	$scope.send = function() {
		if ($scope.chat) {
			socket.emit("newMsg", {chat: $scope.chat});
			$scope.chat = null;
		}
	}

	// Logout the user and delete user info fro
	$scope.logout = function() {
		usersFactory.logout($scope.user.username);
		socket.emit("logout");
		socket.disconnect();
	}

	// Disconnect the user from main page, just in case a user decides to join game by forcefully going localhost/#/game/:roomnum
	$scope.$on("$locationChangeStart", function(event) {
		socket.disconnect(); 
	});

	// Scrolls down to the most recent msg in chat
	function scroll() {
		var elem = document.querySelector(".msgBlock");
		elem.scrollTop = elem.scrollHeight;
	}

	// Redirect to homepage if a user is not logged in
	if (!$scope.user) {
		$location.url("/");

	// Otherwise, connect to namespace of main
	} else {		
	socket.connect("/main");
	// Initialization when a user connects to main page
	socket.on("connect", function() {
		socket.emit("userConnected", {user: $scope.user});
	});

	// Updates the user's list on main page
	socket.on("userList", function(data) {
		$scope.users = [];
		for (var i = 0; i < data.list.length; i++) {
			$scope.users.push(data.list[i]);
		}
	});

	// Updates the room list,room status, and number of players in each room
	socket.on("roomList", function(data) {
		$scope.roomList = [];
		for (var num in data.list) {
			if (data.list.hasOwnProperty(num)) {
				if (data.list[num].status == "Frozen") {
					data.list[num].frozenDisabled = true;
				}
				var playersList = "";
				for (var i = 0; i < data.list[num].players.length; i++) {
					if (i != data.list[num].players.length-1) {
						playersList += data.list[num].players[i] + ", ";
					} else {
						playersList += data.list[num].players[i];
					}
					if ($scope.user.original == data.list[num].players[i]) {
						data.list[num].frozenDisabled = false;
					}
				}
				data.list[num].playersList = playersList;
				$scope.roomList.push(data.list[num]);
			}
		}
	});

	// Updates the chat msg on msg block
	socket.on("newChat", function(data) {
		var elem = angular.element(document.querySelector(".msgBlock"));
		elem.append('<p class="message" style="color: skyblue;">' + data.user + ': ' + data.chat + '</p>');
		scroll();
	});
	}
}]);
