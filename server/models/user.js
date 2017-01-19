var mongoose = require("mongoose");
var bcrypt = require("bcryptjs");

var UsersSchema = new mongoose.Schema({
	username: {
		type: String,
		unique: true,
		required: [true, "Username is required."],
		trim: true
	},
	password: {
		type: String,
		required: [true, "Password is required!"],
		minlength: [8, "Password must be at least 8 characters long."],
		validate: {
			validator: function(value) {
				return value === this.confirm;
			},
			message: "Password and confirm password does not match."
		}
	},
	confirm: {
		type: String,
		required: [true, "Password confirm is required."],
		minlength: [8, "Password confirm must be 8 characters long."],
	},
	original: {
		type: String
	},
	score: {
		type: Number
	},
	profile: {
		type: String
	},
	cardback: {
		type: String
	},
	loggedIn: {
		type: Boolean
	},
	userLevel: {
		type: Number
	}
}, {timestamps: true});

UsersSchema.methods.encryptPW = function(pw) {
	return bcrypt.hashSync(pw, bcrypt.genSaltSync(8));
}

UsersSchema.methods.checkPW = function(pw) {
	return bcrypt.compareSync(pw, this.password);
}

UsersSchema.pre("save", function(done) {
	this.password = this.encryptPW(this.password);
	this.original = this.username;
	this.username = this.username.toLowerCase();
	this.confirm = undefined;
	this.score = 0;
	this.profile = null;
	this.cardback = "card01.jpg";
	this.loggedIn = true;
	this.userLevel = 1;
	done();
});

mongoose.model("Users", UsersSchema);