app.controller("usersController", ["$scope", "usersFactory", "$location", function($scope, usersFactory, $location) {
	// Resets all the error flags
	var reset = function() {
		$scope.usernameError = null;
		$scope.passwordError = null;
		$scope.confirmError = null;
		$scope.fileError = null;
		$scope.dupError = null;
		$scope.logError = null;
	}

	// Registers an user to the server database
	$scope.register = function() {
		reset();
		usersFactory.register($scope.user, function(data) {
			var profile = document.getElementById("profile").files[0];
			if (data.errors) {
				if (data.errors.username) {
					$scope.usernameError = data.errors.username.message;
				}
				if (data.errors.password) {
					$scope.passwordError = data.errors.password.message;
				}
				if (data.errors.confirm) {
					$scope.confirmError = data.errors.confirm.message;
				}
				if (profile && profile.size > 5000000) {
					$scope.fileError = "File size limit is 5 MB.";
				}
			} else if (data.errmsg) {
				$scope.dupError = "Username already exists.";
				if (profile && profile.size > 5000000) {
					$scope.fileError = "File size limit is 5 MB.";
				}
			} else {
				if (profile) {
					var index = profile.name.lastIndexOf(".");
					var type = profile.name.substring(index, profile.name.length).toLowerCase();
					var fd = new FormData();
					fd.append('profile', profile, $scope.user.username.toLowerCase() + type);
					$scope.user.profile = $scope.user.username.toLowerCase() + type;
					usersFactory.upload(fd, $scope.user, function(data) {
						if (data.result == "LIMIT_FILE_SIZE") {
							$scope.fileError = "File size limit is 5 MB.";
						}
						$location.url("/main");
					});
				} else {
					$location.url("/main");
				}
			}
		});
	}

	// Login an user if info matches on server database
	$scope.login = function() {
		reset();
		if ($scope.user && $scope.user.username && $scope.user.password) {
			usersFactory.login($scope.user, function(data) {
				if (data.result == undefined) {
					$location.url("/main");
				} else {
					$scope.logError = data.result;
				}
			});
		} else {
			$scope.logError = "Invalid username/password.";
		}
	}
}]);