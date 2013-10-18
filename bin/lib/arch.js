"use strict";

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

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

Arch.prototype.initRootfs = function(rootfs, callback) {
	var self = this;

	// Overwriting files
	var overwritePath = path.join(self.basePath, self.arch, 'overwrite');
	fs.readdir(overwritePath, function(err, files) {

		if (files.length == 0) {
			callback();
			return;
		}

		var sources = [];
		for (var index in files) {
			sources.push(path.join(overwritePath, files[index]));
		}

		var args = [ '-a' ].concat(sources, [ rootfs.targetPath ]);

		var cmd = child_process.spawn('cp', args);

		cmd.stdout.pipe(process.stdout);
		cmd.stderr.pipe(process.stderr);

		cmd.on('close', function() {
			callback();
		});
	});
};
