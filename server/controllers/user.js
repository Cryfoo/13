var mongoose = require("mongoose");
var Users = mongoose.model("Users");
var multer = require("multer");
var storage = multer.diskStorage({
	destination: function (req, file, callback) {
		callback(null, "./client/static/profile");
	},
	filename: function(req, file, callback) {
		callback(null, file.originalname);
	}
});
var upload = multer({storage: storage, limits: {fileSize: 5000000}}).single("profile");

module.exports = {
	register: function(req, res) {
		var user = Users(req.body);
		user.save(function(err) {
			if (err) {
				console.log("Registration failed.");
				res.json(err);
			} else {
				console.log(user.username + " registered successfully.");
				res.json(user);
			}
		});
	},

	login: function(req, res) {
		Users.findOne({username: req.body.username.toLowerCase()}, function(err, user) {
			if (!user) {
				console.log("Log in failed.");
				res.json({result: "Invalid username/password."});
			} else {
				if (user.checkPW(req.body.password)) {
					if (user.loggedIn) {
						res.json({result: "This user is already logged in."});
					} else {
						console.log(user.original + " logged in successfully.");
						Users.update({username: user.username}, {loggedIn: true}, function(err) {});
						res.json(user);
					}
				} else {
					console.log("Log in failed.");
					res.json({result: "Invalid username/password."});
				}
			}
		});
	},

	update: function(req, res) {
		Users.update({username: req.body.username.toLowerCase()}, {profile: req.body.profile}, function(err) {
			if (err) {
				console.log("Update failed.");
				res.json({result: err});
			} else {
				if (req.body.original.endsWith("s") || req.body.original.endsWith("s")) {
					console.log(req.body.original +  "' profile picture updated.");
				} else {
					console.log(req.body.original +  "'s profile picture updated.");
				}
				res.json({result: "success"});
			}
		});
	},

	upload: function(req, res) {
		upload(req, res, function(err) {
			if (err) {
				console.log("Error uploading a profile picture.");
				res.json({result: err.code});
			} else {
				console.log("Profile picture is uploaded.");
				res.json({result: "success"});
			}
		});
	},

	logout: function(req, res) {
		Users.update({username: req.params.username}, {loggedIn: false}, function(err) {});
	},

	cardback: function(req, res) {
		Users.update({username: req.params.username}, {cardback: req.params.cardback}, function(err) {});
	}
}