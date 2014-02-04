"use strict";

var util = require('util');
var events = require('events');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var async = require('async');

var Base = require('./base');
var Job = require('./job');
var Strap = require('./strap');
var Rootfs = require('./rootfs');
var RootfsActivator = require('./rootfs_activator');

var Arch = module.exports = function() {
	var self = this;

	self.base = null;
	self.basePath = path.join(__dirname, '..', '..', 'base');
	self.archPath = path.join(__dirname, '..', '..', 'arch');
	self.arch = 'i386';
	self.platform = null;
	self.refPlatform = null;
	self.settings = {};
	self.repos = [];
};

util.inherits(Arch, events.EventEmitter);

Arch.prototype.init = function(callback) {
	var self = this;

	self.loadConfig(path.join(self.archPath, self.platform || self.arch, 'config.json'), function(err) {
		if (err) {
			callback(err);
			return;
		}

		// Initializing base
		self.base = new Base();
		self.base.init(function(err) {
			if (err) {
				callback(err);
				return;
			}

			callback(null, self);
		});
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

		// Preparing all repo information
		if (self.settings.repo) {

			self.repos = [];
			for (var repoName in self.settings.repo) {

				if (repoName == 'General')
					continue;

				var repo = self.settings.repo[repoName];
				var repoInfo = {};
				repoInfo.name = repoName.toLowerCase();
				repoInfo.source = repo.source;
				repoInfo.suite = repo.suite || 'sid';
				repoInfo.components = repo.components ? repo.components.split(' ') : [ 'main' ];
				repoInfo.keyring = repo.keyring || '';
				repoInfo.packages = repo.packages || [];

				self.repos.push(repoInfo);
			}
		}

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

Arch.prototype.buildExists = function(callback) {
	var self = this;

	fs.exists(path.join(__dirname, '..', '..', 'platform-build', self.platform || self.arch), function(exists) {
		callback(exists);
	});
};

Arch.prototype.getRootfs = function(opts, callback) {
	var self = this;

	var archBuildPath = path.join(__dirname, '..', '..', 'platform-build', self.platform || self.arch, 'rootfs');

	self.buildExists(function(exists) {

		// Trying to rebuild this rootfs
		if (exists) {

			// Creating rootfs object
			var rootfs = new Rootfs();
			rootfs.arch = self.arch;
			rootfs.targetPath = archBuildPath;

			callback(null, rootfs);
			return;
		}

		if (opts.makeIfDoesNotExists) {
			// Build rootfs
			self.makeRootfs(callback);
		} else {
			callback(null, null);
		}
	});
};

Arch.prototype.makeRootfs = function(callback) {
	var self = this;

	var archBuildPath = path.join(__dirname, '..', '..', 'platform-build', self.platform || self.arch, 'rootfs');
	var job = null;
	var archRootfs = null;
	var activateRootfs = true;

	async.series([

		function(next) {

			self.emit('make', 'init_job');

			// Create a job
			job = new Job();
			job.create(function() {
				next();
			});
		},
		function(next) {

			self.emit('make', 'rootfs');

			var targetPath = path.join(job.jobPath, 'rootfs');

			// This architecture depends on another one
			if (self.refPlatform) {

				// Based on referenced platform
				self.refPlatform.getRootfs({ makeIfDoesNotExists: true }, function(err, refRootfs) {
					if (err) {
						next(err);
						return;
					}

					self.emit('make', 'reference_rootfs');

					// Clone from job directory to another place for storing
					refRootfs.clone(targetPath, function(err, rootfs) {
						if (err) {
							next(err);
							return;
						}

						archRootfs = rootfs;
						activateRootfs = false;
						next();
					});
				});
				return;
			}

			if (!self.settings.repo) {
				next(new Error('Requires repository in config file.'));
				return;
			}

			if (!self.settings.repo.General) {
				next(new Error('Requires repository in config file.'));
				return;
			}

			// Initializing config for making a new rootfs
			var configPath = path.join(job.jobPath, 'multistrap.conf');

			var strap = new Strap();
			strap.settings = self.settings.repo;
			strap.settings.General.arch = self.arch;
			strap.generateBuildConfig(configPath, function() {

				self.emit('make', 'new_rootfs');

				// Starting to make a rootfs
				strap.build(configPath, targetPath, function(err, rootfs) {

					archRootfs = rootfs;

					// Clear all repositories which are used by multistrap
					rootfs.clearRepositories(function() {
						next();
					});

				});
			});
		},
		function(next) {

			if (!self.settings.repo) {
				next();
				return;
			}

			self.emit('make', 'init_repos');

			// Initializing repositories
			async.eachSeries(self.repos, function(repo, cb) {

				archRootfs.addRepository(repo.name, repo.source, repo.suite, repo.components, repo.keyring, function() {
					cb();
				});
			}, function() {
				next();
			});
		},
		function(next) {

			if (!activateRootfs) {
				next();
				return;
			}

			self.emit('make', 'activate');

			// Activate rootfs
			var activator = new RootfsActivator(archRootfs);
			activator.configurePackages = true;
			activator.resetRootPassword = true;
			activator.activate(function(err) {
				next(err);
			});
		},
		function(next) {

			self.emit('make', 'configure');

			// Initializing rootfs for specific platform
			self.initRootfs(archRootfs, function() {
				next();
			});
		},
		function(next) {

			// Remove old rootfs if it exists
			self.getRootfs({}, function(err, rootfs) {

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

			// Remove emdebian repository to avoid breaking dependencies
			archRootfs.removeRepository('grip', next);
		},
		function(next) {

			self.emit('make', 'save');

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
		
	], function(err) {

		job.release(function() {

			self.emit('make', 'complete');
			callback(err, archRootfs || null);
		});
	});
};

Arch.prototype.initRootfs = function(rootfs, callback) {
	var self = this;

	var indexPath = null;
	async.series([

		function(next) {

			self.emit('configure', 'preparing');
			rootfs.prepareEnvironment(next);
		},
		function(next) {

			// Create directoy to store indexes
			indexPath = path.join(self.archPath, self.platform || self.arch, 'index');
			fs.exists(indexPath, function(exists) {
				if (!exists) {
					fs.mkdir(indexPath, next);
					return;
				}

				// Cache package indexes
				self.emit('configure', 'set_indexes');
				rootfs.setPackageIndexes(indexPath, function() {
					next();
				});
			});

		},
		function(next) {

			self.emit('configure', 'install_packages');

			async.eachSeries(self.repos, function(repo, cb) {

				// Preparing package list
				var pkgs = {};
				for (var index in repo.packages) {

					// No specific version
					pkgs[repo.packages[index]] = '*';
				}

				// Installing packages
				rootfs.installPackages(pkgs, { suite: repo.suite }, function() {
					cb();
				});
				
			}, function() {
				next();
			});
		},
		function(next) {

			self.emit('configure', 'make_cache');

			// Cache package indexes
			rootfs.fetchPackageIndexes(indexPath, function() {
				next();
			});
		},
		function(next) {

			self.emit('configure', 'overwrite');

			// Overwriting specific files from arch directory
			var overwritePath = path.join(self.archPath, self.platform || self.arch, 'overwrite');
			rootfs.applyOverwrite(overwritePath, next);
		}

	], function(err) {

		self.emit('configure', 'clear');

		rootfs.on('clear', function(state) {
			self.emit('configure', 'clear', state);
		});

		// Clear rootfs
		rootfs.clearEnvironment(function() {

			if (err) {
				self.emit('configure', 'fail');
			} else {
				self.emit('configure', 'complete');
			}

			callback(err);
		});

	});
};
