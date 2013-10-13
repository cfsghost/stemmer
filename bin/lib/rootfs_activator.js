"use strict";

var util = require('util');
var events = require('events');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var async = require('async');

var RootfsActivator = module.exports = function(rootfs) {
	var self = this;

	self.rootfs = rootfs;
	self.scriptPath = path.join(self.rootfs.targetPath, 'activate.sh');
	self.scriptContent = [ '#!/bin/sh' ];

	// Settings
	self.configurePackages = false;
	self.updateClock = false;
	self.resetRootPassword = false;
};

util.inherits(RootfsActivator, events.EventEmitter);

RootfsActivator.prototype.setPackageConfiguration = function(callback) {
	var self = this;

	self.scriptContent.push('export LC_ALL=C LANGUAGE=C LANG=C');
	self.scriptContent.push('export DEBIAN_FRONTEND=noninteractive DEBCONF_NONINTERACTIVE_SEEN=true');
	self.scriptContent.push('/var/lib/dpkg/info/dash.preinst install');
	self.scriptContent.push('mount proc -t proc /proc');
	self.scriptContent.push('dpkg --configure -a');
	self.scriptContent.push('umount /proc');

	process.nextTick(callback);
};

RootfsActivator.prototype.setClockUpdater = function(callback) {
	var self = this;

	self.scriptContent.push('ntpdate time.stdtime.gov.tw');

	process.nextTick(callback);
};

RootfsActivator.prototype.setRootPasswordCleaner = function(callback) {
	var self = this;

	self.scriptContent.push('passwd -d root');

	process.nextTick(callback);
};

RootfsActivator.prototype.activate = function(callback) {
	var self = this;

	async.series([
		function(next) {
			if (!self.configurePackages) {
				next();
				return;
			}

			self.setPackageConfiguration(function() {
				next();
			});
		},
		function(next) {
			if (!self.updateClock) {
				next();
				return;
			}

			self.setClockUpdater(function() {
				next();
			});
		},
		function(next) {
			if (!self.resetRootPassword) {
				next();
				return;
			}

			self.setRootPasswordCleaner(function() {
				next();
			});
		},
		function(next) {
			if (self.rootfs.arch != 'armhf') {
				next();
				return;
			}

			// Preparing emulator
			var cmd = child_process.spawn('cp', [
				'-a',
				path.join('/', 'usr', 'bin', 'qemu-arm-static'),
				path.join(self.rootfs.targetPath, 'usr', 'bin')
			]);

			cmd.on('close', function() {
				next();
			});
		},
		function(next) {

			// Create script for activating
			fs.writeFile(self.scriptPath, self.scriptContent.join('\n'), function(err) {

				fs.chmod(self.scriptPath, '755', function() {
					next();
				});
			});
		},
		function(next) {

			// Starting to activate
/*
			var cmd = child_process.spawn('fakeroot', [
				'-s',
				self.rootfs.envConfigPath,
				'-i',
				self.rootfs.envConfigPath,
				'--',
				'fakechroot',
				'--',
				'chroot', 
				self.rootfs.targetPath,
				'/activate.sh'
			]);
*/
			var opts = {};
			if (self.rootfs.arch == 'armhf') {
				var ldLibraryPath = [
					path.join(self.rootfs.targetPath, 'usr', 'lib', 'arm-linux-gnueabihf', 'libfakeroot'),
					path.join(self.rootfs.targetPath, 'usr', 'lib', 'arm-linux-gnueabihf', 'fakeroot'),
					path.join(self.rootfs.targetPath, 'lib', 'arm-linux-gnueabihf')
				];

				opts.env = {
					LD_LIBRARY_PATH: ldLibraryPath.join(':'),
				};
console.log(ldLibraryPath.join(':'));
			}
			
			var cmd = child_process.spawn('fakeroot', [
				'fakechroot',
				path.join('/', 'usr', 'sbin', 'chroot'),
				self.rootfs.targetPath,
				path.join('/', 'activate.sh')
			], opts);

//LD_LIBRARY_PATH=$PWD/usr/lib/arm-linux-gnueabihf/fakechroot:$PWD/usr/lib/arm-linux-gnueabihf/libfakeroot fakeroot fakechroot /usr/sbin/chroot . /usr/bin/qemu-arm-static -L . usr/bin/dpkg --configure -a

			cmd.stdout.pipe(process.stdout);
			cmd.stderr.pipe(process.stderr);

			cmd.on('close', function() {

				next();
			});
		},
		function(next) {
next();
			// Clear files which are used to activate rootfs
			/*
			fs.unlink(self.scriptPath, function() {
				fs.unlink(path.join(self.rootfs.targetPath, 'usr', 'bin', 'qemu-arm-static'), function() {

					next();
				});
			});
*/
		}
	], function() {

		callback();
	});
};
