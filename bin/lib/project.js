"use strict";

var util = require('util');
var events = require('events');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var async = require('async');

var Job = require('./job');
var Arch = require('./arch');
var Rootfs = require('./rootfs');
var Recipe = require('./recipe');

var Project = module.exports = function() {
	var self = this;

	self.projectBasePath = path.join(__dirname, '..', '..', 'projects');
	self.recipePath = path.join(__dirname, '..', '..', 'recipes');
	self.projectName = null;
	self.settings = {};
	self.arch = 'i386';
	self.platform = null;
	self.refPlatform = null;
};

util.inherits(Project, events.EventEmitter);

Project.prototype.load = function(projectName, callback) {
	var self = this;

	if (!projectName) {
		process.nextTick(function() {
			callback(new Error('Require project name.'));
		});
		return;
	}

	self.projectName = projectName;
	var configPath = path.join(self.projectBasePath, projectName, 'project.json');

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

		callback(new Error('Require platform'));
	});
};

Project.prototype.buildExists = function(callback) {
	var self = this;

	fs.exists(path.join(__dirname, '..', '..', 'build', self.projectName), function(exists) {
		callback(exists);
	});
};

Project.prototype.getRootfs = function(opts, callback) {
	var self = this;

	var buildPath = path.join(__dirname, '..', '..', 'build', self.projectName, 'rootfs');

	self.buildExists(function(exists) {

		// Trying to rebuild this rootfs
		if (exists) {

			// Creating rootfs object
			var rootfs = new Rootfs();
			rootfs.arch = self.arch;
			rootfs.targetPath = buildPath;

			callback(null, rootfs);

			return;
		}

		if (opts.makeIfDoesNotExists) {
			// Build rootfs
			self.build(callback);
		} else {
			callback(null, null);
		}
	});
};

Project.prototype.build = function(opts, callback) {
	var self = this;

	var job = null;
	var curRootfs = null;
	var buildPath = path.join(__dirname, '..', '..', 'build', self.projectName, 'rootfs');
	var packages = {};
	var recipes = {};
	var indexPath = null;
	var stemConfigDir = null;
	async.series([
		function(next) {

			self.emit('build', 'new_job');

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

				self.emit('build', 'make_platform');

				// Based on referenced platform
				self.refPlatform.getRootfs({ makeIfDoesNotExists: true }, function(err, refRootfs) {

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

			next();

		},
		function(next) {

			if (!curRootfs) {
				next(new Error('No usable rootfs'));
				return;
			}

			self.emit('build', 'preparing');

			curRootfs.prepareEnvironment(next);

		},
		function(next) {

			// Prepare configuration directory
			stemConfigDir = path.join(curRootfs.targetPath, 'etc', 'Stem');
			fs.mkdir(stemConfigDir, next);
		},
		function(next) {

			// Create directoy to store indexes
			indexPath = path.join(self.refPlatform.archPath, self.refPlatform.platform || self.refPlatform.arch, 'index');
			fs.exists(indexPath, function(exists) {
				if (!exists) {
					fs.mkdir(indexPath, next);
					return;
				}

				// Cache package indexes
				self.emit('configure', 'set_indexes');
				curRootfs.setPackageIndexes(indexPath, function() {
					next();
				});
			});

		},
		function(next) {

			self.emit('build', 'configure_platform', 'overwrite');

			// Apply settings of base
			self.refPlatform.base.applyOverwrite(curRootfs, function() {

				self.emit('build', 'configure_platform', 'services');

				self.refPlatform.base.initiateServices(curRootfs, next);
			});

		},
		function(next) {

			if (!self.settings.settings) {
				next();
				return;
			}

			if (!self.settings.settings.hostname) {
				next();
				return;
			}

			// Write to hostname configuration file
			fs.writeFile(path.join(curRootfs.targetPath, 'etc', 'hostname'), self.settings.settings.hostname, function(err) {
				next(err);
			});
		},
		function(next) {

			if (!self.settings.network) {
				next();
				return;
			}

			// Setting connections
			var networkConfigPath = path.join(stemConfigDir, 'network.json');

			// Writing to configuration file
			fs.writeFile(networkConfigPath, JSON.stringify(self.settings.network), function(err) {
				next();
			});
		},
		function(next) {

			self.emit('build', 'apply_recipes');

			if (!self.settings.recipes) {
				next();
				return;
			}

			// Apply recipes
			var targetPkgDir = path.join(curRootfs.initialDirPath, 'packages');

			async.eachSeries(Object.keys(self.settings.recipes), function(recipeName, cb) {

				self.emit('build', 'apply_recipes', recipeName);

				var recipe = new Recipe(recipeName);
				recipe.init({ arch: self.arch }, function(err) {
					if (err) {
						cb(err);
						return;
					}

					recipes[recipeName] = recipe;

					// Append to package list
					for (var name in recipe.packages) {
						packages[name] = recipe.packages[name];
					}

					// Getting all caches
					var pkgNames = Object.keys(recipe.packageCaches);
					if (pkgNames.length == 0) {
						cb();
						return;
					}
					
					async.eachSeries(pkgNames, function(name, _cb) {

						var cacheFilename = recipe.packageCaches[name];

						// Copying to target rootfs
						var cmd = child_process.spawn('cp', [
							'-a',
							cacheFilename,
							targetPkgDir
						]);

						cmd.on('close', function() {

							_cb();
						});
					}, function() {

						cb();
					});

				});

			}, function(err) {

				if (err) {
					curRootfs.clearEnvironment(function() {
						next(err);
					});

					return;
				}

				next();
			});

		},
		function(next) {

			self.emit('build', 'apply_packages');

			// Apply packages in initial directory
			curRootfs.applyPackages({}, function(err) {
				next(err);
			});

		},
		function(next) {

			if (self.settings.packages) {
				for (var name in self.settings.packages) {
					packages[name] = self.settings.packages[name];
				}
			}

			if (Object.keys(packages).length == 0) {
				next();
				return;
			}

			self.emit('build', 'install_packages');

			// Install packages in config file
			curRootfs.installPackages(packages, {}, function() {

				// Create caches
				async.eachSeries(recipes, function(recipe, cb) {

					recipe.cache({}, function(err) {
						cb();
					});
					
				}, function() {
					next();
				});
			});
		},
		function(next) {

			self.emit('build', 'make_cache');

			// Cache package indexes
			curRootfs.fetchPackageIndexes(indexPath, function() {
				next();
			});
		},
		function(next) {

			self.emit('build', 'overwrite');
			
			// Overwriting specific files from project source
			var overwritePath = path.join(self.projectBasePath, self.projectName, 'overwrite');
			curRootfs.applyOverwrite(overwritePath, next);
		},
		function(next) {

			if (!self.settings.services) {
				next();
				return;
			}

			self.emit('build', 'initiate_services');
			
			// register services
			curRootfs.registerServices(self.settings.services, {}, next);
		},
		function(next) {

			self.emit('build', 'clear');

			curRootfs.clearEnvironment(next);
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

			self.emit('build', 'save');

			// Create a new directory for rootfs
			var cmd = child_process.spawn('mkdir', [
				'-p',
				buildPath
			]);

			cmd.on('close', function() {

				// Moving rootfs to another place for storing
				curRootfs.move(buildPath, next);
			});

		}
	], function(err) {

		job.release(function() {

			self.emit('build', 'complete');

			callback(err, curRootfs || null);
		});
	});
};
