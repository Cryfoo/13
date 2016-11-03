app.factory("gamesFactory", ["$http", function($http) {
	function GamesFactory() {
		this.register = function(user, callback) {
			$http.post("/reg", user).then(function(returned_data) {
				if (typeof(callback) == "function") {
					callback(returned_data.data);
				}
			});
		}
		this.login = function(user, callback) {
			$http.post("/log", user).then(function(returned_data) {
				if (typeof(callback) == "function") {
					callback(returned_data.data);
				}
			});
		}
	}
	return new GamesFactory();
}])