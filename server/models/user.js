var mongoose = require("mongoose");
var bcrypt = require("bcryptjs");

var UsersSchema = new mongoose.Schema({
	email: {
		type: String,
		required: true,
		unique: true,
		validate: {
			validator: function(value) {
				var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
			    return re.test(value);
			},
			message: "{VALUE} is not a valid email address!"
		}
	},
	first_name: {
		type: String,
		required: true
	},
	last_name: {
		type: String,
		required: true
	},
	password: {
		type: String,
		required: true,
		minlength: 8,
		validate: {
			validator: function(value) {
				return value === this.password_confirm;
			},
			message: "Password and confirm password does not match!"
		}
	},
	password_confirm: {
		type: String,
		required: true,
		minlength: 8
	},
	birthday: {
		type: Date,
		required: true
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
	this.password_confirm = "";
	done();
});

mongoose.model("Users", UsersSchema);