app.factory("usersFactory", ["$http", function($http) {
	var currentUser;
	return {
		register: function(user, callback) {
			$http.post("/reg", user).then(function(returnedData) {
				currentUser = returnedData.data;
				delete currentUser.password;
				currentUser.fromMain = false;
				if (typeof(callback) == "function") {
					callback(returnedData.data);
				}
			});
		},

		login: function(user, callback) {
			$http.post("/log", user).then(function(returnedData) {
				currentUser = returnedData.data;
				delete currentUser.password;
				currentUser.loggedIn = true;
				currentUser.fromMain = false;
				if (typeof(callback) == "function") {
					callback(returnedData.data);
				}
			});
		},

		upload: function(profile, user, callback) {
			$http.post("/upload", profile, {
				transformRequest: angular.identity,
				headers: {'Content-Type': undefined}
			}).then(function(returnedData) {
				if (returnedData.data.result == "success") {
					user.profile = profile.get("profile").name;
					currentUser.profile = user.profile;
					$http.post("/update", user).then(function(returnedData2) {
						if (returnedData2.data.result == "success") {
							if (typeof(callback) == "function") {
								callback(returnedData2.data);
							}
						}
					});
				} else {
					if (typeof(callback) == "function") {
						callback(returnedData.data);
					}
				}
			});
		},

		getUser: function(callback) {
			callback(currentUser);
		},

		updateScore: function(score) {
			currentUser.score = score;
		},

		setPrevPath: function() {
			currentUser.fromMain = !currentUser.fromMain;
		},

		setCardback: function(cardback) {
			$http.put("/cardback/" + currentUser.username + "/" + cardback);
		},

		logout: function(username) {
			currentUser = null;
			$http.put("/logout/" + username);
		}
	};
}]);