"use strict";

var util = require('util');
var events = require('events');
var PluginManager = require('./plugin-manager');

var StemDaemon = module.exports = function() {
	var self = this;

	self.pluginManager = new PluginManager();
};

util.inherits(StemDaemon, events.EventEmitter);

StemDaemon.prototype.init = function(callback) {
	var self = this;

	// Load all plugin symbols
	self.pluginManager.scanAll(function() {

		// Initializing plugins
		self.pluginManager.runAll(function() {

			callback(null);
		});
	});

	// Pumper
	setInterval(function() {}, 1000);
};
