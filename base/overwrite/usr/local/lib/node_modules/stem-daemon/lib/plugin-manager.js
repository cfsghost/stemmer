"use strict";

var fs = require('fs');
var path = require('path');

var Array = require('node-array');

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

			files.forEachAsync(function(pluginFile, index, arr, next) {

				self.load(path.join(pluginDir, pluginFile), next);

				return true;

			}, callback);

		});
	});
};

PluginManager.prototype.scanAll = function(complete) {
	var self = this;

	self.pluginDirs.forEachAsync(function(pluginDir, index, dirs, next) {

		self.loadAll(pluginDir, next);

		return true;
	}, complete);
};

PluginManager.prototype.runAll = function(complete) {
	var self = this;

	Object.keys(self.pluginSymbols).forEachAsync(function(symbol, index, symbols, next) {
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

