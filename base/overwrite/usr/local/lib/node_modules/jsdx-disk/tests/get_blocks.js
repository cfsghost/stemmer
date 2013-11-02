"use strict";

var Disk = require('../');

var disk = new Disk();
disk.init(function() {

	disk.getDrives(function(err, drives) {

		for (var index in drives) {
			drives[index].getBlockDevices(function(err, devices) {

				console.log(devices);
			});
		}

	});

});
