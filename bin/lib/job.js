"use strict";

var fs = require('fs');
var path = require('path');
var uuid = require('node-uuid');

var Job = module.exports = function(id) {
	var self = this;

	self.id = id || uuid.v1();
	self.basePath = path.join(__dirname, '..', '..', 'build');
	self.jobPath = null;
};

Job.prototype.create = function(callback) {
	var self = this;

	self.jobPath = path.join(self.basePath, self.id);
	fs.mkdir(self.jobPath, function() {
		callback();
	});
};

Job.prototype.release = function(callback) {
	var self = this;

	if (!self.jobPath) {
		process.nextTick(callback);
		return;
	}

	// TODO: Remove directory
};
