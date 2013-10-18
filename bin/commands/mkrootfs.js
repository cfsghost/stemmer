"use strict";

if (process.argv.length < 2) {
	console.log('usage: mkrootfs [Project Name]');
	process.exit();
}

var path = require('path');
var async = require('async');

var Arch = require('../lib/arch');
var Job = require('../lib/job');
var Strap = require('../lib/strap');
var RootfsActivator = require('../lib/rootfs_activator');


var strap = new Strap();

var arch = null;
var configPath = null;
var archRootfs = null;
var job = null;
async.series([

	function(next) {

		// Initializing architecture settings
		arch = new Arch();
		arch.arch = 'cubieboard';
		arch.init(function() {
			strap.settings = arch.settings.repo;
			next();
		});
	},
	function(next) {

		// Create a job
		job = new Job();
		job.create(function() {
			next();
		});
	},
	function(next) {

		// Initializing config for making rootfs
		configPath = path.join(job.jobPath, 'multistrap.conf');
		strap.generateBuildConfig(configPath, function() {
			next();
		});
	},
	function(next) {

		// Starting to make a rootfs
		var targetPath = path.join(job.jobPath, 'rootfs');

		strap.build(configPath, targetPath, function(err, rootfs) {
			archRootfs = rootfs;

			next();
		});
	},
	function(next) {

		// Activate rootfs
		var activator = new RootfsActivator(archRootfs);
		activator.configurePackages = true;
		activator.resetRootPassword = true;
		activator.activate(function() {
			next();
		});
	},
	function(next) {
		// Initializing rootfs for specific platform
		arch.initRootfs(archRootfs, next);
	}
], function() {
	console.log('Done');
});
