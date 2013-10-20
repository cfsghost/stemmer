"use strict";

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var async = require('async');

var Job = require('../lib/job');
var Strap = require('../lib/strap');
var Rootfs = require('./rootfs');
var RootfsActivator = require('../lib/rootfs_activator');
var RootfsExecuter = require('./rootfs_executer');

var Arch = module.exports = function() {
	var self = this;

	self.basePath = path.join(__dirname, '..', '..', 'arch');
	self.arch = 'i386';
	self.platform = null;
	self.refPlatform = null;
	self.settings = {};
};

Arch.prototype.init = function(callback) {
	var self = this;

	self.loadConfig(path.join(self.basePath, self.platform || self.arch, 'config.json'), function(err) {
		callback(err, self);
	});
};

Arch.prototype.loadConfig = function(filename, callback) {
	var self = this;

	fs.readFile(filename, function(err, data) {
		if (err) {
			callback(err);
			return;
		}

		self.settings = JSON.parse(data);

		// This architecture depends on another one
		if (self.settings.platform) {

			// Initializing such platform
			var platform = self.refPlatform = new Arch();
			platform.platform = self.settings.platform;
			platform.init(function(err, platform) {
				if (err) {
					callback(new Error('Cannot found such platform ' + self.settings.platform));
					return;
				}

				// Getting architecture
				self.arch = platform.arch;

				callback(null);
			});

			return;
		}

		self.arch = self.settings.arch || self.arch;

		callback(null);
	});
};

Arch.prototype.getPackages = function(callback) {
	var self = this;

	if (!self.settings.repo) {
		process.nextTick(function() {
			callback([]);
		});

		return;
	}

	var packages = [];
	for (var repoName in self.settings.repo) {

		if (repoName == 'General')
			continue;

		var repo = self.settings.repo[repoName];

		if (!repo.packages)
			continue;

		packages = packages.concat(repo.packages);
	}

	process.nextTick(function() {
		callback(packages);
	});

};

Arch.prototype.buildExists = function(callback) {
	var self = this;

	fs.exists(path.join(__dirname, '..', '..', 'arch-build', self.platform || self.arch), function(exists) {
		callback(exists);
	});
};

Arch.prototype.getRootfs = function(opts, callback) {
	var self = this;

	var archBuildPath = path.join(__dirname, '..', '..', 'arch-build', self.platform || self.arch, 'rootfs');

	self.buildExists(function(exists) {

		// Trying to rebuild this rootfs
		if (exists) {

			// Creating rootfs object
			var rootfs = new Rootfs();
			rootfs.arch = self.arch;
			rootfs.targetPath = archBuildPath;

			callback(rootfs);

			return;
		}

		if (opts.makeIfDoesNotExists) {
			// Build rootfs
			self.makeRootfs(callback);
		} else {
			callback(null);
		}
	});
};

Arch.prototype.makeRootfs = function(callback) {
	var self = this;

	var archBuildPath = path.join(__dirname, '..', '..', 'arch-build', self.platform || self.arch, 'rootfs');
	var job = null;
	var archRootfs = null;
	var activateRootfs = true;
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

					refRootfs.clone(targetPath, function(rootfs) {
						archRoot = root;
						activateRootfs = false;
						next();
					});
				});
				return;
			}

			if (!self.settings.repo) {
				next(false);
				return;
			}

			if (!self.settings.repo.General) {
				next(false);
				return;
			}

			// Initializing config for making a new rootfs
			var configPath = path.join(job.jobPath, 'multistrap.conf');

			var strap = new Strap();
			strap.settings = self.settings.repo;
			strap.settings.repo.General.arch = self.arch;
			strap.generateBuildConfig(configPath, function() {

				// Starting to make a rootfs
				strap.build(configPath, targetPath, function(err, rootfs) {
					archRootfs = rootfs;

					next();
				});
			});
		},
		function(next) {

			if (!activateRootfs) {
				next();
				return;
			}

			// Activate rootfs
			var activator = new RootfsActivator(archRootfs);
			activator.configurePackages = true;
			activator.resetRootPassword = true;
			activator.activate(function() {
				next();
			});
		},
		function(next) {

			// Initializing rootfs for specific platform
			self.initRootfs(archRootfs, function() {
				next();
			});
		},
		function(next) {

			// Remove old rootfs if it exists
			self.getRootfs({}, function(rootfs) {

				if (rootfs) {

					// Remove
					rootfs.remove(function() {

						next();
					});

					return;
				}

				next();
			});
		},
		function(next) {

			// Create a new directory for rootfs
			var cmd = child_process.spawn('mkdir', [
				'-p',
				archBuildPath
			]);

			cmd.on('close', function() {

				// Moving rootfs to another place for storing
				archRootfs.move(archBuildPath, next);
			});

		}
		
	], function() {
		job.release(function() {
			callback(archRootfs || null);
		});
	});
};

Arch.prototype.initRootfs = function(rootfs, callback) {
	var self = this;

	var rootfsExecuter = new RootfsExecuter(rootfs);
	async.series([
		function(next) {

			rootfs.prepareEnvironment(next);
		},
		function(next) {

			// Installing packages
			self.getPackages(function(packages) {
				if (packages.length == 0) {
					next();
					return;
				}

				rootfsExecuter.addCommand('apt-get update');
				rootfsExecuter.addCommand('apt-get install --no-install-recommends -q --force-yes -y ' + packages.join(' '))
				rootfsExecuter.addCommand('apt-get clean');
				rootfsExecuter.run({}, function() {
					next();
				});
			});
		},
		function(next) {

			rootfs.clearEnvironment(next);
		},
		function(next) {

			// Overwriting files
			var overwritePath = path.join(self.basePath, self.platform || self.arch, 'overwrite');
			fs.readdir(overwritePath, function(err, files) {
				if (err) {
					next(err);
					return;
				}

				if (files.length == 0) {
					next();
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
					next();
				});
			});
		}

	], function() {

		callback();
	});
};
