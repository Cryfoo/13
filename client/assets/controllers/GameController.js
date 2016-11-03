app.controller("GameController", ["$scope", "gamesFactory", "$location", function($scope, gF, $location) {
	var reset = function() {
		$scope.errors = null;
		$scope.dupError = null;
		$scope.logError = null;
	}

	$scope.register = function() {
		reset();
		usersFactory.register($scope.user, function(data) {
			if (data.errors) {
				$scope.errors = data.errors;
			} else if (data.errmsg) {
				$scope.dupError = data.errmsg;
			} else {
				$location.url("/success");
			}
		});
	}
	$scope.login = function() {
		reset();
		usersFactory.login($scope.log, function(data) {
			if (data.result === "success") {
				$location.url("/success");
			} else {
				$scope.logError = data;
			}
		});
	}
}]);