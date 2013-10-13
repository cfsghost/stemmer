"use strict";

var fs = require('fs');
var path = require('path');

var Arch = module.exports = function() {
	var self = this;

	self.basePath = path.join(__dirname, '..', '..', 'arch');
	self.arch = 'i386';
	self.settings = {};
};

Arch.prototype.init = function(callback) {
	var self = this;

	self.loadConfig(path.join(self.basePath, self.arch, 'config.json'), function() {
		callback();
	});
};

Arch.prototype.loadConfig = function(filename, callback) {
	var self = this;

	fs.readFile(filename, function(err, data) {
		self.settings = JSON.parse(data);

		callback(err);
	});
};
