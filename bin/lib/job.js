"use strict";

var fs = require('fs');
var path = require('path');
var uuid = require('node-uuid');
var child_process = require('child_process');

var Job = module.exports = function(id) {
	var self = this;

	self.id = id || uuid.v1();
	self.jobBasePath = path.join(__dirname, '..', '..', 'job');
	self.jobPath = null;
};

Job.prototype.create = function(callback) {
	var self = this;

	self.jobPath = path.join(self.jobBasePath, self.id);
	fs.mkdir(self.jobPath, function() {
		callback();
	});
};

Job.prototype.release = function(callback) {
	var self = this;

	if (!self.jobPath || self.jobPath == '/') {
		process.nextTick(callback);
		return;
	}

	var cmd = child_process.spawn('rm', [
		'-fr',
		self.jobPath
	]);

	cmd.on('close', function() {
		callback();
	});
};
