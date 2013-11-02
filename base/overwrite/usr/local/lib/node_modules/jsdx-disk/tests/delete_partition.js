"use strict";

var Disk = require('../');

var disk = new Disk();

disk.init(function() {

	disk.getBlockDevice('sdb1', function(err, device) {

		console.log('Delete Partition ...');
		device.deletePartition(function() {
			console.log('Done');
			process.exit();
		});
	});
});
