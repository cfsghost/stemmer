"use strict";

var path = require('path');
var fs = require('fs');

var Base = module.exports = function() {
	var self = this;

	self.basePath = path.join(__dirname, '..', '..', 'base');
	self.services = {};
};

Base.prototype.init = function(callback) {
	var self = this;

	fs.readFile(path.join(self.basePath, 'services.json'), function(err, data) {
		if (err) {
			callback(err);
			return;
		}

		self.services = JSON.parse(data);

		callback(null);
	});
};

Base.prototype.applyOverwrite = function(rootfs, callback) {
	var self = this;

	// Overwriting specific files from base directory
	var overwritePath = path.join(self.basePath, 'overwrite');
	rootfs.applyOverwrite(overwritePath, callback);
};

Base.prototype.initiateServices = function(rootfs, callback) {
	var self = this;

	rootfs.registerServices(self.services, {}, callback);
};
