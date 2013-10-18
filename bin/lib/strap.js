"use strict";

var util = require('util');
var events = require('events');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var Rootfs = require('./rootfs');

var Strap = module.exports = function() {
	var self = this;

	self.settings = {};
};

util.inherits(Strap, events.EventEmitter);

Strap.prototype.generateBuildConfig = function(outputFile, callback) {
	var self = this;

	// Initializing configuration of repository
	var multistrapConfig = [];
	for (var repoName in self.settings) {
		var repo = self.settings[repoName];

		multistrapConfig.push('[' + repoName + ']');

		for (var key in repo) {
			if (repo[key] instanceof Array) {
				multistrapConfig.push(key + '=' + repo[key].join(' '));
			} else {
				multistrapConfig.push(key + '=' + repo[key]);
			}
		}

		multistrapConfig.push('');
	}

	// Write to file
	fs.writeFile(outputFile, multistrapConfig.join('\n'), function(err) {
		callback(err);
	});
};

Strap.prototype.build = function(configPath, targetPath, callback) {
	var self = this;

	// Generate a rootfs by downloading packages from internet
	var ms = child_process.spawn('/usr/sbin/multistrap', [
		'-f',
		configPath,
		'-d',
		targetPath
	]);

	ms.stdout.on('data', function(data) {
		process.stdout.write(data.toString());
	});

	ms.stderr.on('data', function(data) {
		process.stdout.write(data.toString());
	});

	ms.on('close', function() {
		var rootfs = new Rootfs();
		rootfs.arch = self.settings.General.arch;
		rootfs.targetPath = targetPath;

		callback(null, rootfs);
	});
};
