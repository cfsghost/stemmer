"use strict";

var Disk = require('../');

var disk = new Disk();
disk.init(function() {

	disk.getBlockDevice('sda1', function(err, device) {

		device.getSize(function(err, size) {
			console.log(size);
			process.exit();
		});
	});

});
