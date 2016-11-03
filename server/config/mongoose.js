var mongoose = require("mongoose");
var path = require("path");
var fs = require("fs");

var models_path = path.join(__dirname, "./../models");
var reg = new RegExp(".js$", "i");
var dbURI = "mongodb://localhost/13";

mongoose.connect(dbURI);
mongoose.Promise = global.Promise;

fs.readdirSync(models_path).forEach(function(file) {
	if (reg.test(file)) {
		require(path.join(models_path, file));
	}
})