"use strict";

var Disk = require('../');

var disk = new Disk();
disk.init(function() {

	disk.getBlockDevice('sda', function(err, device) {

		device.partitionTableExists(function(exists) {
			console.log(exists ? 'sda has patition table' : 'sda doesn\'t have partition table');
			process.exit();
		})
	});

});
