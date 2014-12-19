"use strict";

if (process.argv.length < 3) {
	console.log('usage: mkrootfs [Platform]');
	process.exit();
}

var Arch = require('../lib/arch');

var arch = new Arch();

arch.on('make', function(state) {
	console.log(state);
});

arch.on('configure', function(state, task) {
	if (!task)
		console.log(state);
	else
		console.log(state + ' ' + task);
});

arch.platform = process.argv[2];
arch.init(function(err) {
	if (err) {
		console.log(err);
		process.exit();
	}

	arch.makeRootfs(function() {
		console.log('Done');
	});
});
