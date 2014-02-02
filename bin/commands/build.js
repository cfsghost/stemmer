"use strict";

if (process.argv.length < 3) {
	console.log('usage: build [Project Name]');
	process.exit();
}

var colors = require('colors');
var Project = require('../lib/project');

var project = new Project();

project.on('build', function(state, task) {

	var message = [];

	for (var index in arguments) {
		message.push(arguments[index]);
	}

	console.log('[STEMMER] '.cyan + message.join(' '));
});

project.load(process.argv[2], function(err) {
	if (err) {
		console.log(err);
		process.exit();
		return;
	}

	project.build({}, function(err) {
		if (err) {
			console.log(err);
			return;
		}
		console.log('Done');
	});
})

