"use strict";

var path = require('path');
var async = require('async');
var BlockDevice = require('./block_device');

var Drive = module.exports = function(disk) {
	var self = this;

	self._disk = disk;

	// Properties
	self.objectPath = null;
	self.id = null;
	self.serial = null;
	self.model = null;
	self.vendor = null;
	self.wwn = null;
	self.revision = null;
	self.removable = false;
	self.ejectable = false;
	self.mediaRemovable = false;
	self.mediaAvailable = false;
	self.connectionBus = null;
};

Drive.prototype.getBlockDevices = function(callback) {
	var self = this;

	self._disk.getObjects(function(err, objects) {

		var devices = [];

		// Getting all block devices
		var objPaths = Object.keys(objects);
		async.eachSeries(objPaths, function(objPath, next) {

			var object = objects[objPath];
			if (!object['org.freedesktop.UDisks2.Block']) {
				next();
				return;
			}

			var blockInterface = object['org.freedesktop.UDisks2.Block'] || null;
			if (!blockInterface) {
				next();
				return;
			}

			if (blockInterface['Drive'] != self.objectPath) {
				next();
				return;
			}

			// Initializing block device
			var device = new BlockDevice(self._disk);
			device.id = blockInterface.Id;
			device.deviceName = path.basename(objPath);
			device.objectPath = objPath;

			// Getting mount points
			if (object['org.freedesktop.UDisks2.Filesystem']) {
				device.mountPoints = [];

				var mountPoints = object['org.freedesktop.UDisks2.Filesystem'].MountPoints;
				for (var index in mountPoints) {
					mountPoints[index].length--;

					var buffer = new Buffer(mountPoints[index]);

					device.mountPoints.push(buffer.toString());
				}
			}

			// Initializing interfaces
			var interfaceNames = Object.keys(object);
			device.initInterfaces(interfaceNames, function() {

				devices.push(device);

				next();
			});

		}, function() {

			if (callback)
				callback.apply(self, [ null, devices ]);
		});
	});
};
