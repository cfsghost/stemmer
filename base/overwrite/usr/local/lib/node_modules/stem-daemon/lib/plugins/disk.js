'usr strict';

var util = require('util');
var events = require('events');
var fs = require('fs');
var JDisk = require('jsdx-disk');
var async = require('async');

var disk = new JDisk();

var Disk = function(pluginMgr) {
	var self = this;

	self.pluginMgr = pluginMgr;
	self.sataDevices = [];
};

util.inherits(Disk, events.EventEmitter);

Disk.prototype.constructor = function(callback) {
	var self = this;

	disk.init(function() {

		// Initializing current devices
		disk.getDrives(function(err, drives) {

			async.eachSeries(drives, function(drive, next) {

				// We only handle ATA devices
				if (drive.connectionBus != 'ata') {
					next();
					return;
				}

				// Getting all block devices, then mount it
				drive.getBlockDevices(function(err, devices) {

					devices.forEach(function(device, index, arr) {

						// Mounted already
						if (device.mountPoints) {

							self.sataDevices.push({
								deviceName: device.deviceName,
								mountPoints: device.mountPoints
							});

							// We only use first harddrive.
							if (device.deviceName != 'sda1') {
								return;
							};

							// Make a link to target
							var mountPath = device.mountPoints[0];
							var targetPath = '/mnt/share/nas';
							async.waterfall([

								function(next) {

									fs.exists(targetPath, function (exists) {

										next(null, exists);
									});
								}, function(exists, next) {

									if (exists) {
										fs.unlink(targetPath, function(err) {
											next();
										});

										return;
									}
								
								}, function(next) {

									// Create a link
									fs.symlink(mountPath, targetPath, function (err) {
										if (err) {
											next();
											return;
										} 

										fs.chown(mountPath, 1001, 1001);
										fs.chmod(mountPath, '777');
										fs.chown('/mnt/share/nas', 1001, 1001);
										fs.chmod('/mnt/share/nas', '777');

										next();
									});	
								}
							], function() {
								console.log('successfully created nas folder.');
							});

							return;
						}
							
						// Mount all
						device.mount(function(err, mountPoint) {

							self.sataDevices.push({
								deviceName: device.deviceName,
								mountPoints: [ mountPoint ]
							});
						});
					});

				});
			}, function() {

				callback();
			});
		});

		// Listen to event
		disk.on('BlockDeviceAdded', self.blockDeviceAddedHandler.bind(self));
		disk.on('BlockDeviceRemoved', self.blockDeviceRemovedHandler.bind(self));

	});
};

Disk.prototype.blockDeviceAddedHandler = function(deviceName) {
	var self = this;

	disk.getBlockDevice(deviceName, function(err, device) {
		if (err)
			return;

		device.getDrive(function(err, drive) {
			if (err)
				return;

			// Mount removable device automatically
			if (!drive.removable)
				return;

			device.mount(function(err, mountPoint) {
				if (err)
					return;

				console.log('Mounted on ' + mountPoint);

				self.emit('MountPointAdded', mountPoint, device);

				// Run application automatically
				self.pluginMgr.plugins['Embryo'].launch(mountPoint, {}, function() {
					console.log('Running');
				});
			});
		});
	});
};

Disk.prototype.blockDeviceRemovedHandler = function(deviceName) {
	var self = this;
};

// Metadata
module.exports = {
	name: 'Disk',
	prototype: Disk
};
