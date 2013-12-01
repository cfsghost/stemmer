'usr strict';

var path = require('path');
var fs = require('fs');
var async = require('async');
var ConnMan = require('jsdx-connman');

var Network = function(pluginMgr) {
	var self = this;

	self.pluginMgr = pluginMgr;
	self.configPath = path.join('/', 'etc', 'Stem', 'network.json');
	self.config = {};
	self.connman = new ConnMan();
	self.services = {};
};

Network.prototype.constructor = function(callback) {
	var self = this;

	async.series([

		function(next) {

			// Initializing connection manager
			self.connman.init(function() {

				// Getting available services
				self.connman.getServices(function(err, services) {

					self.services = services;
					next();
				});
			});
		},
		function(next) {

			fs.exists(self.configPath, function(exists) {

				if (!exists) {
					next(false);
				} else {
					next();
				}
			});
		}, 
		function(next) {

			// Reading configuration file
			fs.readFile(self.configPath, function(err, data) {

				try {
					var config = JSON.parse(data.toString());
					if (!config.connections)
						throw new Error('No connection');

					self.config = config;

					next();

				} catch(e) {
					next(e);
				}
			});
		}, function(next) {

			// Iterate services
			async.eachSeries(Object.keys(self.services), function(serviceName, _next) {
				var service = self.services[serviceName]

				self.applyConfiguration(service, function() {
					_next();
				});

			}, function(err) {

				next();
			});
		}

	], function(err) {

		callback();
	});
};

Network.prototype.applyConfiguration = function(service, callback) {
	var self = this;

	// Finding configuration for this service
	async.eachSeries(Object.keys(self.config.connections), function(connName, next) {

		var connConfig = self.config.connections[connName];

		// doesn't match
		if (service.Type == connConfig.type && service.Ethernet.Interface != connConfig.inet) {
			next();
			return;
		}

		// Apply
		self.connman.getConnection(service.serviceName, function(err, conn) {
			if (err) {
				next();
				return;
			}

			conn.setConfiguration({
				method: connConfig.method || null,
				ipaddress: connConfig.address || null,
				netmask: connConfig.netmask || null
			}, function() {

				next(true);
			});
		});

	}, function(err) {
		callback(null);
	});
};

// Metadata
module.exports = {
	name: 'Network',
	prototype: Network
};
