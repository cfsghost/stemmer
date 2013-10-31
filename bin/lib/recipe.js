"use strict";

var path = require('path');
var fs = require('fs');
var async = require('async');

var Recipe = module.exports = function(name) {
	var self = this;

	self.name = name || null;
	self.recipePath = path.join(__dirname, '..', '..', 'recipes', name);
	self.pkgsPath = path.join(self.recipePath, 'packages');
	self.packages = null;
	self.packageCaches = null;
	self.aptCacherPath = path.join('/', 'var', 'cache', 'apt-cacher', 'packages');
};

Recipe.prototype.init = function(opts, callback) {
	var self = this;

	async.series([
		function(next) {
			fs.exists(self.recipePath, function(exists) {
				if (!exists) {
					next(new Error('No such recipe \"' + item + '\"'));
					return;
				}

				next();
			});
		},
		function(next) {

			// Read package configuration file
			fs.readFile(path.join(self.recipePath, 'packages.json'), function(err, data) {
				if (err) {
					next(err);
					return;
				}

				self.packages = JSON.parse(data);
				self.packageCaches = {};

				next();
			});
		},
		function(next) {

			if (self.packages == null) {
				next();
				return;
			}

			// Check existed deb files
			fs.exists(self.pkgsPath, function(exists) {

				if (!exists) {

					next();
					return;
				}

				// Finding deb caches
				async.eachSeries(Object.keys(self.packages), function(name, cb) {

					// Ignore package if it doesn't specific version
					if (self.packages[name] == '*') {
						cb();
						return;
					}

					var files = [
						path.join(self.pkgsPath, name + '_' + self.packages[name].split(':')[1] + '_' + opts.arch + '.deb'),
						path.join(self.pkgsPath, name + '_' + self.packages[name].split(':')[1] + '_all.deb')
					];

					async.eachSeries(files, function(filename, _cb) {

						fs.exists(filename, function(exists) {

							if (!exists) {
								_cb();
								return;
							}

							self.packageCaches[name] = filename;

							_cb(true);
						});
					}, function(found) {

						cb();
					});
				}, function() {
					next();
				});
			});
		}

	], function(err) {
		callback(err);
	});
};

Recipe.prototype.cache = function(opts, callback) {
	var self = this;

	async.series([
		function(next) {

			// Create cache directory
			fs.exists(self.pkgsPath, function(exists) {

				if (!exists) {
					fs.mkdir(targetPath, function(err) {
						next(err);
					});
					return;
				}

				next();
			});
		},
		function(next) {

			// Cache packages
			async.eachSeries(Object.keys(self.packages), function(packageName, cb) {

				// Skip if package file exists already
				if (self.packageCaches[packageName]) {
					cb();
					return;
				}

				self.cacheOne(packageName, {}, function(success) {
					cb();
				});
				
			}, function() {
				cb();
			});
		}
	], function(err) {

		callback(err);
	});
};

Recipe.prototype.cacheOne = function(pkgName, opts, callback) {
	var self = this;

	var files = [
		path.join(self.aptCacherPath, name + '_' + pkgs[name].split(':')[1] + '_' + self.arch + '.deb'),
		path.join(self.aptCacherPath, name + '_' + pkgs[name].split(':')[1] + '_all.deb')
	];

	async.eachSeries(files, function(filename, next) {

		fs.exists(filename, function(exists) {

			if (!exists) {
				next();
				return;
			}

			// Copying to target rootfs
			var cmd = child_process.spawn('cp', [
				'-a',
				filename,
				self.pkgsPath
			]);

			cmd.on('close', function() {

				next(true);
			});
		});
	}, function(success) {
		callback();
	});
};
