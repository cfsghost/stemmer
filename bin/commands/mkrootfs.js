"use strict";

if (process.argv.length < 3) {
	console.log('usage: mkrootfs [Project Name]');
	process.exit();
}

var Arch = require('../lib/arch');

var arch = new Arch();
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
