"use strict";

var Disk = require('../');

var disk = new Disk();

disk.init(function() {

	disk.getBlockDevice('sdb', function(err, device) {

		console.log('Creating ...');
		device.createPartitionTable('dos', function(err) {

			if (err) {
				console.log(err);
				process.exit();
				return;
			}

			console.log('Done');
			process.exit();
		});
	});
});
