"use strict";

var Disk = require('../');

var disk = new Disk();
disk.init(function() {

	disk.on('DriveAdded', function(objectPath, data) {
		console.log('===');
		console.log('GOT EVENT: DriveAdded');
		console.log(objectPath);
		console.log(data);
	});

	disk.on('BlockDeviceAdded', function(objectPath, data) {
		console.log('===');
		console.log('GOT EVENT: BlockDeviceAdded');
		console.log(objectPath);
		console.log(data);
	});

	disk.on('DriveRemoved', function(objectPath, data) {
		console.log('===');
		console.log('GOT EVENT: DriveRemoved');
		console.log(objectPath);
		console.log(data);
	});

	disk.on('BlockDeviceRemoved', function(objectPath, data) {
		console.log('===');
		console.log('GOT EVENT: BlockDeviceRemoved');
		console.log(objectPath);
		console.log(data);
	});
});
