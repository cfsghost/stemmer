"use strict";

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var async = require('async');

var RootfsExecuter = module.exports = function(rootfs) {
	var self = this;

	self.rootfs = rootfs || null;
	self.commands = [];
	self.preloads = [
		'#!/bin/sh',
		'export PATH=/.stemmer:$PATH',
		'export LC_ALL=C LANGUAGE=C LANG=C',
		'export DEBIAN_FRONTEND=noninteractive DEBCONF_NONINTERACTIVE_SEEN=true',
		'/var/lib/dpkg/info/dash.preinst install',
		'mount proc -t proc /proc'
	];
	self.postloads = [
		'umount /proc'
	];
};

RootfsExecuter.prototype.addCommand = function(command) {
	var self = this;

	self.commands.push(command);
};

RootfsExecuter.prototype.run = function(opts, callback) {
	var self = this;

	// No command needed to be executed
	if (self.commands.length == 0) {
		setImmediate(function() {
			callback();
		});

		return;
	}

	var scriptPath = path.join(self.rootfs.targetPath, 'rootfs_executer.sh');

	async.series([
		function(next) {

			var script = self.preloads.concat(self.commands, self.postloads);

			// Create script for activating
			fs.writeFile(scriptPath, script.join('\n'), function(err) {
				if (err) {
					next(err);
					return;
				}

				fs.chmod(scriptPath, '755', function() {
					next();
				});
			});
		},
		function(next) {

			// Starting to activate
			var cmd = child_process.spawn('chroot', [
				self.rootfs.targetPath,
				path.join('/', 'rootfs_executer.sh')
			]);

			cmd.stdout.pipe(process.stdout);
			cmd.stderr.pipe(process.stderr);

			cmd.on('close', function() {

				fs.unlink(scriptPath, function() {
					next();
				});
			});
		}
	], function(err) {
		callback(err);
	});
};
