"use strict";

var Disk = require('../');

var disk = new Disk();

disk.init(function() {

	disk.getObjects(function(err, objects) {
		console.log(objects);

		process.exit();
	});
});
