"use strict";

if (process.argv.length < 3) {
	console.log('usage: build [Project Name]');
	process.exit();
}

var Project = require('../lib/project');

var project = new Project();

project.load(process.argv[2], function(err) {
})

