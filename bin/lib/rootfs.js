"use strict";

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var async = require('async');

var Rootfs = module.exports = function() {
	var self = this;

	self.targetPath = null;
	self.environmentReady = false;
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

Rootfs.prototype.remove = function(callback) {
	var self = this;

	if (!self.targetPath) {
		process.nextTick(callback);
		return;
	}

	var cmd = child_process.spawn('rm', [
		'-fr',
		self.targetPath
	]);

	cmd.on('close', function() {
		callback();
	});
};

Rootfs.prototype.prepareEnvironment = function(callback) {
	var self = this;

	if (self.environmentReady) {
		process.nextTick(callback);
		return;
	}

	if (self.arch != 'armhf') {
		process.nextTick(callback);
		return;
	}

	async.series([

		function(next) {

			// Initializing domain name server settings
			var cmd = child_process.spawn('cp', [
				'-a',
				path.join('/', 'etc', 'resolv.conf'),
				path.join(self.targetPath, 'etc')
			]);

			cmd.on('close', function() {
				next();
			});
		},
		function(next) {

			// Preparing emulator
			var cmd = child_process.spawn('cp', [
				'-a',
				path.join('/', 'usr', 'bin', 'qemu-arm-static'),
				path.join(self.targetPath, 'usr', 'bin')
			]);

			cmd.on('close', function() {
				next();
			});
		}
	], function() {
		self.environmentReady = true;
		callback();
	});
};

Rootfs.prototype.clearEnvironment = function(callback) {
	var self = this;

	if (!self.environmentReady) {
		process.nextTick(callback);
		return;
	}

	async.series([

		function(next) {

			fs.unlink(path.join(self.targetPath, 'usr', 'bin', 'qemu-arm-static'), next);
		},
		function(next) {

			fs.unlink(path.join(self.targetPath, 'etc', 'resolv.conf'), next);
		}
	], function() {
		self.environmentReady = false;
		callback();
	});
};

Rootfs.prototype.installPackage = function(packages, opts, callback) {
	var self = this;

	
};
