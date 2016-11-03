var mongoose = require("mongoose");
var Users = mongoose.model("Users");

module.exports = {
	register: function(req, res) {
		var user = Users(req.body);
		user.save(function(err) {
			if (err) {
				console.log("Registration failed!");
				res.json(err);
			} else {
				console.log("Registered successfully!");
				res.json(user);
			}
		});
	},
	login: function(req, res) {
		Users.findOne({email: req.body.email}, function(err, user) {
			if (!user) {
				console.log("Log in failed!");
				res.json({result: "Invalid email/password!"});
			} else {
				if (user.checkPW(req.body.password)) {
					console.log("Logged in successfully!");
					res.json({result: "success"});
				} else {
					console.log("Log in failed!");
					res.json({result: "Invalid email/password!"});
				}
			}
		});
	}
}