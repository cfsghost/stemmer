"use strict";

var Disk = require('../');

var disk = new Disk();
disk.init(function() {

	disk.getBlockDevice('sdb1', function(err, device) {

		device.unmount({}, function(err) {
			console.log('Unmounted');
			process.exit();
		});
	});

});
