var _soundman = require('../build/Release/jsdx_soundman');

var Soundman = module.exports = function() {};

Soundman.prototype.init = function(callback) {
	_soundman.PulseAudioInit.apply(this, [ callback ]);
};

Soundman.prototype.uninit = function() {
	_soundman.PulseAudioUninit.apply(this, []);
};

Soundman.prototype.setVolume = function(value) {
	return _soundman.setVolume.apply(this, [ value ]);
};

Soundman.prototype.getVolume = function() {
	return _soundman.getVolume();
};

Soundman.prototype.isMuted = function() {
	return _soundman.isMuted();
};

Soundman.prototype.mute = function() {
	_soundman.mute();
};

Soundman.prototype.unmute = function() {
	_soundman.unmute();
};

Soundman.prototype.on = function(e, callback) {

	if (e == 'SinkNotify') {
		_soundman.on.apply(this, [ _soundman.EVENT_SINK, callback ]);
	}
};
