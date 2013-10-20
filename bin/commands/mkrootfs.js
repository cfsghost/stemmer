"use strict";

if (process.argv.length < 2) {
	console.log('usage: mkrootfs [Project Name]');
	process.exit();
}

var Arch = require('../lib/arch');

var arch = new Arch();
arch.arch = 'armhf';
arch.init(function(err) {
	if (err) {
		console.log(err);
		process.exit();
	}

	arch.makeRootfs(function() {
		console.log('Done');
	});
});
