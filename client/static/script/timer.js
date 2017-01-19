var timer;
var stop;

function createTimer(count, createCallback, passTurn) {
	var callback = {};
	if (createCallback) {
		stop = false;
		callback = {
			interval: function() {
				var time = this.factory.getTime().time;
				if (time == 0 && !stop) {
					passTurn();
				} else if (stop) {
					this.factory.timer._destroyTimer();
				}
			}
		}
	}
	timer = $("#turnTimer").FlipClock(count, {
		clockFace: "Counter",
		autoStart: true,
		countdown: true,
		callbacks: callback
	});
}

function stopTimer() {
	stop = true;
}

function destroyTimer() {
	$("#turnTimer").empty();
}