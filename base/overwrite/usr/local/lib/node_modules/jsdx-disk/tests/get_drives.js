"use strict";

var Disk = require('../');

var disk = new Disk();
disk.init(function() {

	disk.getDrives(function(err, drives) {

		console.log(drives);
		process.exit();
	});

});
