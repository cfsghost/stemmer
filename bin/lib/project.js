"use strict";

var fs = require('fs');
var path = require('path');
var async = require('async');
var Job = require('./job');

var Project = module.exports = function() {
	var self = this;

	self.basePath = path.join(__dirname, '..', '..', 'projects');
	self.projectName = null;
	self.settings = {};
	self.arch = 'i386';
	self.platform = null;
	self.refPlatform = null;
};

Project.prototype.load = function(projectName, callback) {
	var self = this;

	if (!projectName) {
		process.nextTick(function() {
			callback(new Error('Require project name.'));
		});
		return;
	}

	self.projectName = projectName;
	var configPath = path.join(self.basePath, projectName, 'project.json');

	fs.readFile(configPath, function(err, data) {
		if (err) {
			callback(err);
			return;
		}

		self.settings = JSON.parse(data);

		// This architecture depends on another one
		if (self.settings.platform) {

			// Initializing such platform
			var platform = new Arch();
			platform.platform = self.settings.platform;
			platform.init(function(err, platform) {
				if (err) {
					callback(new Error('Cannot found such platform ' + self.settings.platform));
					return;
				}

				// Getting architecture
				self.refPlatform = platform;
				self.arch = platform.arch;

				callback(null);
			});

			return;
		}

		callback(null);
	});
};

Project.prototype.build = function(opts, callback) {
	var self = this;

	var job = null;
	var curRootfs = null;
	async.series([
		function(next) {

			// Create a job
			job = new Job();
			job.create(function() {
				next();
			});
		},
		function(next) {

			var targetPath = path.join(job.jobPath, 'rootfs');

			// This architecture depends on another one
			if (self.refPlatform) {

				// Based on referenced platform
				self.refPlatform.getRootfs({ makeIfDoesNotExists: true }, function(refRootfs) {

					// Clone
					refRootfs.clone(targetPath, function(err, rootfs) {
						if (err) {
							next(err);
							return;
						}

						curRootfs = rootfs;
						next();
					});
				});
				return;
			}
		},
		function(next) {

			if (!self.settings.hostname) {
				next();
				return;
			}


			// Write to hostname configuration file
			fs.writeFile(path.join(curRootfs.targetPath, 'etc', 'hostname'), self.settings.hostname, function() {
				next();
			});
		},
		function(next) {

			if (!self.settings.packages) {
				next();
				return;
			}

			// Install packages in config file
			var packages = [];
			for (var packageName in self.settings.packages) {
				packages.push(packageName);
			}

			curRootfs.installPackage(packages, {}, function() {
				next();
			});
		}
	], function(err) {

		job.release(function() {
			callback(err, curRootfs || null);
		});
	});
};
