var app = angular.module("app", ["ngRoute"]);

app.config(function($routeProvider) {
	$routeProvider
	.when("/game", {
		templateUrl: "partials/game.html",
		controller: "GameController"
	})
	.otherwise({
		redirectTo: "/"
	});
});