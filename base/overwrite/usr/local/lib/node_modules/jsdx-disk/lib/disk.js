"use strict";

var util = require('util');
var events = require('events');
var path = require('path');
var DBus = require('dbus');

var Drive = require('./drive');
var BlockDevice = require('./block_device');

var dbus = new DBus();

var Disk = module.exports = function() {
	var self = this;

	self.dbus = dbus;
	self.systemBus = null;
	self.manager = null;
};

util.inherits(Disk, events.EventEmitter);

Disk.prototype.init = function(callback) {
	var self = this;

	self.systemBus = dbus.getBus('system');
	self.systemBus.getInterface(
		'org.freedesktop.UDisks2',
		'/org/freedesktop/UDisks2',
		'org.freedesktop.DBus.ObjectManager',
		function(err, iface) {
			if (err) {
				callback(err);
				return;
			}

			self.manager = iface;

			// Interfaces Added Event
			iface.on('InterfacesAdded', function(objectPath, data) {

				if (objectPath.search('/org/freedesktop/UDisks2/jobs') == 0) {
					self.emit('JobAdded', path.basename(objectPath), data['org.freedesktop.UDisks2.Job']);
					return;
				}

				// Drive
				if (objectPath.search('/org/freedesktop/UDisks2/drives') == 0) {
					self.emit('DriveAdded', path.basename(objectPath), data);
					return;
				}

				// Block Device
				if (objectPath.search('/org/freedesktop/UDisks2/block_devices') == 0) {
					self.emit('BlockDeviceAdded', path.basename(objectPath), data);
					return;
				}
			});

			// Interfaces Removed Event
			iface.on('InterfacesRemoved', function(objectPath, data) {

				if (objectPath.search('/org/freedesktop/UDisks2/jobs') == 0) {
					self.emit('JobRemoved', path.basename(objectPath), data);
					return;
				}

				// Drive
				if (objectPath.search('/org/freedesktop/UDisks2/drives') == 0) {
					self.emit('DriveRemoved', path.basename(objectPath), data);
					return;
				}

				// Block Device
				if (objectPath.search('/org/freedesktop/UDisks2/block_devices') == 0) {
					self.emit('BlockDeviceRemoved', path.basename(objectPath), data);
					return;
				}
			});

			if (callback)
				callback();
		});
};

Disk.prototype.getObjects = function(callback) {
	var self = this;

	self.manager.GetManagedObjects['timeout'] = 10000;
	self.manager.GetManagedObjects['finish'] = function(objects) {

		if (callback)
			callback.apply(self, [ null, objects ]);
	};
	self.manager.GetManagedObjects();
};

Disk.prototype.getDrives = function(callback) {
	var self = this;

	self.getObjects(function(err, objects) {

		var drives = [];
		for (var objPath in objects) {

			if (objPath.search('/org/freedesktop/UDisks2/drives') == 0) {
				var obj = objects[objPath]['org.freedesktop.UDisks2.Drive'];

				// Creating drive object
				var drive = new Drive(self);
				drive.objectPath = objPath;
				drive.id = obj.Id;
				drive.serial = obj.Serial;
				drive.model = obj.Model;
				drive.vendor = obj.Vendor;
				drive.wwn = obj.WWN;
				drive.revision = obj.Revision;
				drive.removable = obj.Removable;
				drive.ejectable = obj.Ejectable;
				drive.mediaRemovable = obj.MediaRemovable;
				drive.mediaAvailable = obj.MediaAvailable;

				if (objects[objPath]['org.freedesktop.UDisks2.Drive.Ata'])
					drive.connectionBus = 'ata';
				else
					drive.connectionBus = obj.ConnectionBus;

				drives.push(drive);
			}
		}

		if (callback)
			callback.apply(self, [ null, drives ]);
	});
};

Disk.prototype.getDrive = function(driveName, callback) {
	var self = this;

	if (!driveName) {
		if (callback)
			process.nextTick(function() {
				callback(new Error('Require drive name'));
			});

		return;
	}

	var targetObjectPath = '/org/freedesktop/UDisks2/drives/' + driveName;

	self.systemBus.getInterface(
		'org.freedesktop.UDisks2',
		targetObjectPath,
		'org.freedesktop.UDisks2.Drive',
		function(err, iface) {
			if (err) {
				callback(err);
				return;
			}

			iface.getProperties(function(props) {

				// Creating drive object
				var drive = new Drive(self);
				drive.objectPath = targetObjectPath;
				drive.id = props.Id;
				drive.serial = props.Serial;
				drive.model = props.Model;
				drive.vendor = props.Vendor;
				drive.wwn = props.WWN;
				drive.revision = props.Revision;
				drive.removable = props.Removable;
				drive.ejectable = props.Ejectable;
				drive.mediaRemovable = props.MediaRemovable;
				drive.mediaAvailable = props.MediaAvailable;
				drive.connectionBus = props.ConnectionBus;

				if (drive.connectionBus != '') {
					callback(null, drive);
					return;
				}

				// It might be ATA device
				self.systemBus.getInterface(
					'org.freedesktop.UDisks2',
					targetObjectPath,
					'org.freedesktop.UDisks2.Drive.Ata',
					function(err, iface) {
						if (!err)
							drive.connectionBus = 'ata';

						callback(null, drive);
					});

			});

		});
};

Disk.prototype.getBlockDevice = function(deviceName, callback) {
	var self = this;

	if (!deviceName) {
		if (callback)
			process.nextTick(function() {
				callback(new Error('Require device name'));
			});

		return;
	}

	var targetObjectPath = '/org/freedesktop/UDisks2/block_devices/' + deviceName;

	// Finding target object
	self.getObjects(function(err, objects) {

		for (var objPath in objects) {

			if (objPath != targetObjectPath)
				continue;

			var object = objects[objPath];
			if (!object['org.freedesktop.UDisks2.Block']) {
				callback(new Error('Not block device'));
				return;
			}

			var blockInterface = object['org.freedesktop.UDisks2.Block'] || null;
			if (!blockInterface) {
				callback(new Error('Not block device'));
				return;
			}

			// Initializing block device
			var device = new BlockDevice(self);
			device.id = blockInterface.Id;
			device.deviceName = deviceName;
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

				if (callback)
					callback(null, device);

			});

			return;		
		}
	});
};
