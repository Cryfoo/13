app.factory("gamesFactory", ["$http", function($http) {
	var players = [];
	return {
		login: function(user, callback) {
			$http.post("/log", user).then(function(returnedData) {
				currentUser = returnedData.data;
				if (typeof(callback) == "function") {
					callback(returnedData.data);
				}
			});
		},

		getUser: function(username, callback) {
			$http.get("/users/" + username);
		}
	};
}]);