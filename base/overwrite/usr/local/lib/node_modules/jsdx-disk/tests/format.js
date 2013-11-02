"use strict";

var Disk = require('../');

var disk = new Disk();

disk.init(function() {

	disk.getBlockDevice('sdb1', function(err, device) {

		console.log('Formating ...');
		device.format('ext4', function(err) {

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
