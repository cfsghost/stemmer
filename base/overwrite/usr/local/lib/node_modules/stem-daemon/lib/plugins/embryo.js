'usr strict';

var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var async = require('async');

var Embryo = function(pluginMgr) {
	var self = this;

	self.pluginMgr = pluginMgr;
	self.appDir = path.join('/', 'app');
};

Embryo.prototype.constructor = function(callback) {
	var self = this;

	// Check application directory
	fs.exists(self.appDir, function(exists) {
		if (!exists) {
			fs.mkdir(self.appDir, function(err) {
				callback();
			});
			return;
		}

		// Launch all applications automatically
		fs.readdir(self.appDir, function(err, files) {

			async.eachSeries(files, function(appFile, next) {

				// Launch
				self.launch(path.join(self.appDir, appFile), {}, function() {
					next();
				});

			}, function() {
				callback();
			});
		});
	});
};

Embryo.prototype.launch = function(appPath, opts, callback) {
	var self = this;

	// TODO: setting permission
	var app = child_process.fork(appPath);

	process.nextTick(callback);
};

// Metadata
module.exports = {
	name: 'Embryo',
	prototype: Embryo
};
