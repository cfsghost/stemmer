"use strict";

var fs = require('fs');
var path = require('path');
var async = require('async');

var PluginManager = module.exports = function() {
	var self = this;

	self.pluginDirs = [ path.join(__dirname, 'plugins') ];
	self.pluginSymbols = {};
	self.plugins = {};
};

PluginManager.prototype.load = function(pluginPath, complete) {
	var self = this;

	try {
		var plugin = require(pluginPath);

		if (!plugin.name) {
			throw new Error('Not a valid stem-daemon plugin');
		}

		self.pluginSymbols[plugin.name] = plugin;

	} catch(e) {

		process.nextTick(function() {
			complete(e);
		});

		return;
	}

	process.nextTick(function() {
		complete(null);
	});
};

PluginManager.prototype.loadAll = function(pluginDir, callback) {
	var self = this;

	fs.exists(pluginDir, function(exists) {
		if (!exists) {
			callback();
			return;
		}

		/* Getting file list in specific directory */
		fs.readdir(pluginDir, function(err, files) {

			async.each(files, function(pluginFile, next) {

				self.load(path.join(pluginDir, pluginFile), next);

			}, callback);

		});
	});
};

PluginManager.prototype.scanAll = function(complete) {
	var self = this;

	async.each(self.pluginDirs, function(pluginDir, next) {

		self.loadAll(pluginDir, next);

	}, complete);
};

PluginManager.prototype.runAll = function(complete) {
	var self = this;

	async.each(Object.keys(self.pluginSymbols), function(symbol, next) {
		var PluginClass = self.pluginSymbols[symbol].prototype;

		// Create plugin instance
		var plugin = new PluginClass();
		plugin.constructor(function() {

			self.plugins[PluginClass.name] = plugin;

			next();
		});
		
		return true;
	}, complete);
};

