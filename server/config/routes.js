var user = require("./../controllers/user.js");

module.exports = function(app) {
	app.post("/reg", user.register);
	app.post("/log", user.login);
	app.post("/upload", user.upload);
	app.post("/update", user.update);
	app.put("/logout/:username", user.logout);
	app.put("/cardback/:username/:cardback", user.cardback);
}