"use strict";

var fs = require('fs');
var child_process = require('child_process');

var Rootfs = module.exports = function() {
	var self = this;

	self.targetPath = null;
};

Rootfs.prototype.clone = function(targetPath, callback) {
	var self = this;

	fs.exists(targetPath, function(exists) {
		if (!exists) {
			callback(new Error('No such rootfs.'));
			return;
		}

		fs.readdir(self.targetPath, function(err, files) {

			if (files.length == 0) {
				callback();
				return;
			}

			// Preparing entries
			var sources = [];
			for (var index in files) {
				sources.push(path.join(self.targetPath, files[index]));
			}

			// Arguments
			var args = [ '-a' ].concat(sources, [ targetPath ]);

			// Copying files
			var cmd = child_process.spawn('cp', args);
			cmd.on('close', function() {
				callback();
			});
		});
	});
};

Rootfs.prototype.move = function(targetPath, callback) {
	var self = this;

	fs.exists(targetPath, function(exists) {
		if (!exists) {
			callback(new Error('No such rootfs.'));
			return;
		}

		fs.readdir(self.targetPath, function(err, files) {

			if (files.length == 0) {
				callback();
				return;
			}

			// Preparing entries
			var sources = [];
			for (var index in files) {
				sources.push(path.join(self.targetPath, files[index]));
			}

			// Arguments
			var args = [ '-f' ].concat(sources, [ targetPath ]);

			var cmd = child_process.spawn('mv', args);
			cmd.on('close', function() {
				self.targetPath = targetPath;
				callback();
			});
		});
	});
};
