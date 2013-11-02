"usr strict";

var JDisk = require('jsdx-disk');

var disk = new JDisk();

var Disk = function() {
	var self = this;

	self.sataDevices = [];
};

Disk.prototype.constructor = function(callback) {
	var self = this;

	disk.init(function() {

		// Initializing current devices
		disk.getDrives(function(err, drives) {

			for (var index in drives) {

				var drive = drives[index];

				// We only handle ATA devices
				if (drive.connectionBus != 'ata')
					continue;

				// Getting all block devices, then mount it
				drive.getBlockDevices(function(err, devices) {

					devices.forEach(function(device, index, arr) {

						// Mounted already
						if (device.mountPoints) {

							self.sataDevices.push({
								deviceName: device.deviceName,
								mountPoints: device.mountPoints
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
			}

			callback();
		});

		// Listen to event
		disk.on('BlockDeviceAdded', self.blockDeviceAddedHandler);
		disk.on('BlockDeviceRemoved', self.blockDeviceRemovedHandler);

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
