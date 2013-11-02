"use strict";

var Disk = require('../');

var disk = new Disk();

disk.init(function() {

	disk.getBlockDevice('sdb', function(err, device) {
		device.getSize(function(err, size) {
			var availSize = size - 1048576;
			console.log('Available size: ' + availSize);

			console.log('Create Partition ...');
			device.createPartition(1048576, availSize, '0x83', null, {}, function() {
				console.log('Done');
				process.exit();
			});
		});
	});
});
