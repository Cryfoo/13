var log_reg = require("./../controllers/log_reg.js");

module.exports = function(app) {
	app.post("/reg", log_reg.register);
	app.post("/log", log_reg.login);
}