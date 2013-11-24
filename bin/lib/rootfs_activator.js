"use strict";

var util = require('util');
var events = require('events');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var async = require('async');

var RootfsExecuter = require('./rootfs_executer');

var RootfsActivator = module.exports = function(rootfs) {
	var self = this;

	self.rootfs = rootfs;
	self.rootfsExecuter = new RootfsExecuter(self.rootfs);

	// Settings
	self.configurePackages = false;
	self.resetRootPassword = false;
};

util.inherits(RootfsActivator, events.EventEmitter);

RootfsActivator.prototype.setPackageConfiguration = function(callback) {
	var self = this;

	self.rootfsExecuter.addCommand('dpkg --configure -a');

	process.nextTick(callback);
};

RootfsActivator.prototype.setRootPasswordCleaner = function(callback) {
	var self = this;

	self.rootfsExecuter.addCommand('passwd -d root');

	process.nextTick(callback);
};

RootfsActivator.prototype.activate = function(callback) {
	var self = this;

	async.series([
		function(next) {

			self.rootfs.prepareEnvironment(next);
		},
		function(next) {

			// Initializing time settings
			var cmd = child_process.spawn('cp', [
				'-a',
				path.join('/', 'etc', 'localtime'),
				path.join(self.rootfs.targetPath, 'etc')
			]);

			cmd.on('close', function() {
				next();
			});
		},
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
			if (!self.resetRootPassword) {
				next();
				return;
			}

			self.setRootPasswordCleaner(function() {
				next();
			});
		},
		function(next) {

			// Starting to activate
			self.rootfsExecuter.rootfs = self.rootfs;
			self.rootfsExecuter.run({}, function(err) {
				next(err);
			});
		},
		function(next) {

			// Clear files which are used to activate rootfs
			async.series([
				function(_next) {
					self.rootfs.clearEnvironment(_next);
				}
			], next);
		}
	], function(err) {

		callback(err);
	});
};
