var app = angular.module("app", ["ngRoute", "ui.bootstrap"]);

app.config(function($routeProvider) {
	$routeProvider
	.when("/", {
		templateUrl: "partials/login.html",
		controller: "usersController"
	})
	.when("/register", {
		templateUrl: "partials/register.html",
		controller: "usersController"
	})
	.when("/main", {
		templateUrl: "partials/main.html",
		controller: "mainController"
	})
	.when("/game/:roomNum", {
		templateUrl: "partials/game.html",
		controller: "gamesController"
	})
	.otherwise({
		redirectTo: "/"
	});
});

app.controller("roomModalInstance", function($uibModalInstance, $location, socket, usersFactory) {
	var $roomCtrl = this;
	$roomCtrl.create = function() {
		if ($roomCtrl.roomname) {
			socket.emit("newRoom", {roomname: $roomCtrl.roomname});
			socket.on("join", function(data) {
				usersFactory.setPrevPath();
				$uibModalInstance.close();
				socket.disconnect();
				$location.url("/game/" + data.roomNum);
			});
		}
	}
	$roomCtrl.cancel = function() {
		$uibModalInstance.dismiss("cancel");
	}
});

app.controller("cbModalInstance", function($uibModalInstance, usersFactory) {
	var $cbCtrl = this;
	$cbCtrl.change = function() {
		if ($cbCtrl.cardback) {
			usersFactory.setCardback($cbCtrl.cardback);
			$uibModalInstance.close($cbCtrl.cardback);
		}
	}
	$cbCtrl.cancel = function() {
		$uibModalInstance.dismiss("cancel");
	}
});

app.directive("deck", function() {
	return {
		restrict: "E",
		templateUrl: "static/directives/deck.html"
	}
});

app.directive("player", function() {
	return {
		restrict: "E",
		scope: {
			player: "=player"
		},
		templateUrl: "static/directives/player.html"
	}
});